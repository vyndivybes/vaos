-- Infisical Wave-2 GitHub evidence-ingestion key, scoped independently of the Cloudflare primary.
-- This migration contains NO plaintext key and does NOT alter the cloudflare-primary credential.
-- Install the SHA-256 hash for 'github-infisical-evidence-only' separately after generating
-- a 256-bit random credential on the owner's Windows computer.
CREATE OR REPLACE FUNCTION vaos_private.assert_infisical_evidence_ingest_key(
  p_server_key text,
  p_provider_id text,
  p_operation text,
  p_evidence_class text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'vaos_private', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_hash text := encode(extensions.digest(convert_to(coalesce(p_server_key,''),'UTF8'),'sha256'),'hex');
BEGIN
  -- Preserve the existing primary Cloudflare credential for these three RPCs.
  IF EXISTS (SELECT 1 FROM vaos_private.server_credentials
    WHERE credential_id = 'cloudflare-primary' AND key_hash = v_hash) THEN
    RETURN;
  END IF;

  -- Independent GitHub key can only read state/evidence for the Infisical broker,
  -- or append automated/live evidence; it cannot write provider state or manual approval.
  IF p_provider_id IS DISTINCT FROM 'infisical'
     OR coalesce(p_operation,'') NOT IN ('providerStateGet','qualificationEvidenceList','qualificationEvidenceAppend')
     OR (p_operation='qualificationEvidenceAppend' AND coalesce(p_evidence_class,'') NOT IN ('automated','live'))
  THEN
    RAISE EXCEPTION 'VAOS_SERVER_KEY_INVALID' USING errcode='28000';
  END IF;

  IF EXISTS (SELECT 1 FROM vaos_private.server_credentials
    WHERE credential_id = 'github-infisical-evidence-only' AND key_hash = v_hash) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'VAOS_SERVER_KEY_INVALID' USING errcode='28000';
END;
$function$;

REVOKE ALL ON FUNCTION vaos_private.assert_infisical_evidence_ingest_key(text,text,text,text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.vaos_provider_qualification_evidence_append(p_server_key text, p_record jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'vaos_private', 'public', 'pg_temp'
AS $function$
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
  perform vaos_private.assert_infisical_evidence_ingest_key(p_server_key, v_provider_id, 'qualificationEvidenceAppend', v_evidence_class);

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
$function$


CREATE OR REPLACE FUNCTION public.vaos_provider_qualification_evidence_list(p_server_key text, p_provider_id text, p_capability text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'vaos_private', 'public', 'pg_temp'
AS $function$
begin
  perform vaos_private.assert_infisical_evidence_ingest_key(p_server_key, p_provider_id, 'qualificationEvidenceList');

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
$function$


CREATE OR REPLACE FUNCTION public.vaos_provider_state_get(p_server_key text, p_provider_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'vaos_private', 'public', 'pg_temp'
AS $function$
declare
  v_state jsonb;
begin
  perform vaos_private.assert_infisical_evidence_ingest_key(p_server_key, p_provider_id, 'providerStateGet');
  select state into v_state
  from vaos_private.provider_control_state
  where provider_id = p_provider_id;
  return v_state;
end;
$function$


-- Existing vaos_private.assert_server_key remains unchanged.
-- Existing non-evidence RPCs, including vaos_provider_state_put, remain primary-key-only.
