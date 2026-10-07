-- Risk Q3 final evidence path.
-- Provides a deterministic second lease for the approved recovery drill and a tightly scoped
-- Risk -> Engineering digital-thread link under that same execution job.

create or replace function public.vaos_claim_qualification_recovery(
  p_server_key text,
  p_job_id text,
  p_worker_id text,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_job vaos_private.execution_jobs%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);

  if nullif(trim(coalesce(p_worker_id,'')), '') is null then
    return jsonb_build_object('outcome','WORKER_REQUIRED');
  end if;

  select * into v_job
  from vaos_private.execution_jobs
  where id::text=p_job_id
  for update;

  if v_job.id is null then return null; end if;

  if v_job.status <> 'FAILED'
     or v_job.action_type <> 'PROJECT.ESCALATE_RISK'
     or coalesce((v_job.payload->>'qualificationMode')::boolean,false) <> true
     or coalesce((v_job.payload->>'qualificationRecoveryDrill')::boolean,false) <> true
     or coalesce(v_job.last_error->>'code','') <> 'QUALIFICATION_RECOVERY_DRILL_RETRY'
     or v_job.attempt_count <> 1
     or v_job.attempt_count >= v_job.max_attempts then
    return null;
  end if;

  update vaos_private.execution_jobs
  set status='LEASED',
      attempt_count=attempt_count+1,
      lease_token=gen_random_uuid(),
      leased_by=p_worker_id,
      leased_until=now() + make_interval(secs => greatest(30, least(600, p_lease_seconds))),
      available_at=now(),
      updated_at=now()
  where id=v_job.id
  returning * into v_job;

  insert into vaos_private.events(type,source,payload)
  values(
    'EXECUTION.CLAIMED',
    p_worker_id,
    jsonb_build_object(
      'executionJobId',v_job.id,
      'intentId',v_job.intent_id,
      'actionType',v_job.action_type,
      'attempt',v_job.attempt_count,
      'workerId',p_worker_id,
      'qualificationRecovery',true
    )
  );

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
$$;

create or replace function public.vaos_link_risk_qualification_trace(
  p_server_key text,
  p_job_id text,
  p_lease_token text,
  p_target_domain text,
  p_target_resource_id text,
  p_relation_type text
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_job vaos_private.execution_jobs%rowtype;
  v_intent vaos_private.intents%rowtype;
  v_approval vaos_private.approvals%rowtype;
  v_risk vaos_private.project_risk_escalations%rowtype;
  v_target vaos_private.engineering_baseline_changes%rowtype;
  v_link vaos_private.digital_thread_links%rowtype;
  v_trace jsonb;
begin
  perform vaos_private.assert_server_key(p_server_key);

  select * into v_job
  from vaos_private.execution_jobs
  where id::text=p_job_id
  for update;

  if v_job.id is null then
    return jsonb_build_object('outcome','JOB_NOT_FOUND');
  end if;

  v_trace := coalesce(v_job.payload->'qualificationTrace','{}'::jsonb);

  if v_job.status <> 'LEASED'
     or v_job.lease_token::text <> p_lease_token
     or v_job.action_type <> 'PROJECT.ESCALATE_RISK'
     or v_job.attempt_count < 2
     or coalesce((v_job.payload->>'qualificationMode')::boolean,false) <> true
     or coalesce((v_job.payload->>'qualificationRecoveryDrill')::boolean,false) <> true then
    return jsonb_build_object('outcome','QUALIFICATION_RECOVERY_REQUIRED');
  end if;

  if p_target_domain <> 'ENGINEERING_BASELINE'
     or p_relation_type <> 'MITIGATES_RISK'
     or coalesce(v_trace->>'targetDomain','') <> p_target_domain
     or coalesce(v_trace->>'targetResourceId','') <> p_target_resource_id
     or coalesce(v_trace->>'relationType','') <> p_relation_type then
    return jsonb_build_object('outcome','TRACE_SCOPE_MISMATCH');
  end if;

  select * into v_intent
  from vaos_private.intents
  where id=v_job.intent_id;

  select * into v_approval
  from vaos_private.approvals
  where intent_id=v_job.intent_id
    and status='APPROVED'
    and coalesce(decided_by,'') <> ''
  order by decided_at desc
  limit 1;

  if v_intent.id is null or v_approval.id is null then
    return jsonb_build_object('outcome','APPROVAL_REQUIRED');
  end if;

  select * into v_risk
  from vaos_private.project_risk_escalations
  where execution_job_id=v_job.id
  limit 1;

  if v_risk.id is null or v_risk.status <> 'ESCALATED' then
    return jsonb_build_object('outcome','RISK_RECORD_REQUIRED');
  end if;

  select * into v_target
  from vaos_private.engineering_baseline_changes
  where baseline=p_target_resource_id
  order by recorded_at desc
  limit 1;

  if v_target.id is null then
    return jsonb_build_object('outcome','TARGET_NOT_FOUND');
  end if;

  select * into v_link
  from vaos_private.digital_thread_links
  where execution_job_id=v_job.id;

  if v_link.id is not null then
    if v_link.source_domain='PROJECT_RISK'
       and v_link.source_record_id=v_risk.id
       and v_link.relation_type=p_relation_type
       and v_link.target_domain=p_target_domain
       and v_link.target_record_id=v_target.id
       and v_link.intent_id=v_job.intent_id then
      return jsonb_build_object(
        'outcome','REPLAY',
        'link',jsonb_build_object(
          'id',v_link.id,
          'sourceDomain',v_link.source_domain,
          'sourceRecordId',v_link.source_record_id,
          'relationType',v_link.relation_type,
          'targetDomain',v_link.target_domain,
          'targetRecordId',v_link.target_record_id,
          'targetResourceId',p_target_resource_id,
          'createdBy',v_link.created_by,
          'intentId',v_link.intent_id,
          'executionJobId',v_link.execution_job_id
        )
      );
    end if;
    return jsonb_build_object('outcome','CONFLICT');
  end if;

  insert into vaos_private.digital_thread_links(
    source_domain,source_record_id,relation_type,target_domain,target_record_id,
    created_by,context,intent_id,execution_job_id
  )
  values(
    'PROJECT_RISK',v_risk.id,p_relation_type,p_target_domain,v_target.id,
    v_approval.decided_by,
    jsonb_build_object(
      'qualification',true,
      'profileId','RISK_Q3_ENTERPRISE_RISK_GOVERNANCE_V1',
      'riskId',v_risk.risk_id,
      'targetResourceId',p_target_resource_id,
      'reason',v_intent.reason
    ),
    v_job.intent_id,v_job.id
  )
  returning * into v_link;

  insert into vaos_private.events(type,source,payload)
  values(
    'DIGITAL_THREAD.LINK_CREATED',
    v_approval.decided_by,
    jsonb_build_object(
      'linkId',v_link.id,
      'intentId',v_link.intent_id,
      'executionJobId',v_link.execution_job_id,
      'sourceDomain',v_link.source_domain,
      'sourceRecordId',v_link.source_record_id,
      'relationType',v_link.relation_type,
      'targetDomain',v_link.target_domain,
      'targetRecordId',v_link.target_record_id,
      'createdBy',v_link.created_by,
      'qualification',true
    )
  );

  return jsonb_build_object(
    'outcome','CREATED',
    'link',jsonb_build_object(
      'id',v_link.id,
      'sourceDomain',v_link.source_domain,
      'sourceRecordId',v_link.source_record_id,
      'relationType',v_link.relation_type,
      'targetDomain',v_link.target_domain,
      'targetRecordId',v_link.target_record_id,
      'targetResourceId',p_target_resource_id,
      'createdBy',v_link.created_by,
      'intentId',v_link.intent_id,
      'executionJobId',v_link.execution_job_id
    )
  );
end;
$$;

revoke all on function public.vaos_claim_qualification_recovery(text,text,text,integer)
  from public, anon, authenticated;
revoke all on function public.vaos_link_risk_qualification_trace(text,text,text,text,text,text)
  from public, anon, authenticated;

grant execute on function public.vaos_claim_qualification_recovery(text,text,text,integer)
  to service_role;
grant execute on function public.vaos_link_risk_qualification_trace(text,text,text,text,text,text)
  to service_role;
