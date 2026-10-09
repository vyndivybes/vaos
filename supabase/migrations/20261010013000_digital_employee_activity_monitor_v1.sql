-- VAOS workforce activity monitor — source-control record of approved production SQL.
-- Already installed in production on 2026-10-10 (pg_cron job 2, ten-minute interval).
-- This migration is idempotent for deployment recovery; it DOES NOT grant business-write authority.
CREATE TABLE IF NOT EXISTS vaos_private.digital_employee_activity_monitor (
  employee_id text PRIMARY KEY REFERENCES vaos_private.digital_employees(id),
  observation text NOT NULL CHECK (observation IN (
    'NOT_ACTIVE','IDLE','TEST_ONLY','PLANNED','QUEUED','BLOCKED',
    'RECENT_VERIFIED_WORK','STALE_WORK','AWAITING_FIRST_WORK'
  )),
  checked_at timestamptz NOT NULL,
  last_proven_work_at timestamptz,
  work_package_id text,
  mission_id text,
  attention_required boolean NOT NULL DEFAULT false
);
ALTER TABLE vaos_private.digital_employee_activity_monitor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vaos_private.digital_employee_activity_monitor FROM public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION vaos_private.refresh_digital_employee_activity_monitor()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  WITH snapshot AS (
    SELECT e.id, e.status, e.heartbeat_at, wp.id AS wp_id, wp.mission_id,
           wp.status AS wp_status, wp.created_at AS wp_created_at,
           CASE
             WHEN e.status <> 'ACTIVE' THEN 'NOT_ACTIVE'
             WHEN wp.id IS NULL THEN 'IDLE'
             WHEN wp.mission_id LIKE 'VAOS-QUAL-%' THEN 'TEST_ONLY'
             WHEN wp.status = 'BLOCKED' THEN 'BLOCKED'
             WHEN wp.status = 'PLANNED' THEN 'PLANNED'
             WHEN wp.status = 'READY' THEN 'QUEUED'
             WHEN wp.status = 'IN_PROGRESS' AND
                  (e.heartbeat_at IS NULL OR e.heartbeat_at < wp.created_at)
               AND now() <= wp.created_at + interval '2 hours' THEN 'AWAITING_FIRST_WORK'
             WHEN wp.status = 'IN_PROGRESS' AND e.heartbeat_at >= wp.created_at
                  AND e.heartbeat_at >= now() - interval '2 hours' THEN 'RECENT_VERIFIED_WORK'
             WHEN wp.status = 'IN_PROGRESS' THEN 'STALE_WORK'
             ELSE 'IDLE'
           END AS observed
    FROM vaos_private.digital_employees e
    LEFT JOIN LATERAL (
      SELECT w.id, w.mission_id, w.status, w.created_at
      FROM vaos_private.work_packages w
      WHERE w.owner_agent_id = e.id
        AND w.status IN ('PLANNED','READY','IN_PROGRESS','BLOCKED')
      ORDER BY CASE w.status WHEN 'IN_PROGRESS' THEN 1 WHEN 'BLOCKED' THEN 2
                            WHEN 'READY' THEN 3 ELSE 4 END,
               w.updated_at DESC, w.id
      LIMIT 1
    ) wp ON TRUE
  )
  INSERT INTO vaos_private.digital_employee_activity_monitor
    (employee_id, observation, checked_at, last_proven_work_at,
     work_package_id, mission_id, attention_required)
  SELECT id, observed, now(), heartbeat_at, wp_id, mission_id,
         observed IN ('BLOCKED','STALE_WORK')
  FROM snapshot
  WHERE true
  ON CONFLICT (employee_id) DO UPDATE
    SET observation=excluded.observation,
        checked_at=excluded.checked_at,
        last_proven_work_at=excluded.last_proven_work_at,
        work_package_id=excluded.work_package_id,
        mission_id=excluded.mission_id,
        attention_required=excluded.attention_required;
  SELECT count(*) INTO v_count
  FROM vaos_private.digital_employee_activity_monitor
  WHERE attention_required;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION vaos_private.refresh_digital_employee_activity_monitor()
  FROM public, anon, authenticated, service_role;
-- Cron already exists in production; pg_cron upserts a job by name on restore.
SELECT cron.schedule(
  'vaos-digital-workforce-monitor-v1',
  '*/10 * * * *',
  'SELECT vaos_private.refresh_digital_employee_activity_monitor();'
);
