-- Permit health refresh while Infisical is active while preserving routing state.
-- Emergency disable remains the only routing mutation available to this credential.
CREATE OR REPLACE FUNCTION public.vaos_infisical_commissioning_control(
  p_server_key text, p_action text, p_health jsonb DEFAULT NULL, p_authority_ref text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'vaos_private','public','pg_temp'
AS $function$
DECLARE
  v_before jsonb; v_after jsonb; v_status text;
  v_checked_at timestamptz; v_evidence_ref text;
BEGIN
  PERFORM vaos_private.assert_infisical_commissioning_key(p_server_key);
  IF p_action IS NULL OR p_action NOT IN ('record-health','disable') THEN
    RAISE EXCEPTION 'INFISICAL_COMMISSIONING_ACTION_FORBIDDEN' USING errcode='22023';
  END IF;
  IF p_authority_ref IS NULL OR p_authority_ref !~ '^https://github[.]com/vyndivybes/vaos/actions/runs/[0-9]+$' THEN
    RAISE EXCEPTION 'INFISICAL_COMMISSIONING_AUTHORITY_INVALID' USING errcode='22023';
  END IF;
  SELECT state INTO v_before FROM vaos_private.provider_control_state
  WHERE provider_id='infisical' FOR UPDATE;
  IF v_before IS NULL OR v_before->>'providerId' IS DISTINCT FROM 'infisical' THEN
    RAISE EXCEPTION 'INFISICAL_COMMISSIONING_STATE_NOT_FOUND' USING errcode='22023';
  END IF;
  IF p_action='record-health' THEN
    IF v_before->'qualification'->>'state' IS DISTINCT FROM 'qualified'
       OR (v_before->'qualification'->>'validUntil')::timestamptz <= clock_timestamp() THEN
      RAISE EXCEPTION 'INFISICAL_QUALIFICATION_INVALID' USING errcode='22023';
    END IF;
    IF p_health IS NULL OR jsonb_typeof(p_health)<>'object' THEN
      RAISE EXCEPTION 'INFISICAL_HEALTH_INVALID' USING errcode='22023';
    END IF;
    v_status:=p_health->>'status'; v_evidence_ref:=p_health->>'evidenceRef';
    IF v_status IS DISTINCT FROM 'healthy' OR v_evidence_ref IS DISTINCT FROM p_authority_ref THEN
      RAISE EXCEPTION 'INFISICAL_HEALTH_INVALID' USING errcode='22023';
    END IF;
    BEGIN v_checked_at:=(p_health->>'checkedAt')::timestamptz;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'INFISICAL_HEALTH_TIMESTAMP_INVALID' USING errcode='22023'; END;
    IF v_checked_at IS NULL OR NOT isfinite(v_checked_at)
       OR abs(extract(epoch from (clock_timestamp()-v_checked_at)))>120 THEN
      RAISE EXCEPTION 'INFISICAL_HEALTH_TIMESTAMP_INVALID' USING errcode='22023';
    END IF;
    v_after:=jsonb_set(v_before,'{health}',jsonb_build_object(
      'status','healthy','checkedAt',v_checked_at,'evidenceRef',v_evidence_ref),true);
  ELSE
    IF p_health IS NOT NULL OR jsonb_typeof(v_before->'capabilityEnabled')<>'object' THEN
      RAISE EXCEPTION 'INFISICAL_DISABLE_INPUT_INVALID' USING errcode='22023';
    END IF;
    v_after:=jsonb_set(jsonb_set(jsonb_set(v_before,'{enabled}','false'::jsonb,true),
      '{capabilityEnabled,secret.broker}','false'::jsonb,true),'{health}','null'::jsonb,true);
  END IF;
  UPDATE vaos_private.provider_control_state SET state=v_after,updated_at=clock_timestamp()
  WHERE provider_id='infisical';
  INSERT INTO vaos_private.infisical_commissioning_audit(
    operation,authority_ref,previous_enabled,resulting_enabled,health_status)
  VALUES(p_action,p_authority_ref,(v_before->>'enabled')::boolean,
    (v_after->>'enabled')::boolean,CASE WHEN p_action='record-health' THEN v_status END);
  RETURN jsonb_build_object('outcome','SAVED','providerId','infisical',
    'enabled',v_after->'enabled','health',v_after->'health',
    'qualificationState',v_after->'qualification'->>'state','operation',p_action);
END;
$function$;

REVOKE ALL ON FUNCTION public.vaos_infisical_commissioning_control(text,text,jsonb,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vaos_infisical_commissioning_control(text,text,jsonb,text)
TO service_role;
