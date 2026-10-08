create table if not exists vaos_private.provider_qualification_evidence (
  evidence_id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  capability text not null,
  stage text not null check (stage in ('contract','ephemeral-live','staging','production')),
  check_id text not null,
  outcome text not null check (outcome in ('pass','fail')),
  evidence_class text not null check (evidence_class in ('automated','live','manual')),
  evidence_refs jsonb not null check (jsonb_typeof(evidence_refs) = 'array'),
  authority_ref text not null,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(provider_id, capability, check_id, recorded_at, authority_ref)
);
alter table vaos_private.provider_qualification_evidence enable row level security;

create index if not exists vaos_provider_qualification_evidence_lookup_idx
  on vaos_private.provider_qualification_evidence(provider_id, capability, recorded_at, check_id);

create or replace function public.vaos_provider_qualification_evidence_append(
  p_server_key text,
  p_record jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_provider_id text := nullif(trim(coalesce(p_record->>'providerId','')),'');
  v_capability text := nullif(trim(coalesce(p_record->>'capability','')),'');
  v_stage text := nullif(trim(coalesce(p_record->>'stage','')),'');
  v_check_id text := nullif(trim(coalesce(p_record->>'checkId','')),'');
  v_outcome text := nullif(trim(coalesce(p_record->>'outcome','')),'');
  v_evidence_class text := nullif(trim(coalesce(p_record->>'evidenceClass','')),'');
  v_authority_ref text := nullif(trim(coalesce(p_record->>'authorityRef','')),'');
  v_recorded_at timestamptz;
  v_count integer;
begin
  perform vaos_private.assert_server_key(p_server_key);

  if v_provider_id is null
     or v_capability is null
     or v_stage not in ('contract','ephemeral-live','staging','production')
     or v_check_id is null
     or v_outcome not in ('pass','fail')
     or v_evidence_class not in ('automated','live','manual')
     or v_authority_ref is null
     or jsonb_typeof(p_record->'evidenceRefs') <> 'array'
     or jsonb_array_length(p_record->'evidenceRefs') = 0 then
    return jsonb_build_object('outcome','INVALID');
  end if;

  begin
    v_recorded_at := (p_record->>'recordedAt')::timestamptz;
  exception when others then
    return jsonb_build_object('outcome','INVALID');
  end;

  insert into vaos_private.provider_qualification_evidence(
    provider_id, capability, stage, check_id, outcome, evidence_class,
    evidence_refs, authority_ref, recorded_at
  )
  values(
    v_provider_id, v_capability, v_stage, v_check_id, v_outcome, v_evidence_class,
    p_record->'evidenceRefs', v_authority_ref, v_recorded_at
  )
  on conflict (provider_id, capability, check_id, recorded_at, authority_ref) do nothing;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    return jsonb_build_object('outcome','REPLAY','record',p_record);
  end if;

  return jsonb_build_object('outcome','APPENDED','record',p_record);
end;
$$;

create or replace function public.vaos_provider_qualification_evidence_list(
  p_server_key text,
  p_provider_id text,
  p_capability text
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
begin
  perform vaos_private.assert_server_key(p_server_key);

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'providerId',provider_id,
        'capability',capability,
        'stage',stage,
        'checkId',check_id,
        'outcome',outcome,
        'evidenceClass',evidence_class,
        'evidenceRefs',evidence_refs,
        'authorityRef',authority_ref,
        'recordedAt',recorded_at
      )
      order by recorded_at asc, created_at asc
    )
    from vaos_private.provider_qualification_evidence
    where provider_id=p_provider_id
      and capability=p_capability
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.vaos_provider_qualification_evidence_append(text,jsonb) from public, anon, authenticated;
revoke all on function public.vaos_provider_qualification_evidence_list(text,text,text) from public, anon, authenticated;

grant execute on function public.vaos_provider_qualification_evidence_append(text,jsonb) to service_role;
grant execute on function public.vaos_provider_qualification_evidence_list(text,text,text) to service_role;
