create table if not exists vaos_private.provider_control_state (
  provider_id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  check (coalesce(state->>'providerId','') = provider_id)
);
alter table vaos_private.provider_control_state enable row level security;

create table if not exists vaos_private.callback_receipts (
  receipt_ref text primary key,
  provider_id text not null,
  execution_job_id text not null,
  intent_id text not null,
  action_key text not null,
  token_hash text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  status text check (status is null or status in ('succeeded','failed')),
  evidence jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table vaos_private.callback_receipts enable row level security;
create index if not exists vaos_callback_receipts_expiry_idx
  on vaos_private.callback_receipts (expires_at)
  where consumed_at is null;

create table if not exists vaos_private.automation_reconciliation (
  reconciliation_id text primary key,
  identity text not null,
  state text not null default 'PENDING'
    check (state in ('PENDING','LEASED','SUCCEEDED','FAILED','MANUAL_REVIEW')),
  next_attempt_at timestamptz,
  leased_by text,
  lease_token uuid,
  lease_expires_at timestamptz,
  record jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (coalesce(record->>'reconciliationId','') = reconciliation_id)
);
alter table vaos_private.automation_reconciliation enable row level security;
create index if not exists vaos_automation_reconciliation_ready_idx
  on vaos_private.automation_reconciliation (state, next_attempt_at, created_at);
create index if not exists vaos_automation_reconciliation_lease_idx
  on vaos_private.automation_reconciliation (state, lease_expires_at);

create or replace function public.vaos_provider_state_get(
  p_server_key text,
  p_provider_id text
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_state jsonb;
begin
  perform vaos_private.assert_server_key(p_server_key);
  select state into v_state
  from vaos_private.provider_control_state
  where provider_id = p_provider_id;
  return v_state;
end;
$$;

create or replace function public.vaos_provider_state_put(
  p_server_key text,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_provider_id text := nullif(trim(coalesce(p_state->>'providerId','')),'');
begin
  perform vaos_private.assert_server_key(p_server_key);
  if v_provider_id is null then
    return jsonb_build_object('outcome','INVALID');
  end if;

  insert into vaos_private.provider_control_state(provider_id,state,updated_at)
  values(v_provider_id,p_state,now())
  on conflict (provider_id) do update
    set state=excluded.state,updated_at=now();

  return jsonb_build_object('outcome','SAVED','state',p_state);
end;
$$;

create or replace function public.vaos_callback_create(
  p_server_key text,
  p_record jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_count integer;
begin
  perform vaos_private.assert_server_key(p_server_key);

  insert into vaos_private.callback_receipts(
    receipt_ref,provider_id,execution_job_id,intent_id,action_key,token_hash,
    issued_at,expires_at,consumed_at,status,evidence
  )
  values(
    p_record->>'receiptRef',
    p_record->>'providerId',
    p_record->>'executionJobId',
    p_record->>'intentId',
    p_record->>'actionKey',
    p_record->>'tokenHash',
    (p_record->>'issuedAt')::timestamptz,
    (p_record->>'expiresAt')::timestamptz,
    nullif(p_record->>'consumedAt','')::timestamptz,
    nullif(p_record->>'status',''),
    p_record->'evidence'
  )
  on conflict (receipt_ref) do nothing;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    return jsonb_build_object('outcome','DUPLICATE');
  end if;

  return jsonb_build_object('outcome','CREATED','record',p_record);
end;
$$;

create or replace function public.vaos_callback_get(
  p_server_key text,
  p_receipt_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_row vaos_private.callback_receipts%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);
  select * into v_row
  from vaos_private.callback_receipts
  where receipt_ref = p_receipt_ref;

  if v_row.receipt_ref is null then return null; end if;

  return jsonb_build_object(
    'receiptRef',v_row.receipt_ref,
    'providerId',v_row.provider_id,
    'executionJobId',v_row.execution_job_id,
    'intentId',v_row.intent_id,
    'actionKey',v_row.action_key,
    'tokenHash',v_row.token_hash,
    'issuedAt',v_row.issued_at,
    'expiresAt',v_row.expires_at,
    'consumedAt',v_row.consumed_at,
    'status',v_row.status,
    'evidence',v_row.evidence
  );
end;
$$;

create or replace function public.vaos_callback_consume_once(
  p_server_key text,
  p_receipt_ref text,
  p_token_hash text,
  p_provider_id text,
  p_execution_job_id text,
  p_intent_id text,
  p_action_key text,
  p_consumed_at timestamptz,
  p_status text,
  p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_row vaos_private.callback_receipts%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);

  select * into v_row
  from vaos_private.callback_receipts
  where receipt_ref = p_receipt_ref
  for update;

  if v_row.receipt_ref is null then
    return jsonb_build_object('outcome','NOT_FOUND');
  end if;
  if v_row.consumed_at is not null then
    return jsonb_build_object('outcome','REPLAY');
  end if;
  if v_row.expires_at < p_consumed_at then
    return jsonb_build_object('outcome','EXPIRED');
  end if;
  if v_row.token_hash <> p_token_hash then
    return jsonb_build_object('outcome','TOKEN_INVALID');
  end if;
  if v_row.provider_id <> p_provider_id
     or v_row.execution_job_id <> p_execution_job_id
     or v_row.intent_id <> p_intent_id
     or v_row.action_key <> p_action_key then
    return jsonb_build_object('outcome','CORRELATION_MISMATCH');
  end if;
  if p_status not in ('succeeded','failed') then
    return jsonb_build_object('outcome','INVALID');
  end if;

  update vaos_private.callback_receipts
  set consumed_at=p_consumed_at,status=p_status,evidence=coalesce(p_evidence,'{}'::jsonb),updated_at=now()
  where receipt_ref=p_receipt_ref
  returning * into v_row;

  return jsonb_build_object(
    'outcome','CONSUMED',
    'record',jsonb_build_object(
      'receiptRef',v_row.receipt_ref,
      'providerId',v_row.provider_id,
      'executionJobId',v_row.execution_job_id,
      'intentId',v_row.intent_id,
      'actionKey',v_row.action_key,
      'tokenHash',v_row.token_hash,
      'issuedAt',v_row.issued_at,
      'expiresAt',v_row.expires_at,
      'consumedAt',v_row.consumed_at,
      'status',v_row.status,
      'evidence',v_row.evidence
    )
  );
end;
$$;

create or replace function public.vaos_reconciliation_enqueue(
  p_server_key text,
  p_record jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_id text := p_record->>'reconciliationId';
  v_identity text := p_record->>'identity';
  v_existing vaos_private.automation_reconciliation%rowtype;
  v_count integer;
begin
  perform vaos_private.assert_server_key(p_server_key);

  insert into vaos_private.automation_reconciliation(
    reconciliation_id,identity,state,next_attempt_at,record,created_at,updated_at
  )
  values(
    v_id,
    v_identity,
    coalesce(p_record->>'state','PENDING'),
    nullif(p_record->>'nextAttemptAt','')::timestamptz,
    p_record,
    coalesce(nullif(p_record->>'createdAt','')::timestamptz,now()),
    coalesce(nullif(p_record->>'updatedAt','')::timestamptz,now())
  )
  on conflict (reconciliation_id) do nothing;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    return jsonb_build_object('outcome','CREATED','record',p_record);
  end if;

  select * into v_existing
  from vaos_private.automation_reconciliation
  where reconciliation_id=v_id;

  if v_existing.identity <> v_identity then
    return jsonb_build_object('outcome','CONFLICT');
  end if;

  return jsonb_build_object('outcome','REPLAY','record',v_existing.record);
end;
$$;

create or replace function public.vaos_reconciliation_claim(
  p_server_key text,
  p_now timestamptz,
  p_include_not_due boolean default false,
  p_worker_id text default 'reconciler',
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_row vaos_private.automation_reconciliation%rowtype;
  v_lease_token uuid := gen_random_uuid();
  v_lease_until timestamptz;
begin
  perform vaos_private.assert_server_key(p_server_key);
  v_lease_until := p_now + make_interval(secs => greatest(1, least(3600,p_lease_seconds)));

  select * into v_row
  from vaos_private.automation_reconciliation
  where (
    state='PENDING'
    or (state='LEASED' and lease_expires_at is not null and lease_expires_at <= p_now)
  )
  and (
    p_include_not_due
    or next_attempt_at is null
    or next_attempt_at <= p_now
  )
  order by created_at
  for update skip locked
  limit 1;

  if v_row.reconciliation_id is null then return null; end if;

  update vaos_private.automation_reconciliation
  set state='LEASED',
      leased_by=p_worker_id,
      lease_token=v_lease_token,
      lease_expires_at=v_lease_until,
      record=record || jsonb_build_object(
        'state','LEASED',
        'leasedBy',p_worker_id,
        'leaseToken',v_lease_token::text,
        'leaseExpiresAt',v_lease_until
      ),
      updated_at=now()
  where reconciliation_id=v_row.reconciliation_id
  returning * into v_row;

  return v_row.record;
end;
$$;

create or replace function public.vaos_reconciliation_save(
  p_server_key text,
  p_reconciliation_id text,
  p_patch jsonb,
  p_lease_token text
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_row vaos_private.automation_reconciliation%rowtype;
  v_state text;
  v_record jsonb;
begin
  perform vaos_private.assert_server_key(p_server_key);

  select * into v_row
  from vaos_private.automation_reconciliation
  where reconciliation_id=p_reconciliation_id
  for update;

  if v_row.reconciliation_id is null then
    return jsonb_build_object('outcome','NOT_FOUND');
  end if;

  if v_row.state='LEASED' and coalesce(v_row.lease_token::text,'') <> coalesce(p_lease_token,'') then
    return jsonb_build_object('outcome','LEASE_MISMATCH');
  end if;

  v_state := coalesce(p_patch->>'state',v_row.state);
  if v_state not in ('PENDING','LEASED','SUCCEEDED','FAILED','MANUAL_REVIEW') then
    return jsonb_build_object('outcome','INVALID');
  end if;

  v_record := v_row.record || coalesce(p_patch,'{}'::jsonb);

  if v_state <> 'LEASED' then
    v_record := v_record || jsonb_build_object('leasedBy',null,'leaseToken',null,'leaseExpiresAt',null);
  end if;

  update vaos_private.automation_reconciliation
  set state=v_state,
      next_attempt_at=case
        when p_patch ? 'nextAttemptAt' then nullif(p_patch->>'nextAttemptAt','')::timestamptz
        else next_attempt_at
      end,
      leased_by=case when v_state='LEASED' then leased_by else null end,
      lease_token=case when v_state='LEASED' then lease_token else null end,
      lease_expires_at=case when v_state='LEASED' then lease_expires_at else null end,
      record=v_record,
      updated_at=now()
  where reconciliation_id=p_reconciliation_id
  returning * into v_row;

  return jsonb_build_object('outcome','SAVED','record',v_row.record);
end;
$$;

create or replace function public.vaos_reconciliation_get(
  p_server_key text,
  p_reconciliation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_record jsonb;
begin
  perform vaos_private.assert_server_key(p_server_key);
  select record into v_record
  from vaos_private.automation_reconciliation
  where reconciliation_id=p_reconciliation_id;
  return v_record;
end;
$$;

create or replace function public.vaos_reconciliation_list(
  p_server_key text
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
begin
  perform vaos_private.assert_server_key(p_server_key);
  return coalesce((
    select jsonb_agg(record order by created_at desc)
    from vaos_private.automation_reconciliation
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.vaos_provider_state_get(text,text) from public, anon, authenticated;
revoke all on function public.vaos_provider_state_put(text,jsonb) from public, anon, authenticated;
revoke all on function public.vaos_callback_create(text,jsonb) from public, anon, authenticated;
revoke all on function public.vaos_callback_get(text,text) from public, anon, authenticated;
revoke all on function public.vaos_callback_consume_once(text,text,text,text,text,text,text,timestamptz,text,jsonb) from public, anon, authenticated;
revoke all on function public.vaos_reconciliation_enqueue(text,jsonb) from public, anon, authenticated;
revoke all on function public.vaos_reconciliation_claim(text,timestamptz,boolean,text,integer) from public, anon, authenticated;
revoke all on function public.vaos_reconciliation_save(text,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.vaos_reconciliation_get(text,text) from public, anon, authenticated;
revoke all on function public.vaos_reconciliation_list(text) from public, anon, authenticated;

grant execute on function public.vaos_provider_state_get(text,text) to service_role;
grant execute on function public.vaos_provider_state_put(text,jsonb) to service_role;
grant execute on function public.vaos_callback_create(text,jsonb) to service_role;
grant execute on function public.vaos_callback_get(text,text) to service_role;
grant execute on function public.vaos_callback_consume_once(text,text,text,text,text,text,text,timestamptz,text,jsonb) to service_role;
grant execute on function public.vaos_reconciliation_enqueue(text,jsonb) to service_role;
grant execute on function public.vaos_reconciliation_claim(text,timestamptz,boolean,text,integer) to service_role;
grant execute on function public.vaos_reconciliation_save(text,text,jsonb,text) to service_role;
grant execute on function public.vaos_reconciliation_get(text,text) to service_role;
grant execute on function public.vaos_reconciliation_list(text) to service_role;
