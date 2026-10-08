-- Independent VAOS Infisical missed-run guard. No provider secrets or GitHub credentials.
-- GitHub canaries every 15 minutes. Routing eligibility expires at 20 minutes.
-- A second missed interval (30 minutes) disables provider/capability fail-closed.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE TABLE IF NOT EXISTS vaos_private.infisical_independent_guard_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  health_checked_at timestamptz,
  age_seconds integer,
  verdict text NOT NULL CHECK (verdict IN (
    'FRESH','STALE_WARNING','DISABLED_STALE','DISABLED_INVALID','ALREADY_DISABLED','MISSING_STATE'
  )),
  enabled_before boolean,
  enabled_after boolean,
  details text NOT NULL
);
REVOKE ALL ON vaos_private.infisical_independent_guard_audit FROM PUBLIC, anon, authenticated;
ALTER TABLE vaos_private.infisical_independent_guard_audit ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS infisical_guard_audit_time_idx
  ON vaos_private.infisical_independent_guard_audit (observed_at DESC);

CREATE OR REPLACE FUNCTION vaos_private.audit_infisical_watchdog()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'vaos_private','pg_temp'
AS $function$
DECLARE
  v_state jsonb;
  v_health_at timestamptz;
  v_qualification_until timestamptz;
  v_now timestamptz := clock_timestamp();
  v_age double precision;
  v_enabled boolean;
  v_verdict text;
  v_detail text;
  v_new_state jsonb;
BEGIN
  SELECT state INTO v_state
  FROM vaos_private.provider_control_state
  WHERE provider_id='infisical' FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO vaos_private.infisical_independent_guard_audit(
      verdict,details
    ) VALUES ('MISSING_STATE','Infisical provider state absent');
    RETURN;
  END IF;

  v_enabled := v_state->>'enabled'='true';
  BEGIN
    v_health_at := (v_state->'health'->>'checkedAt')::timestamptz;
    IF v_health_at IS NOT NULL THEN
      v_age := extract(epoch from (v_now-v_health_at));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_health_at := NULL;
    v_age := NULL;
  END;

  BEGIN
    v_qualification_until := (v_state->'qualification'->>'validUntil')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    v_qualification_until := NULL;
  END;

  IF NOT v_enabled THEN
    v_verdict := 'ALREADY_DISABLED';
    v_detail := 'No routing mutation';
  ELSIF v_state->'health'->>'status' IS DISTINCT FROM 'healthy'
      OR v_health_at IS NULL OR NOT isfinite(v_health_at) OR v_age < -120
      OR v_state->'qualification'->>'state' IS DISTINCT FROM 'qualified'
      OR v_qualification_until IS NULL OR v_qualification_until <= v_now
  THEN
    v_verdict := 'DISABLED_INVALID';
    v_detail := 'Invalid health or qualification; fail-closed';
  ELSIF v_age > extract(epoch from interval '30 minutes') THEN
    v_verdict := 'DISABLED_STALE';
    v_detail := 'Second consecutive 15-minute canary interval missed';
  ELSIF v_age > extract(epoch from interval '20 minutes') THEN
    v_verdict := 'STALE_WARNING';
    v_detail := 'Routing freshness expired; allow one retry interval';
  ELSE
    v_verdict := 'FRESH';
    v_detail := 'Provider health within bounded 20-minute routing window';
  END IF;

  IF v_verdict IN ('DISABLED_INVALID','DISABLED_STALE') THEN
    -- Never auto-enable. Disabling clears health to prevent stale replay.
    v_new_state := jsonb_set(
      jsonb_set(
        jsonb_set(v_state,'{enabled}','false'::jsonb,true),
        '{capabilityEnabled,secret.broker}','false'::jsonb,true
      ),'{health}','null'::jsonb,true
    );
    UPDATE vaos_private.provider_control_state
    SET state=v_new_state,updated_at=v_now
    WHERE provider_id='infisical';
  END IF;

  INSERT INTO vaos_private.infisical_independent_guard_audit(
    observed_at,health_checked_at,age_seconds,verdict,enabled_before,enabled_after,details
  ) VALUES (
    v_now,v_health_at,CASE WHEN v_age IS NULL THEN NULL ELSE round(v_age)::integer END,
    v_verdict,v_enabled,
    CASE WHEN v_verdict IN ('DISABLED_INVALID','DISABLED_STALE') THEN false ELSE v_enabled END,
    v_detail
  );

  -- Bound audit growth, without deleting commissioning or independent proof.
  DELETE FROM vaos_private.infisical_independent_guard_audit
  WHERE observed_at < v_now - interval '60 days';
END;
$function$;

REVOKE ALL ON FUNCTION vaos_private.audit_infisical_watchdog() FROM PUBLIC, anon, authenticated;

-- Run via a different scheduler than GitHub. Job has no external URLs or keys.
SELECT cron.schedule(
  'vaos-infisical-independent-guard-v1',
  '*/5 * * * *',
  'SELECT vaos_private.audit_infisical_watchdog();'
);
