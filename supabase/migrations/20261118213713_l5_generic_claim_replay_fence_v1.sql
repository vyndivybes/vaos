-- Security P0: generic queue must not claim any L5-scoped production read-only job,
-- including old retryable FAILED rows, PENDING rows or expired leases.
-- Dedicated vaos_claim_production_observation alone enforces idempotency & no auto-retry.
-- No historic job, intent, ledger or business data is rewritten by applying this DDL.
CREATE OR REPLACE FUNCTION public.vaos_claim_execution(p_server_key text, p_worker_id text, p_lease_seconds integer DEFAULT 120)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'vaos_private', 'public', 'pg_temp'
AS $function$
declare
  v_job vaos_private.execution_jobs%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);

  update vaos_private.execution_jobs
  set status='DEAD_LETTER',
      lease_token=null,
      leased_by=null,
      leased_until=null,
      last_error=jsonb_build_object('code','LEASE_EXPIRED_MAX_ATTEMPTS','retryable',false),
      updated_at=now()
  where status='LEASED'
    and leased_until < now()
    and attempt_count >= max_attempts
    and not (action_type='PRODUCTION.OBSERVE_WIP'
      and payload->>'monitoringScope'='PRODUCTION_L5_READ_ONLY_V1');

  select * into v_job
  from vaos_private.execution_jobs
  where (
    (status in ('PENDING','FAILED') and available_at <= now())
    or (status='LEASED' and leased_until < now())
  )
  and attempt_count < max_attempts
    and not (action_type='PRODUCTION.OBSERVE_WIP'
      and payload->>'monitoringScope'='PRODUCTION_L5_READ_ONLY_V1')
  order by available_at, created_at
  for update skip locked
  limit 1;

  if v_job.id is null then return null; end if;

  update vaos_private.execution_jobs
  set status='LEASED',
      attempt_count=attempt_count+1,
      lease_token=gen_random_uuid(),
      leased_by=p_worker_id,
      leased_until=now() + make_interval(secs => greatest(30, least(600, p_lease_seconds))),
      updated_at=now()
  where id=v_job.id
  returning * into v_job;

  insert into vaos_private.events(type,source,payload)
  values('EXECUTION.CLAIMED',p_worker_id,
    jsonb_build_object('executionJobId',v_job.id,'intentId',v_job.intent_id,
      'actionType',v_job.action_type,'attempt',v_job.attempt_count,'workerId',p_worker_id));

  return jsonb_build_object(
    'id',v_job.id,
    'intentId',v_job.intent_id,
    'actionType',v_job.action_type,
    'payload',v_job.payload,
    'attemptCount',v_job.attempt_count,
    'maxAttempts',v_job.max_attempts,
    'leaseToken',v_job.lease_token,
    'leasedUntil',v_job.leased_until
  );
end;
$function$;

revoke all on function public.vaos_claim_execution(text,text,integer) from public, anon, authenticated;
grant execute on function public.vaos_claim_execution(text,text,integer) to service_role;
