create table if not exists vaos_private.project_risk_escalations (
  id uuid primary key default gen_random_uuid(),
  risk_id text not null,
  intent_id uuid not null unique references vaos_private.intents(id),
  execution_job_id uuid not null unique references vaos_private.execution_jobs(id),
  source_action text not null check (source_action = 'PROJECT.ESCALATE_RISK'),
  status text not null default 'ESCALATED'
    check (status in ('ESCALATED','MITIGATING','MONITORED','CLOSED')),
  escalated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table vaos_private.project_risk_escalations enable row level security;

create index if not exists vaos_project_risk_escalations_risk_idx
  on vaos_private.project_risk_escalations (risk_id, escalated_at desc);

create index if not exists vaos_project_risk_escalations_status_idx
  on vaos_private.project_risk_escalations (status, escalated_at desc);

comment on table vaos_private.project_risk_escalations is
  'Durable VAOS Project/Risk escalation records. RLS enabled; no client policies. Writes are lease-bound through service-role RPCs.';

create or replace function public.vaos_escalate_risk(
  p_server_key text,
  p_job_id text,
  p_lease_token text,
  p_risk_id text
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_job vaos_private.execution_jobs%rowtype;
  v_record vaos_private.project_risk_escalations%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);

  if nullif(trim(coalesce(p_risk_id,'')), '') is null then
    raise exception 'RISK_ID_REQUIRED';
  end if;

  select * into v_job
  from vaos_private.execution_jobs
  where id::text = p_job_id
  for update;

  if v_job.id is null then
    return jsonb_build_object('outcome','NOT_FOUND');
  end if;

  if v_job.status <> 'LEASED'
     or v_job.lease_token::text <> p_lease_token
     or v_job.action_type <> 'PROJECT.ESCALATE_RISK' then
    return jsonb_build_object('outcome','CONFLICT');
  end if;

  if coalesce(v_job.payload->>'riskId','') <> p_risk_id then
    return jsonb_build_object('outcome','CONFLICT');
  end if;

  select * into v_record
  from vaos_private.project_risk_escalations
  where execution_job_id = v_job.id;

  if v_record.id is not null then
    if v_record.risk_id <> p_risk_id then
      return jsonb_build_object('outcome','CONFLICT');
    end if;
    return jsonb_build_object(
      'outcome','REPLAY',
      'record',jsonb_build_object(
        'riskId',v_record.risk_id,
        'status',v_record.status,
        'executionJobId',v_record.execution_job_id,
        'intentId',v_record.intent_id
      )
    );
  end if;

  begin
    insert into vaos_private.project_risk_escalations(
      risk_id,intent_id,execution_job_id,source_action
    )
    values(
      p_risk_id,v_job.intent_id,v_job.id,v_job.action_type
    )
    returning * into v_record;
  exception when unique_violation then
    select * into v_record
    from vaos_private.project_risk_escalations
    where execution_job_id=v_job.id or intent_id=v_job.intent_id
    order by case when execution_job_id=v_job.id then 0 else 1 end
    limit 1;

    if v_record.id is not null
       and v_record.risk_id=p_risk_id
       and v_record.execution_job_id=v_job.id
       and v_record.intent_id=v_job.intent_id then
      return jsonb_build_object(
        'outcome','REPLAY',
        'record',jsonb_build_object(
          'riskId',v_record.risk_id,
          'status',v_record.status,
          'executionJobId',v_record.execution_job_id,
          'intentId',v_record.intent_id
        )
      );
    end if;

    return jsonb_build_object('outcome','CONFLICT');
  end;

  insert into vaos_private.events(type,source,payload)
  values(
    'PROJECT.RISK_ESCALATION_RECORDED',
    'supabase.project-risk.v1',
    jsonb_build_object(
      'riskId',v_record.risk_id,
      'intentId',v_record.intent_id,
      'executionJobId',v_record.execution_job_id,
      'status',v_record.status
    )
  );

  return jsonb_build_object(
    'outcome','CREATED',
    'record',jsonb_build_object(
      'riskId',v_record.risk_id,
      'status',v_record.status,
      'executionJobId',v_record.execution_job_id,
      'intentId',v_record.intent_id
    )
  );
end;
$$;

create or replace function public.vaos_get_risk_escalation(
  p_server_key text,
  p_job_id text,
  p_risk_id text
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_record vaos_private.project_risk_escalations%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);

  select * into v_record
  from vaos_private.project_risk_escalations
  where execution_job_id::text=p_job_id
    and risk_id=p_risk_id;

  if v_record.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'riskId',v_record.risk_id,
    'status',v_record.status,
    'executionJobId',v_record.execution_job_id,
    'intentId',v_record.intent_id
  );
end;
$$;

revoke all on function public.vaos_escalate_risk(text,text,text,text) from public, anon, authenticated;
revoke all on function public.vaos_get_risk_escalation(text,text,text) from public, anon, authenticated;
grant execute on function public.vaos_escalate_risk(text,text,text,text) to service_role;
grant execute on function public.vaos_get_risk_escalation(text,text,text) to service_role;
