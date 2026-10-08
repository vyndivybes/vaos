-- Promote the active scoped commissioning credential into a durable, least-privilege
-- production watchdog identity. Rotation remains required, but rotation_due_at is
-- advisory so an overdue rotation cannot silently disable fail-closed monitoring.
CREATE TABLE IF NOT EXISTS vaos_private.infisical_watchdog_identity (
  identity_id text PRIMARY KEY CHECK (identity_id = 'github-infisical-production-watchdog'),
  key_hash text NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  enabled boolean NOT NULL DEFAULT true,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  rotated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  rotation_due_at timestamptz NOT NULL,
  last_authenticated_at timestamptz,
  CHECK (rotation_due_at > rotated_at)
);
REVOKE ALL ON vaos_private.infisical_watchdog_identity FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS vaos_private.infisical_watchdog_identity_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type text NOT NULL CHECK (event_type IN ('promoted','rotated','disabled','enabled')),
  identity_id text NOT NULL,
  authority_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON vaos_private.infisical_watchdog_identity_audit FROM PUBLIC, anon, authenticated;

DO $block$
DECLARE
  v_hash text;
BEGIN
  SELECT key_hash INTO v_hash
  FROM vaos_private.infisical_commissioning_lease
  WHERE credential_id = 'github-infisical-commissioning'
    AND expires_at > clock_timestamp();

  IF v_hash IS NULL AND NOT EXISTS (
    SELECT 1 FROM vaos_private.infisical_watchdog_identity
    WHERE identity_id = 'github-infisical-production-watchdog'
  ) THEN
    RAISE EXCEPTION 'INFISICAL_WATCHDOG_PROMOTION_SOURCE_INVALID' USING errcode='28000';
  END IF;

  IF v_hash IS NOT NULL THEN
    INSERT INTO vaos_private.infisical_watchdog_identity(
      identity_id,key_hash,enabled,issued_at,rotated_at,rotation_due_at
    ) VALUES (
      'github-infisical-production-watchdog',v_hash,true,
      clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '90 days'
    )
    ON CONFLICT (identity_id) DO UPDATE SET
      key_hash=excluded.key_hash,
      enabled=true,
      rotated_at=clock_timestamp(),
      rotation_due_at=clock_timestamp()+interval '90 days';

    INSERT INTO vaos_private.infisical_watchdog_identity_audit(
      event_type,identity_id,authority_ref
    ) VALUES (
      'promoted','github-infisical-production-watchdog',
      'migration:20261008233000_infisical_durable_watchdog_identity_v1'
    );
  END IF;

  DELETE FROM vaos_private.infisical_commissioning_lease
  WHERE credential_id = 'github-infisical-commissioning';
END;
$block$;

CREATE OR REPLACE FUNCTION vaos_private.assert_infisical_watchdog_key(p_server_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'vaos_private','extensions','pg_temp'
AS $function$
DECLARE
  v_hash text := encode(extensions.digest(
    convert_to(coalesce(p_server_key,''),'UTF8'),'sha256'
  ),'hex');
BEGIN
  UPDATE vaos_private.infisical_watchdog_identity
  SET last_authenticated_at = clock_timestamp()
  WHERE identity_id = 'github-infisical-production-watchdog'
    AND enabled
    AND key_hash = v_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAOS_INFISICAL_WATCHDOG_IDENTITY_INVALID' USING errcode='28000';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION vaos_private.assert_infisical_watchdog_key(text)
FROM PUBLIC, anon, authenticated;

-- Compatibility wrapper keeps the deployed Edge Function/RPC contract stable while
-- moving authorization away from the expiring commissioning lease.
CREATE OR REPLACE FUNCTION vaos_private.assert_infisical_commissioning_key(p_server_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'vaos_private','pg_temp'
AS $function$
BEGIN
  PERFORM vaos_private.assert_infisical_watchdog_key(p_server_key);
END;
$function$;
REVOKE ALL ON FUNCTION vaos_private.assert_infisical_commissioning_key(text)
FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE vaos_private.infisical_watchdog_identity IS
'Least-privilege identity for Infisical health recording and emergency disable only. Rotation due dates are operational alerts, not hard expiry.';
