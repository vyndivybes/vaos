create table if not exists vaos_private.execution_jobs (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null unique references vaos_private.intents(id),
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING'
    check (status in ('PENDING','LEASED','FAILED','SUCCEEDED','DEAD_LETTER')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  lease_token uuid,
  leased_by text,
  leased_until timestamptz,
  last_error jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table vaos_private.execution_jobs enable row level security;

create table if not exists vaos_private.execution_effects (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references vaos_private.execution_jobs(id),
  intent_id uuid not null references vaos_private.intents(id),
  action_type text not null,
  adapter_id text not null,
  effect jsonb not null,
  applied_at timestamptz not null default now()
);
alter table vaos_private.execution_effects enable row level security;

create table if not exists vaos_private.execution_evidence (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references vaos_private.execution_jobs(id),
  intent_id uuid not null references vaos_private.intents(id),
  adapter_id text not null,
  verification jsonb not null,
  verified_at timestamptz not null default now()
);
alter table vaos_private.execution_evidence enable row level security;

create index if not exists vaos_execution_jobs_ready_idx
  on vaos_private.execution_jobs (status, available_at, created_at);
create index if not exists vaos_execution_jobs_lease_idx
  on vaos_private.execution_jobs (status, leased_until);

create or replace function vaos_private.enqueue_execution(p_intent_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = vaos_private, pg_temp
as $$
declare
  v_intent vaos_private.intents%rowtype;
  v_job_id uuid;
begin
  select * into v_intent from vaos_private.intents where id = p_intent_id;
  if v_intent.id is null then
    raise exception 'INTENT_NOT_FOUND';
  end if;
  if v_intent.status not in ('AUTHORIZED','APPROVED') then
    raise exception 'INTENT_NOT_EXECUTABLE';
  end if;

  insert into vaos_private.execution_jobs(intent_id, action_type, payload)
  values(v_intent.id, v_intent.action_type, v_intent.payload)
  on conflict (intent_id) do nothing
  returning id into v_job_id;

  if v_job_id is null then
    select id into v_job_id from vaos_private.execution_jobs where intent_id = v_intent.id;
  end if;
  return v_job_id;
end;
$$;

create or replace function public.vaos_submit_intent(
  p_server_key text,
  p_idempotency_key text,
  p_request_hash text,
  p_agent_id text,
  p_action_type text,
  p_risk text,
  p_reason text,
  p_payload jsonb,
  p_authority smallint,
  p_result jsonb,
  p_event_type text
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_intent vaos_private.intents%rowtype;
  v_approval_id uuid;
  v_execution_job_id uuid;
  v_status text := p_result->>'status';
begin
  perform vaos_private.assert_server_key(p_server_key);

  insert into vaos_private.intents
    (idempotency_key,request_hash,agent_id,action_type,risk,reason,payload,authority,status,result)
  values
    (p_idempotency_key,p_request_hash,p_agent_id,p_action_type,p_risk,p_reason,
     coalesce(p_payload,'{}'::jsonb),p_authority,v_status,p_result)
  on conflict (idempotency_key) do nothing
  returning * into v_intent;

  if v_intent.id is null then
    select * into v_intent from vaos_private.intents where idempotency_key=p_idempotency_key;
    if v_intent.request_hash <> p_request_hash then
      return jsonb_build_object('outcome','CONFLICT');
    end if;
    select id into v_approval_id from vaos_private.approvals where intent_id=v_intent.id;
    select id into v_execution_job_id from vaos_private.execution_jobs where intent_id=v_intent.id;
    return jsonb_build_object(
      'outcome','REPLAY',
      'intent',jsonb_build_object('id',v_intent.id,'status',v_intent.status,'result',v_intent.result),
      'approvalId',v_approval_id,
      'executionJobId',v_execution_job_id
    );
  end if;

  if v_status='AWAIT_APPROVAL' then
    insert into vaos_private.approvals(intent_id,agent_id,action_type,risk,authority,reason)
    values(v_intent.id,p_agent_id,p_action_type,p_risk,p_authority,p_reason)
    returning id into v_approval_id;
  elsif v_status='AUTHORIZED' then
    v_execution_job_id := vaos_private.enqueue_execution(v_intent.id);
  end if;

  insert into vaos_private.events(type,source,payload)
  values(
    p_event_type,p_agent_id,
    jsonb_build_object('intentId',v_intent.id,'approvalId',v_approval_id,
      'executionJobId',v_execution_job_id,'actionType',p_action_type,
      'risk',p_risk,'authority',p_authority,'status',v_status)
  );

  if v_execution_job_id is not null then
    insert into vaos_private.events(type,source,payload)
    values('EXECUTION.QUEUED',p_agent_id,
      jsonb_build_object('intentId',v_intent.id,'executionJobId',v_execution_job_id,'actionType',p_action_type));
  end if;

  return jsonb_build_object(
    'outcome','CREATED',
    'intent',jsonb_build_object('id',v_intent.id,'status',v_intent.status,'result',v_intent.result),
    'approvalId',v_approval_id,
    'executionJobId',v_execution_job_id
  );
end;
$$;

create or replace function public.vaos_decide_approval(
  p_server_key text,
  p_approval_id text,
  p_decision text,
  p_decided_by text
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_approval vaos_private.approvals%rowtype;
  v_decision text := upper(coalesce(p_decision,''));
  v_execution_job_id uuid;
begin
  perform vaos_private.assert_server_key(p_server_key);
  if v_decision not in ('APPROVED','REJECTED') then raise exception 'INVALID_APPROVAL_DECISION'; end if;

  select * into v_approval from vaos_private.approvals where id::text=p_approval_id for update;
  if v_approval.id is null then return jsonb_build_object('outcome','NOT_FOUND'); end if;

  if v_approval.status <> 'PENDING' then
    select id into v_execution_job_id from vaos_private.execution_jobs where intent_id=v_approval.intent_id;
    if v_approval.status=v_decision and v_approval.decided_by=p_decided_by then
      return jsonb_build_object('outcome','REPLAY','approval',
        jsonb_build_object('id',v_approval.id,'status',v_approval.status,'decidedBy',v_approval.decided_by),
        'executionJobId',v_execution_job_id);
    end if;
    return jsonb_build_object('outcome','CONFLICT');
  end if;

  update vaos_private.approvals
  set status=v_decision,decided_at=now(),decided_by=p_decided_by
  where id=v_approval.id returning * into v_approval;

  update vaos_private.intents
  set status=v_decision,updated_at=now(),
      result=result || jsonb_build_object('approvalDecision',v_decision,'decidedBy',p_decided_by)
  where id=v_approval.intent_id;

  if v_decision='APPROVED' then
    v_execution_job_id := vaos_private.enqueue_execution(v_approval.intent_id);
  end if;

  insert into vaos_private.events(type,source,payload)
  values('GOVERNANCE.APPROVAL_DECIDED',p_decided_by,
    jsonb_build_object('approvalId',v_approval.id,'intentId',v_approval.intent_id,
      'executionJobId',v_execution_job_id,'actionType',v_approval.action_type,'decision',v_decision));

  if v_execution_job_id is not null then
    insert into vaos_private.events(type,source,payload)
    values('EXECUTION.QUEUED',p_decided_by,
      jsonb_build_object('intentId',v_approval.intent_id,'executionJobId',v_execution_job_id,
        'actionType',v_approval.action_type));
  end if;

  return jsonb_build_object('outcome','DECIDED','approval',
    jsonb_build_object('id',v_approval.id,'status',v_approval.status,'decidedBy',v_approval.decided_by),
    'executionJobId',v_execution_job_id);
end;
$$;

create or replace function public.vaos_claim_execution(
  p_server_key text,
  p_worker_id text,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_job vaos_private.execution_jobs%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);

  update vaos_private.execution_jobs
  set status='DEAD_LETTER',
      lease_token=null,
      leased_by=null,
      leased_until=null,
      last_error=jsonb_build_object('code','LEASE_EXPIRED_MAX_ATTEMPTS','retryable',false),
      updated_at=now()
  where status='LEASED'
    and leased_until < now()
    and attempt_count >= max_attempts;

  select * into v_job
  from vaos_private.execution_jobs
  where (
    (status in ('PENDING','FAILED') and available_at <= now())
    or (status='LEASED' and leased_until < now())
  )
  and attempt_count < max_attempts
  order by available_at, created_at
  for update skip locked
  limit 1;

  if v_job.id is null then return null; end if;

  update vaos_private.execution_jobs
  set status='LEASED',
      attempt_count=attempt_count+1,
      lease_token=gen_random_uuid(),
      leased_by=p_worker_id,
      leased_until=now() + make_interval(secs => greatest(30, least(600, p_lease_seconds))),
      updated_at=now()
  where id=v_job.id
  returning * into v_job;

  insert into vaos_private.events(type,source,payload)
  values('EXECUTION.CLAIMED',p_worker_id,
    jsonb_build_object('executionJobId',v_job.id,'intentId',v_job.intent_id,
      'actionType',v_job.action_type,'attempt',v_job.attempt_count,'workerId',p_worker_id));

  return jsonb_build_object(
    'id',v_job.id,
    'intentId',v_job.intent_id,
    'actionType',v_job.action_type,
    'payload',v_job.payload,
    'attemptCount',v_job.attempt_count,
    'maxAttempts',v_job.max_attempts,
    'leaseToken',v_job.lease_token,
    'leasedUntil',v_job.leased_until
  );
end;
$$;

create or replace function public.vaos_complete_execution(
  p_server_key text,
  p_job_id text,
  p_lease_token text,
  p_adapter_id text,
  p_effect jsonb,
  p_verification jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_job vaos_private.execution_jobs%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);

  select * into v_job from vaos_private.execution_jobs where id::text=p_job_id for update;
  if v_job.id is null then return jsonb_build_object('outcome','NOT_FOUND'); end if;
  if v_job.status='SUCCEEDED' then return jsonb_build_object('outcome','REPLAY','jobId',v_job.id); end if;
  if v_job.status <> 'LEASED' or v_job.lease_token::text <> p_lease_token then
    return jsonb_build_object('outcome','CONFLICT','jobId',v_job.id);
  end if;
  if coalesce((p_verification->>'verified')::boolean,false) is not true then
    return jsonb_build_object('outcome','VERIFICATION_REQUIRED','jobId',v_job.id);
  end if;

  insert into vaos_private.execution_effects(job_id,intent_id,action_type,adapter_id,effect)
  values(v_job.id,v_job.intent_id,v_job.action_type,p_adapter_id,p_effect)
  on conflict (job_id) do nothing;

  insert into vaos_private.execution_evidence(job_id,intent_id,adapter_id,verification)
  values(v_job.id,v_job.intent_id,p_adapter_id,p_verification)
  on conflict (job_id) do nothing;

  update vaos_private.execution_jobs
  set status='SUCCEEDED',
      lease_token=null,leased_by=null,leased_until=null,
      result=jsonb_build_object('adapterId',p_adapter_id,'effect',p_effect,'verification',p_verification),
      updated_at=now()
  where id=v_job.id;

  update vaos_private.intents
  set status='EXECUTED',
      updated_at=now(),
      result=result || jsonb_build_object(
        'effectExecuted',true,'executionJobId',v_job.id,'adapterId',p_adapter_id)
  where id=v_job.intent_id;

  insert into vaos_private.events(type,source,payload)
  values('EXECUTION.SUCCEEDED',p_adapter_id,
    jsonb_build_object('executionJobId',v_job.id,'intentId',v_job.intent_id,'actionType',v_job.action_type));

  insert into vaos_private.events(type,source,payload)
  values('EVIDENCE.VERIFIED',p_adapter_id,
    jsonb_build_object('executionJobId',v_job.id,'intentId',v_job.intent_id,
      'actionType',v_job.action_type,'verification',p_verification));

  return jsonb_build_object('outcome','SUCCEEDED','jobId',v_job.id);
end;
$$;

create or replace function public.vaos_fail_execution(
  p_server_key text,
  p_job_id text,
  p_lease_token text,
  p_error jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_job vaos_private.execution_jobs%rowtype;
  v_retryable boolean := coalesce((p_error->>'retryable')::boolean,true);
  v_outcome text;
begin
  perform vaos_private.assert_server_key(p_server_key);

  select * into v_job from vaos_private.execution_jobs where id::text=p_job_id for update;
  if v_job.id is null then return jsonb_build_object('outcome','NOT_FOUND'); end if;
  if v_job.status='SUCCEEDED' then return jsonb_build_object('outcome','REPLAY','jobId',v_job.id); end if;
  if v_job.status <> 'LEASED' or v_job.lease_token::text <> p_lease_token then
    return jsonb_build_object('outcome','CONFLICT','jobId',v_job.id);
  end if;

  if not v_retryable or v_job.attempt_count >= v_job.max_attempts then
    v_outcome := 'DEAD_LETTER';
    update vaos_private.execution_jobs
    set status='DEAD_LETTER',lease_token=null,leased_by=null,leased_until=null,
        last_error=p_error,updated_at=now()
    where id=v_job.id;
  else
    v_outcome := 'RETRY_SCHEDULED';
    update vaos_private.execution_jobs
    set status='FAILED',lease_token=null,leased_by=null,leased_until=null,
        last_error=p_error,
        available_at=now() + make_interval(secs => least(300, (power(2, greatest(1,v_job.attempt_count)))::integer)),
        updated_at=now()
    where id=v_job.id;
  end if;

  insert into vaos_private.events(type,source,payload)
  values(
    case when v_outcome='DEAD_LETTER' then 'EXECUTION.DEAD_LETTER' else 'EXECUTION.RETRY_SCHEDULED' end,
    'vaos-execution-worker',
    jsonb_build_object('executionJobId',v_job.id,'intentId',v_job.intent_id,
      'actionType',v_job.action_type,'attempt',v_job.attempt_count,'error',p_error)
  );

  return jsonb_build_object('outcome',v_outcome,'jobId',v_job.id);
end;
$$;

create or replace function public.vaos_control_snapshot(p_server_key text)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
begin
  perform vaos_private.assert_server_key(p_server_key);
  return jsonb_build_object(
    'mode','DURABLE_POSTGRES',
    'approvals',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',id,'status',status,'agentId',agent_id,'actionType',action_type,'risk',risk,
        'authority',authority,'reason',reason,'requestedAt',requested_at,
        'decidedAt',decided_at,'decidedBy',decided_by) order by requested_at desc)
      from vaos_private.approvals
    ),'[]'::jsonb),
    'executions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',id,'intentId',intent_id,'actionType',action_type,'status',status,
        'attemptCount',attempt_count,'maxAttempts',max_attempts,'availableAt',available_at,
        'leasedBy',leased_by,'leasedUntil',leased_until,'lastError',last_error,
        'result',result,'createdAt',created_at,'updatedAt',updated_at) order by created_at desc)
      from (select * from vaos_private.execution_jobs order by created_at desc limit 50) x
    ),'[]'::jsonb),
    'events',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',id,'sequence',sequence,'type',type,'source',source,'payload',payload,
        'occurredAt',occurred_at) order by sequence desc)
      from (select * from vaos_private.events order by sequence desc limit 100) e
    ),'[]'::jsonb),
    'metrics',jsonb_build_object(
      'pendingApprovals',(select count(*) from vaos_private.approvals where status='PENDING'),
      'eventCount',(select count(*) from vaos_private.events),
      'intentCount',(select count(*) from vaos_private.intents),
      'executionPending',(select count(*) from vaos_private.execution_jobs where status in ('PENDING','FAILED')),
      'executionLeased',(select count(*) from vaos_private.execution_jobs where status='LEASED'),
      'executionSucceeded',(select count(*) from vaos_private.execution_jobs where status='SUCCEEDED'),
      'executionDeadLetter',(select count(*) from vaos_private.execution_jobs where status='DEAD_LETTER')
    )
  );
end;
$$;

insert into vaos_private.execution_jobs(intent_id,action_type,payload)
select id,action_type,payload
from vaos_private.intents
where status='AUTHORIZED' and idempotency_key like 'dev:%'
on conflict (intent_id) do nothing;

revoke all on function public.vaos_claim_execution(text,text,integer) from public, anon, authenticated;
revoke all on function public.vaos_complete_execution(text,text,text,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.vaos_fail_execution(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.vaos_claim_execution(text,text,integer) to service_role;
grant execute on function public.vaos_complete_execution(text,text,text,text,jsonb,jsonb) to service_role;
grant execute on function public.vaos_fail_execution(text,text,text,jsonb) to service_role;
