-- Stage-3 controlled VYNDI write qualification.
-- This migration does not enable operational VYNDI mutations.
-- It persists requester identity, enforces maker/checker separation for the
-- qualification-only path and injects immutable approval lineage into jobs.

alter table vaos_private.intents
  add column if not exists requested_by text;

alter table vaos_private.approvals
  add column if not exists requested_by text;

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
) returns jsonb
language plpgsql
security definer
set search_path to 'vaos_private','public','pg_temp'
as $function$
declare
  v_intent vaos_private.intents%rowtype;
  v_approval_id uuid;
  v_execution_job_id uuid;
  v_status text := p_result->>'status';
  v_write_qualification boolean := coalesce(p_payload->>'writeQualification','false') = 'true';
  v_requested_by text := nullif(btrim(coalesce(p_payload->>'requestedBy','')),'');
begin
  perform vaos_private.assert_server_key(p_server_key);

  if v_write_qualification and v_requested_by is null then
    raise exception 'WRITE_QUALIFICATION_REQUESTER_REQUIRED' using errcode='22023';
  end if;

  insert into vaos_private.intents
    (idempotency_key,request_hash,agent_id,action_type,risk,reason,payload,authority,status,result,requested_by)
  values
    (p_idempotency_key,p_request_hash,p_agent_id,p_action_type,p_risk,p_reason,
     coalesce(p_payload,'{}'::jsonb),p_authority,v_status,p_result,v_requested_by)
  on conflict (idempotency_key) do nothing
  returning * into v_intent;

  if v_intent.id is null then
    select * into v_intent
      from vaos_private.intents
     where idempotency_key=p_idempotency_key;
    if v_intent.request_hash <> p_request_hash then
      return jsonb_build_object('outcome','CONFLICT');
    end if;
    select id into v_approval_id
      from vaos_private.approvals
     where intent_id=v_intent.id;
    select id into v_execution_job_id
      from vaos_private.execution_jobs
     where intent_id=v_intent.id;
    return jsonb_build_object(
      'outcome','REPLAY',
      'intent',jsonb_build_object('id',v_intent.id,'status',v_intent.status,'result',v_intent.result),
      'approvalId',v_approval_id,
      'executionJobId',v_execution_job_id
    );
  end if;

  if v_status='AWAIT_APPROVAL' then
    insert into vaos_private.approvals(
      intent_id,agent_id,action_type,risk,authority,reason,requested_by
    )
    values(
      v_intent.id,p_agent_id,p_action_type,p_risk,p_authority,p_reason,v_requested_by
    )
    returning id into v_approval_id;
  elsif v_status='AUTHORIZED' then
    v_execution_job_id := vaos_private.enqueue_execution(v_intent.id);
  end if;

  insert into vaos_private.events(type,source,payload)
  values(
    p_event_type,p_agent_id,
    jsonb_build_object(
      'intentId',v_intent.id,
      'approvalId',v_approval_id,
      'executionJobId',v_execution_job_id,
      'actionType',p_action_type,
      'risk',p_risk,
      'authority',p_authority,
      'status',v_status
    )
  );

  if v_execution_job_id is not null then
    insert into vaos_private.events(type,source,payload)
    values(
      'EXECUTION.QUEUED',p_agent_id,
      jsonb_build_object(
        'intentId',v_intent.id,
        'executionJobId',v_execution_job_id,
        'actionType',p_action_type
      )
    );
  end if;

  return jsonb_build_object(
    'outcome','CREATED',
    'intent',jsonb_build_object('id',v_intent.id,'status',v_intent.status,'result',v_intent.result),
    'approvalId',v_approval_id,
    'executionJobId',v_execution_job_id
  );
end;
$function$;

create or replace function vaos_private.enqueue_execution(p_intent_id uuid)
returns uuid
language plpgsql
set search_path to 'vaos_private','pg_temp'
as $function$
declare
  v_intent vaos_private.intents%rowtype;
  v_approval vaos_private.approvals%rowtype;
  v_job_id uuid;
  v_payload jsonb;
  v_write_qualification boolean;
begin
  select * into v_intent
    from vaos_private.intents
   where id=p_intent_id;
  if v_intent.id is null then
    raise exception 'INTENT_NOT_FOUND';
  end if;
  if v_intent.status not in ('AUTHORIZED','APPROVED') then
    raise exception 'INTENT_NOT_EXECUTABLE';
  end if;

  v_write_qualification := coalesce(v_intent.payload->>'writeQualification','false') = 'true';
  v_payload := v_intent.payload;

  if v_write_qualification then
    select * into v_approval
      from vaos_private.approvals
     where intent_id=v_intent.id;

    if v_approval.id is null
       or v_approval.status <> 'APPROVED'
       or v_approval.decided_by is null
       or v_intent.requested_by is null then
      raise exception 'WRITE_QUALIFICATION_APPROVAL_REQUIRED';
    end if;

    if lower(v_intent.requested_by) = lower(v_approval.decided_by) then
      raise exception 'MAKER_CHECKER_REQUIRED';
    end if;

    v_payload := (v_intent.payload - '_vaosControl')
      || jsonb_build_object(
        '_vaosControl',
        jsonb_build_object(
          'idempotencyKey',v_intent.idempotency_key,
          'approvalId',v_approval.id,
          'requestedBy',v_intent.requested_by,
          'approvedBy',v_approval.decided_by
        )
      );
  end if;

  insert into vaos_private.execution_jobs(intent_id,action_type,payload)
  values(v_intent.id,v_intent.action_type,v_payload)
  on conflict (intent_id) do nothing
  returning id into v_job_id;

  if v_job_id is null then
    select id into v_job_id
      from vaos_private.execution_jobs
     where intent_id=v_intent.id;
  end if;
  return v_job_id;
end;
$function$;

create or replace function public.vaos_decide_approval(
  p_server_key text,
  p_approval_id text,
  p_decision text,
  p_decided_by text
) returns jsonb
language plpgsql
security definer
set search_path to 'vaos_private','public','pg_temp'
as $function$
declare
  v_approval vaos_private.approvals%rowtype;
  v_intent vaos_private.intents%rowtype;
  v_decision text := upper(coalesce(p_decision,''));
  v_execution_job_id uuid;
  v_write_qualification boolean;
begin
  perform vaos_private.assert_server_key(p_server_key);
  if v_decision not in ('APPROVED','REJECTED') then
    raise exception 'INVALID_APPROVAL_DECISION';
  end if;

  select * into v_approval
    from vaos_private.approvals
   where id::text=p_approval_id
   for update;
  if v_approval.id is null then
    return jsonb_build_object('outcome','NOT_FOUND');
  end if;

  select * into v_intent
    from vaos_private.intents
   where id=v_approval.intent_id;

  v_write_qualification :=
    coalesce(v_intent.payload->>'writeQualification','false') = 'true';

  if v_write_qualification and v_decision='APPROVED' then
    if v_approval.requested_by is null or btrim(v_approval.requested_by)='' then
      raise exception 'WRITE_QUALIFICATION_REQUESTER_REQUIRED' using errcode='22023';
    end if;
    if p_decided_by is null
       or btrim(p_decided_by)=''
       or lower(v_approval.requested_by)=lower(btrim(p_decided_by)) then
      return jsonb_build_object(
        'outcome','MAKER_CHECKER_REQUIRED',
        'approval',
        jsonb_build_object('id',v_approval.id,'status',v_approval.status)
      );
    end if;
  end if;

  if v_approval.status <> 'PENDING' then
    select id into v_execution_job_id
      from vaos_private.execution_jobs
     where intent_id=v_approval.intent_id;
    if v_approval.status=v_decision and v_approval.decided_by=p_decided_by then
      return jsonb_build_object(
        'outcome','REPLAY',
        'approval',jsonb_build_object(
          'id',v_approval.id,
          'status',v_approval.status,
          'decidedBy',v_approval.decided_by
        ),
        'executionJobId',v_execution_job_id
      );
    end if;
    return jsonb_build_object('outcome','CONFLICT');
  end if;

  update vaos_private.approvals
     set status=v_decision,
         decided_at=now(),
         decided_by=p_decided_by
   where id=v_approval.id
  returning * into v_approval;

  update vaos_private.intents
     set status=v_decision,
         updated_at=now(),
         result=result || jsonb_build_object(
           'approvalDecision',v_decision,
           'decidedBy',p_decided_by
         )
   where id=v_approval.intent_id;

  if v_decision='APPROVED' then
    v_execution_job_id := vaos_private.enqueue_execution(v_approval.intent_id);
  end if;

  insert into vaos_private.events(type,source,payload)
  values(
    'GOVERNANCE.APPROVAL_DECIDED',p_decided_by,
    jsonb_build_object(
      'approvalId',v_approval.id,
      'intentId',v_approval.intent_id,
      'executionJobId',v_execution_job_id,
      'actionType',v_approval.action_type,
      'decision',v_decision
    )
  );

  if v_execution_job_id is not null then
    insert into vaos_private.events(type,source,payload)
    values(
      'EXECUTION.QUEUED',p_decided_by,
      jsonb_build_object(
        'intentId',v_approval.intent_id,
        'executionJobId',v_execution_job_id,
        'actionType',v_approval.action_type
      )
    );
  end if;

  return jsonb_build_object(
    'outcome','DECIDED',
    'approval',jsonb_build_object(
      'id',v_approval.id,
      'status',v_approval.status,
      'decidedBy',v_approval.decided_by
    ),
    'executionJobId',v_execution_job_id
  );
end;
$function$;

revoke all on function public.vaos_submit_intent(
  text,text,text,text,text,text,text,jsonb,smallint,jsonb,text
) from public, anon, authenticated;
grant execute on function public.vaos_submit_intent(
  text,text,text,text,text,text,text,jsonb,smallint,jsonb,text
) to service_role;

revoke all on function public.vaos_decide_approval(text,text,text,text)
from public, anon, authenticated;
grant execute on function public.vaos_decide_approval(text,text,text,text)
to service_role;

revoke all on function vaos_private.enqueue_execution(uuid)
from public, anon, authenticated;
grant execute on function vaos_private.enqueue_execution(uuid)
to service_role;
