-- Safe, additive rotation for the existing scoped Infisical watchdog identity.
-- Stage only a SHA-256 digest of a high-entropy credential. Never persist plaintext.
-- Both the existing active key and a staged key may authenticate for at most 48h.
-- Promotion and retirement are separately authorized, audited operations.
ALTER TABLE vaos_private.infisical_watchdog_identity
  ADD COLUMN IF NOT EXISTS pending_key_hash text,
  ADD COLUMN IF NOT EXISTS pending_key_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_last_authenticated_at timestamptz;

DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='infisical_watchdog_pending_key_sane'
      AND conrelid='vaos_private.infisical_watchdog_identity'::regclass
  ) THEN
    ALTER TABLE vaos_private.infisical_watchdog_identity
    ADD CONSTRAINT infisical_watchdog_pending_key_sane CHECK (
      (pending_key_hash IS NULL AND pending_key_expires_at IS NULL) OR
      (pending_key_hash ~ '^[0-9a-f]{64}$'
       AND pending_key_expires_at IS NOT NULL)
    );
  END IF;
END;
$check$;

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
  v_now timestamptz := clock_timestamp();
BEGIN
  UPDATE vaos_private.infisical_watchdog_identity
  SET last_authenticated_at=v_now,
    pending_last_authenticated_at=CASE
      WHEN pending_key_hash=v_hash
       AND pending_key_expires_at>v_now THEN v_now
      ELSE pending_last_authenticated_at END
  WHERE identity_id='github-infisical-production-watchdog'
    AND enabled
    AND (
      key_hash=v_hash
      OR (pending_key_hash=v_hash AND pending_key_expires_at>v_now)
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAOS_INFISICAL_WATCHDOG_IDENTITY_INVALID'
      USING errcode='28000';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION vaos_private.assert_infisical_watchdog_key(text)
FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN vaos_private.infisical_watchdog_identity.pending_key_hash IS
'Only SHA-256 hex of the staged high-entropy key; expires automatically. Do not store raw secrets.';
COMMENT ON COLUMN vaos_private.infisical_watchdog_identity.pending_key_expires_at IS
'Time-bound overlap for no-downtime GitHub to Cloudflare watchdog credential rotation.';

-- IMPORTANT: This migration DOES NOT set, rotate, expose or activate any credential.
-- Staging: DBA sets pending_key_hash and pending_key_expires_at (<= now()+48h)
-- with a user-provided digest; production routing remains unchanged.
-- Promotion: DBA copies the staged digest to key_hash AFTER both scoped
-- destinations are independently qualified, clears pending fields and audits.
