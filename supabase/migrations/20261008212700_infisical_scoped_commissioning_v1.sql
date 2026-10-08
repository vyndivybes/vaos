-- Scoped, expiring Infisical commissioning credential (health record / disable only).
-- Does not provision credentials, alter cloudflare-primary or change provider state.
CREATE TABLE IF NOT EXISTS vaos_private.infisical_commissioning_lease (
  credential_id text PRIMARY KEY CHECK (credential_id = 'github-infisical-commissioning'),
  key_hash text NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON vaos_private.infisical_commissioning_lease FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS vaos_private.infisical_commissioning_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation text NOT NULL CHECK (operation IN ('record-health','disable')),
  authority_ref text NOT NULL,
  previous_enabled boolean NOT NULL,
  resulting_enabled boolean NOT NULL,
  health_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON vaos_private.infisical_commissioning_audit FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION vaos_private.assert_infisical_commissioning_key(p_server_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'vaos_private','extensions','pg_temp'
AS $function$
DECLARE
  v_hash text := encode(extensions.digest(convert_to(coalesce(p_server_key,''),'UTF8'),'sha256'),'hex');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vaos_private.infisical_commissioning_lease
    WHERE credential_id = 'github-infisical-commissioning'
      AND expires_at > clock_timestamp()
      AND key_hash = v_hash
  ) THEN
    RAISE EXCEPTION 'VAOS_SERVER_KEY_INVALID' USING errcode='28000';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION vaos_private.assert_infisical_commissioning_key(text)
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.vaos_infisical_commissioning_control(
  p_server_key text, p_action text, p_health jsonb DEFAULT NULL, p_authority_ref text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'vaos_private','public','pg_temp'
AS $function$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_status text;
  v_checked_at timestamptz;
  v_evidence_ref text;
BEGIN
  PERFORM vaos_private.assert_infisical_commissioning_key(p_server_key);

  IF p_action IS NULL OR p_action NOT IN ('record-health','disable') THEN
    RAISE EXCEPTION 'INFISICAL_COMMISSIONING_ACTION_FORBIDDEN' USING errcode='22023';
  END IF;
  IF p_authority_ref IS NULL OR p_authority_ref !~ '^https://github[.]com/vyndivybes/vaos/actions/runs/[0-9]+$' THEN
    RAISE EXCEPTION 'INFISICAL_COMMISSIONING_AUTHORITY_INVALID' USING errcode='22023';
  END IF;

  SELECT state INTO v_before FROM vaos_private.provider_control_state
  WHERE provider_id = 'infisical'
  FOR UPDATE;
  IF v_before IS NULL OR v_before->>'providerId' IS DISTINCT FROM 'infisical' THEN
    RAISE EXCEPTION 'INFISICAL_COMMISSIONING_STATE_NOT_FOUND' USING errcode='22023';
  END IF;

  IF p_action = 'record-health' THEN
    IF v_before->>'enabled' IS DISTINCT FROM 'false'
       OR v_before->'qualification'->>'state' IS DISTINCT FROM 'qualified' THEN
      RAISE EXCEPTION 'INFISICAL_COMMISSIONING_NOT_IN_SAFE_HOLD' USING errcode='22023';
    END IF;
    IF p_health IS NULL OR jsonb_typeof(p_health) <> 'object' THEN
      RAISE EXCEPTION 'INFISICAL_HEALTH_INVALID' USING errcode='22023';
    END IF;
    v_status := p_health->>'status';
    v_evidence_ref := p_health->>'evidenceRef';
    IF v_status IS NULL OR v_status NOT IN ('healthy','degraded','unhealthy','unknown')
       OR v_evidence_ref IS DISTINCT FROM p_authority_ref THEN
      RAISE EXCEPTION 'INFISICAL_HEALTH_INVALID' USING errcode='22023';
    END IF;
    BEGIN
      v_checked_at := (p_health->>'checkedAt')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INFISICAL_HEALTH_TIMESTAMP_INVALID' USING errcode='22023';
    END;
    IF v_checked_at IS NULL OR NOT isfinite(v_checked_at)
       OR abs(extract(epoch from (clock_timestamp()-v_checked_at))) > 120 THEN
      RAISE EXCEPTION 'INFISICAL_HEALTH_TIMESTAMP_INVALID' USING errcode='22023';
    END IF;
    -- Rebuild allowlisted health fields; never persist caller-supplied arbitrary JSON.
    v_after := jsonb_set(v_before,'{health}',jsonb_build_object(
      'status',v_status,'checkedAt',v_checked_at,'evidenceRef',v_evidence_ref
    ),true);
  ELSE
    IF p_health IS NOT NULL OR jsonb_typeof(v_before->'capabilityEnabled') <> 'object' THEN
      RAISE EXCEPTION 'INFISICAL_DISABLE_INPUT_INVALID' USING errcode='22023';
    END IF;
    v_after := jsonb_set(
      jsonb_set(v_before,'{enabled}',to_jsonb(false),true),
      '{capabilityEnabled,secret.broker}',to_jsonb(false),true
    );
  END IF;

  UPDATE vaos_private.provider_control_state
  SET state = v_after, updated_at = clock_timestamp()
  WHERE provider_id = 'infisical';

  INSERT INTO vaos_private.infisical_commissioning_audit(
    operation,authority_ref,previous_enabled,resulting_enabled,health_status
  ) VALUES (p_action,p_authority_ref,(v_before->>'enabled')::boolean,
            (v_after->>'enabled')::boolean,CASE WHEN p_action='record-health' THEN v_status ELSE NULL END);

  RETURN jsonb_build_object('outcome','SAVED','providerId','infisical',
    'enabled',v_after->'enabled','health',v_after->'health',
    'qualificationState',v_after->'qualification'->>'state','operation',p_action);
END;
$function$;

REVOKE ALL ON FUNCTION public.vaos_infisical_commissioning_control(text,text,jsonb,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vaos_infisical_commissioning_control(text,text,jsonb,text)
TO service_role;
