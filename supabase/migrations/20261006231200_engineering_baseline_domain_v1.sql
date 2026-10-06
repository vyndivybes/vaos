create table if not exists vaos_private.engineering_baseline_changes (
  id uuid primary key default gen_random_uuid(),
  baseline text not null,
  intent_id uuid not null unique references vaos_private.intents(id),
  execution_job_id uuid not null unique references vaos_private.execution_jobs(id),
  source_action text not null check (source_action = 'ENGINEERING.BASELINE_CHANGE'),
  status text not null default 'CHANGE_RECORDED'
    check (status in ('CHANGE_RECORDED','VERIFIED','RELEASED','SUPERSEDED')),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table vaos_private.engineering_baseline_changes enable row level security;

create index if not exists vaos_engineering_baseline_changes_baseline_idx
  on vaos_private.engineering_baseline_changes (baseline, recorded_at desc);

create index if not exists vaos_engineering_baseline_changes_status_idx
  on vaos_private.engineering_baseline_changes (status, recorded_at desc);

comment on table vaos_private.engineering_baseline_changes is
  'Durable VAOS engineering baseline-change records. RLS enabled; no client policies. Writes are lease-bound through service-role RPCs.';

create or replace function public.vaos_record_baseline_change(
  p_server_key text,
  p_job_id text,
  p_lease_token text,
  p_baseline text
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_job vaos_private.execution_jobs%rowtype;
  v_record vaos_private.engineering_baseline_changes%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);

  if nullif(trim(coalesce(p_baseline,'')), '') is null then
    raise exception 'BASELINE_REQUIRED';
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
     or v_job.action_type <> 'ENGINEERING.BASELINE_CHANGE' then
    return jsonb_build_object('outcome','CONFLICT');
  end if;

  if coalesce(v_job.payload->>'baseline','') <> p_baseline then
    return jsonb_build_object('outcome','CONFLICT');
  end if;

  select * into v_record
  from vaos_private.engineering_baseline_changes
  where execution_job_id = v_job.id;

  if v_record.id is not null then
    if v_record.baseline <> p_baseline then
      return jsonb_build_object('outcome','CONFLICT');
    end if;
    return jsonb_build_object(
      'outcome','REPLAY',
      'record',jsonb_build_object(
        'baseline',v_record.baseline,
        'status',v_record.status,
        'executionJobId',v_record.execution_job_id,
        'intentId',v_record.intent_id
      )
    );
  end if;

  begin
    insert into vaos_private.engineering_baseline_changes(
      baseline,intent_id,execution_job_id,source_action
    )
    values(
      p_baseline,v_job.intent_id,v_job.id,v_job.action_type
    )
    returning * into v_record;
  exception when unique_violation then
    select * into v_record
    from vaos_private.engineering_baseline_changes
    where execution_job_id=v_job.id or intent_id=v_job.intent_id
    order by case when execution_job_id=v_job.id then 0 else 1 end
    limit 1;

    if v_record.id is not null
       and v_record.baseline=p_baseline
       and v_record.execution_job_id=v_job.id
       and v_record.intent_id=v_job.intent_id then
      return jsonb_build_object(
        'outcome','REPLAY',
        'record',jsonb_build_object(
          'baseline',v_record.baseline,
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
    'ENGINEERING.BASELINE_CHANGE_RECORDED',
    'supabase.engineering-baseline.v1',
    jsonb_build_object(
      'baseline',v_record.baseline,
      'intentId',v_record.intent_id,
      'executionJobId',v_record.execution_job_id,
      'status',v_record.status
    )
  );

  return jsonb_build_object(
    'outcome','CREATED',
    'record',jsonb_build_object(
      'baseline',v_record.baseline,
      'status',v_record.status,
      'executionJobId',v_record.execution_job_id,
      'intentId',v_record.intent_id
    )
  );
end;
$$;

create or replace function public.vaos_get_baseline_change(
  p_server_key text,
  p_job_id text,
  p_baseline text
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_record vaos_private.engineering_baseline_changes%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);

  select * into v_record
  from vaos_private.engineering_baseline_changes
  where execution_job_id::text=p_job_id
    and baseline=p_baseline;

  if v_record.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'baseline',v_record.baseline,
    'status',v_record.status,
    'executionJobId',v_record.execution_job_id,
    'intentId',v_record.intent_id
  );
end;
$$;

revoke all on function public.vaos_record_baseline_change(text,text,text,text) from public, anon, authenticated;
revoke all on function public.vaos_get_baseline_change(text,text,text) from public, anon, authenticated;
grant execute on function public.vaos_record_baseline_change(text,text,text,text) to service_role;
grant execute on function public.vaos_get_baseline_change(text,text,text) to service_role;
