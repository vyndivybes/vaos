-- VAOS-Production-L5: single-use scoped claim. This does not mutate VYNDI business data.
-- This function cannot claim a human-approved business write or another observation.
CREATE OR REPLACE FUNCTION public.vaos_claim_production_observation(
  p_server_key text,
  p_worker_id text,
  p_idempotency_key text,
  p_lease_seconds integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'vaos_private','public','pg_temp'
AS $function$
DECLARE v_job vaos_private.execution_jobs%rowtype;
BEGIN
  PERFORM vaos_private.assert_server_key(p_server_key);
  IF p_worker_id IS NULL OR btrim(p_worker_id) <> 'vaos-production-l5-cron'
     OR p_idempotency_key !~ '^vaos-production-l5:[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:00:00[.]000Z$'
     OR p_lease_seconds < 30 OR p_lease_seconds > 120 THEN
    RAISE EXCEPTION 'PRODUCTION_OBSERVATION_CLAIM_SCOPE_DENIED' USING ERRCODE='22023';
  END IF;

  SELECT j.* INTO v_job
    FROM vaos_private.execution_jobs j
    JOIN vaos_private.intents i ON i.id=j.intent_id
   WHERE i.idempotency_key=p_idempotency_key
     AND i.agent_id='production'
     AND i.action_type='PRODUCTION.OBSERVE_WIP'
     AND i.authority=5
     AND j.action_type='PRODUCTION.OBSERVE_WIP'
     -- Never automatically re-claim failed or expired leases: unknown outcomes
     -- require human reconciliation before any new execution attempt.
     AND j.status='PENDING' AND j.available_at<=now()
     AND j.attempt_count=0 AND j.attempt_count<j.max_attempts
   FOR UPDATE OF j SKIP LOCKED
   LIMIT 1;

  IF v_job.id IS NULL THEN RETURN NULL; END IF;

  UPDATE vaos_private.execution_jobs
     SET status='LEASED', attempt_count=attempt_count+1,
         lease_token=gen_random_uuid(), leased_by=p_worker_id,
         leased_until=now()+make_interval(secs=>p_lease_seconds), updated_at=now()
   WHERE id=v_job.id
   RETURNING * INTO v_job;

  INSERT INTO vaos_private.events(type,source,payload)
  VALUES ('EXECUTION.CLAIMED',p_worker_id,
      jsonb_build_object('executionJobId',v_job.id,'intentId',v_job.intent_id,
        'actionType',v_job.action_type,'attempt',v_job.attempt_count,'workerId',p_worker_id));
  RETURN jsonb_build_object('id',v_job.id,'intentId',v_job.intent_id,
      'actionType',v_job.action_type,'payload',v_job.payload,
      'attemptCount',v_job.attempt_count,'maxAttempts',v_job.max_attempts,
      'leaseToken',v_job.lease_token,'leasedUntil',v_job.leased_until);
END;
$function$;
REVOKE ALL ON FUNCTION public.vaos_claim_production_observation(text,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vaos_claim_production_observation(text,text,text,integer) TO service_role;
