-- Security Q4 identity assurance domain and qualification profile.

create table if not exists vaos_private.security_identity_observations (
  id uuid primary key default gen_random_uuid(),
  observation_id text not null,
  intent_id uuid not null unique references vaos_private.intents(id) on delete restrict,
  execution_job_id uuid not null unique references vaos_private.execution_jobs(id) on delete restrict,
  source_action text not null check (source_action='SECURITY.OBSERVE_IDENTITY'),
  status text not null default 'OBSERVED' check (status in ('OBSERVED','REVIEW_REQUIRED','CLOSED')),
  observed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table vaos_private.security_identity_observations enable row level security;
revoke all on table vaos_private.security_identity_observations from public, anon, authenticated, service_role;
create index if not exists security_identity_observations_resource_idx
  on vaos_private.security_identity_observations(observation_id, observed_at desc);

create or replace function public.vaos_observe_identity(
  p_server_key text,
  p_job_id text,
  p_lease_token text,
  p_observation_id text
)
returns jsonb
language plpgsql
security definer
set search_path=vaos_private, public, pg_temp
as $$
declare
  v_job vaos_private.execution_jobs%rowtype;
  v_record vaos_private.security_identity_observations%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);
  if nullif(trim(coalesce(p_observation_id,'')), '') is null then
    raise exception 'OBSERVATION_ID_REQUIRED';
  end if;

  select * into v_job
  from vaos_private.execution_jobs
  where id::text=p_job_id
  for update;

  if v_job.id is null then return jsonb_build_object('outcome','NOT_FOUND'); end if;
  if v_job.status<>'LEASED'
     or v_job.lease_token::text<>p_lease_token
     or v_job.action_type<>'SECURITY.OBSERVE_IDENTITY'
     or coalesce(v_job.payload->>'observationId','')<>p_observation_id then
    return jsonb_build_object('outcome','CONFLICT');
  end if;

  select * into v_record
  from vaos_private.security_identity_observations
  where execution_job_id=v_job.id;

  if v_record.id is not null then
    if v_record.observation_id<>p_observation_id then
      return jsonb_build_object('outcome','CONFLICT');
    end if;
    return jsonb_build_object('outcome','REPLAY','record',jsonb_build_object(
      'observationId',v_record.observation_id,
      'status',v_record.status,
      'executionJobId',v_record.execution_job_id,
      'intentId',v_record.intent_id
    ));
  end if;

  insert into vaos_private.security_identity_observations(
    observation_id,intent_id,execution_job_id,source_action
  ) values (
    p_observation_id,v_job.intent_id,v_job.id,v_job.action_type
  ) returning * into v_record;

  insert into vaos_private.events(type,source,payload)
  values(
    'SECURITY.IDENTITY_OBSERVED',
    'supabase.security-identity.v1',
    jsonb_build_object(
      'observationId',v_record.observation_id,
      'intentId',v_record.intent_id,
      'executionJobId',v_record.execution_job_id,
      'status',v_record.status
    )
  );

  return jsonb_build_object('outcome','CREATED','record',jsonb_build_object(
    'observationId',v_record.observation_id,
    'status',v_record.status,
    'executionJobId',v_record.execution_job_id,
    'intentId',v_record.intent_id
  ));
end;
$$;

create or replace function public.vaos_get_identity_observation(
  p_server_key text,
  p_job_id text,
  p_observation_id text
)
returns jsonb
language plpgsql
security definer
set search_path=vaos_private, public, pg_temp
as $$
declare
  v_record vaos_private.security_identity_observations%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);

  select * into v_record
  from vaos_private.security_identity_observations
  where execution_job_id::text=p_job_id
    and observation_id=p_observation_id;

  if v_record.id is null then return null; end if;

  return jsonb_build_object(
    'observationId',v_record.observation_id,
    'status',v_record.status,
    'executionJobId',v_record.execution_job_id,
    'intentId',v_record.intent_id
  );
end;
$$;

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
     or v_job.action_type not in ('PROJECT.ESCALATE_RISK','SECURITY.OBSERVE_IDENTITY')
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

create or replace function public.vaos_link_security_qualification_trace(
  p_server_key text,
  p_job_id text,
  p_lease_token text,
  p_source_risk_id text,
  p_target_baseline text,
  p_relation_type text
)
returns jsonb
language plpgsql
security definer
set search_path=vaos_private, public, pg_temp
as $$
declare
  v_job vaos_private.execution_jobs%rowtype;
  v_intent vaos_private.intents%rowtype;
  v_approval vaos_private.approvals%rowtype;
  v_observation vaos_private.security_identity_observations%rowtype;
  v_risk vaos_private.project_risk_escalations%rowtype;
  v_baseline vaos_private.engineering_baseline_changes%rowtype;
  v_link vaos_private.digital_thread_links%rowtype;
  v_trace jsonb;
begin
  perform vaos_private.assert_server_key(p_server_key);

  select * into v_job
  from vaos_private.execution_jobs
  where id::text=p_job_id
  for update;

  if v_job.id is null then return jsonb_build_object('outcome','JOB_NOT_FOUND'); end if;
  v_trace := coalesce(v_job.payload->'qualificationTrace','{}'::jsonb);

  if v_job.status<>'LEASED'
     or v_job.lease_token::text<>p_lease_token
     or v_job.action_type<>'SECURITY.OBSERVE_IDENTITY'
     or v_job.attempt_count<2
     or coalesce((v_job.payload->>'qualificationMode')::boolean,false)<>true
     or coalesce((v_job.payload->>'qualificationRecoveryDrill')::boolean,false)<>true then
    return jsonb_build_object('outcome','QUALIFICATION_RECOVERY_REQUIRED');
  end if;

  if p_relation_type<>'RELATED_TO'
     or coalesce(v_trace->>'sourceRiskId','')<>p_source_risk_id
     or coalesce(v_trace->>'targetBaseline','')<>p_target_baseline
     or coalesce(v_trace->>'relationType','')<>p_relation_type then
    return jsonb_build_object('outcome','TRACE_SCOPE_MISMATCH');
  end if;

  select * into v_intent from vaos_private.intents where id=v_job.intent_id;
  select * into v_approval
  from vaos_private.approvals
  where intent_id=v_job.intent_id and status='APPROVED' and coalesce(decided_by,'')<>''
  order by decided_at desc limit 1;
  if v_intent.id is null or v_approval.id is null then
    return jsonb_build_object('outcome','APPROVAL_REQUIRED');
  end if;

  select * into v_observation
  from vaos_private.security_identity_observations
  where execution_job_id=v_job.id
  limit 1;
  if v_observation.id is null or v_observation.status<>'OBSERVED' then
    return jsonb_build_object('outcome','SECURITY_OBSERVATION_REQUIRED');
  end if;

  select * into v_risk
  from vaos_private.project_risk_escalations
  where risk_id=p_source_risk_id
  order by escalated_at desc
  limit 1;

  select * into v_baseline
  from vaos_private.engineering_baseline_changes
  where baseline=p_target_baseline
  order by recorded_at desc
  limit 1;

  if v_risk.id is null or v_baseline.id is null then
    return jsonb_build_object('outcome','TRACE_ENDPOINT_NOT_FOUND');
  end if;

  select * into v_link
  from vaos_private.digital_thread_links
  where execution_job_id=v_job.id;

  if v_link.id is not null then
    if v_link.source_domain='PROJECT_RISK'
       and v_link.source_record_id=v_risk.id
       and v_link.relation_type=p_relation_type
       and v_link.target_domain='ENGINEERING_BASELINE'
       and v_link.target_record_id=v_baseline.id
       and v_link.intent_id=v_job.intent_id then
      return jsonb_build_object('outcome','REPLAY','link',jsonb_build_object(
        'id',v_link.id,
        'sourceDomain',v_link.source_domain,
        'targetDomain',v_link.target_domain,
        'relationType',v_link.relation_type,
        'intentId',v_link.intent_id,
        'executionJobId',v_link.execution_job_id
      ));
    end if;
    return jsonb_build_object('outcome','CONFLICT');
  end if;

  if exists (
    select 1 from vaos_private.digital_thread_links
    where source_domain='PROJECT_RISK'
      and source_record_id=v_risk.id
      and relation_type=p_relation_type
      and target_domain='ENGINEERING_BASELINE'
      and target_record_id=v_baseline.id
  ) then
    return jsonb_build_object('outcome','LINK_ALREADY_EXISTS');
  end if;

  insert into vaos_private.digital_thread_links(
    source_domain,source_record_id,relation_type,target_domain,target_record_id,
    created_by,context,intent_id,execution_job_id
  ) values (
    'PROJECT_RISK',v_risk.id,p_relation_type,'ENGINEERING_BASELINE',v_baseline.id,
    v_approval.decided_by,
    jsonb_build_object(
      'securityQualification',true,
      'profileId','SECURITY_Q4_IDENTITY_ASSURANCE_V1',
      'observationId',v_observation.observation_id,
      'sourceRiskId',p_source_risk_id,
      'targetBaseline',p_target_baseline
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
      'relationType',v_link.relation_type,
      'targetDomain',v_link.target_domain,
      'securityQualification',true
    )
  );

  return jsonb_build_object('outcome','CREATED','link',jsonb_build_object(
    'id',v_link.id,
    'sourceDomain',v_link.source_domain,
    'targetDomain',v_link.target_domain,
    'relationType',v_link.relation_type,
    'intentId',v_link.intent_id,
    'executionJobId',v_link.execution_job_id
  ));
end;
$$;

revoke all on function public.vaos_observe_identity(text,text,text,text) from public, anon, authenticated;
revoke all on function public.vaos_get_identity_observation(text,text,text) from public, anon, authenticated;
revoke all on function public.vaos_link_security_qualification_trace(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.vaos_observe_identity(text,text,text,text) to service_role;
grant execute on function public.vaos_get_identity_observation(text,text,text) to service_role;
grant execute on function public.vaos_link_security_qualification_trace(text,text,text,text,text,text) to service_role;



create or replace function vaos_private.assess_digital_employee_qualification(
  p_job_id uuid,
  p_lease_token uuid,
  p_employee_id text,
  p_target_level smallint,
  p_profile_id text
)
returns jsonb
language plpgsql
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_job vaos_private.execution_jobs%rowtype;
  v_approval vaos_private.approvals%rowtype;
  v_employee vaos_private.digital_employees%rowtype;
  v_existing vaos_private.digital_employee_qualification_assessments%rowtype;
  v_verified_count integer := 0;
  v_distinct_resources integer := 0;
  v_recovery_count integer := 0;
  v_approval_count integer := 0;
  v_cross_domain_count integer := 0;
  v_denial_count integer := 0;
  v_status text;
  v_scope text;
  v_criteria jsonb;
  v_results jsonb;
  v_evidence_refs jsonb;
  v_assessment_id uuid;
begin
  select * into v_existing
  from vaos_private.digital_employee_qualification_assessments
  where execution_job_id=p_job_id;

  if v_existing.id is not null then
    return jsonb_build_object(
      'outcome','REPLAY',
      'assessment',vaos_private.qualification_assessment_snapshot(v_existing.id)
    );
  end if;

  select * into v_job
  from vaos_private.execution_jobs
  where id=p_job_id
  for update;

  if v_job.id is null then return jsonb_build_object('outcome','JOB_NOT_FOUND'); end if;
  if v_job.status <> 'LEASED' or v_job.lease_token <> p_lease_token then
    return jsonb_build_object('outcome','LEASE_CONFLICT');
  end if;
  if v_job.action_type <> 'WORKFORCE.ASSESS_QUALIFICATION' then
    return jsonb_build_object('outcome','ACTION_MISMATCH');
  end if;
  if coalesce(v_job.payload->>'employeeId','') <> p_employee_id then
    return jsonb_build_object('outcome','EMPLOYEE_MISMATCH');
  end if;
  if coalesce((v_job.payload->>'targetLevel')::smallint,0) <> p_target_level then
    return jsonb_build_object('outcome','TARGET_LEVEL_MISMATCH');
  end if;
  if coalesce(v_job.payload->>'profileId','') <> p_profile_id then
    return jsonb_build_object('outcome','PROFILE_MISMATCH');
  end if;

  select * into v_approval
  from vaos_private.approvals
  where intent_id=v_job.intent_id and status='APPROVED'
  order by decided_at desc
  limit 1;

  if v_approval.id is null or coalesce(v_approval.decided_by,'')='' then
    return jsonb_build_object('outcome','APPROVAL_REQUIRED');
  end if;

  select * into v_employee
  from vaos_private.digital_employees
  where id=p_employee_id
  for update;

  if v_employee.id is null then return jsonb_build_object('outcome','EMPLOYEE_NOT_FOUND'); end if;
  if v_employee.status not in ('TRAINING','RETRAINING') then
    return jsonb_build_object('outcome','TRAINING_REQUIRED','currentStatus',v_employee.status);
  end if;

  if p_employee_id='vibpe'
     and p_target_level=3
     and p_profile_id='VIBPE_Q3_ENGINEERING_BASELINE_GOVERNANCE_V1' then

    v_scope := 'ENGINEERING_BASELINE_GOVERNANCE';

    select count(*),
           count(distinct ee.verification->>'resourceId'),
           count(*) filter (where j.attempt_count >= 2)
    into v_verified_count, v_distinct_resources, v_recovery_count
    from vaos_private.execution_evidence ee
    join vaos_private.intents i on i.id=ee.intent_id
    join vaos_private.execution_jobs j on j.id=ee.job_id
    where i.agent_id='vibpe'
      and i.action_type='ENGINEERING.BASELINE_CHANGE'
      and j.status='SUCCEEDED'
      and coalesce((ee.verification->>'verified')::boolean,false)=true;

    select count(*)
    into v_approval_count
    from vaos_private.approvals a
    join vaos_private.intents i on i.id=a.intent_id
    where i.agent_id='vibpe'
      and i.action_type='ENGINEERING.BASELINE_CHANGE'
      and a.status='APPROVED';

    select count(*)
    into v_cross_domain_count
    from vaos_private.digital_thread_links l
    where (l.source_domain='ENGINEERING_BASELINE' or l.target_domain='ENGINEERING_BASELINE')
      and l.source_domain <> l.target_domain
      and l.execution_job_id is not null;

    select coalesce(jsonb_agg(ref order by ref),'[]'::jsonb)
    into v_evidence_refs
    from (
      select 'execution_evidence:' || ee.id::text as ref
      from vaos_private.execution_evidence ee
      join vaos_private.intents i on i.id=ee.intent_id
      join vaos_private.execution_jobs j on j.id=ee.job_id
      where i.agent_id='vibpe'
        and i.action_type='ENGINEERING.BASELINE_CHANGE'
        and j.status='SUCCEEDED'
        and coalesce((ee.verification->>'verified')::boolean,false)=true
      union
      select 'digital_thread_link:' || l.id::text as ref
      from vaos_private.digital_thread_links l
      where (l.source_domain='ENGINEERING_BASELINE' or l.target_domain='ENGINEERING_BASELINE')
        and l.source_domain <> l.target_domain
        and l.execution_job_id is not null
    ) refs;

    v_criteria := jsonb_build_array(
      jsonb_build_object('id','verified_engineering_effects','required',2,'actual',v_verified_count,'pass',v_verified_count>=2),
      jsonb_build_object('id','distinct_baseline_resources','required',2,'actual',v_distinct_resources,'pass',v_distinct_resources>=2),
      jsonb_build_object('id','verified_recovery_path','required',1,'actual',v_recovery_count,'pass',v_recovery_count>=1),
      jsonb_build_object('id','human_approved_engineering_actions','required',2,'actual',v_approval_count,'pass',v_approval_count>=2),
      jsonb_build_object('id','executed_cross_domain_engineering_trace','required',1,'actual',v_cross_domain_count,'pass',v_cross_domain_count>=1)
    );

    v_results := jsonb_build_object(
      'verifiedEngineeringEffects',v_verified_count,
      'distinctBaselineResources',v_distinct_resources,
      'verifiedRecoveryPaths',v_recovery_count,
      'humanApprovedEngineeringActions',v_approval_count,
      'executedCrossDomainEngineeringTraces',v_cross_domain_count
    );

    v_status := case
      when v_verified_count>=2
       and v_distinct_resources>=2
       and v_recovery_count>=1
       and v_approval_count>=2
       and v_cross_domain_count>=1
      then 'PASS' else 'FAIL' end;

  elsif p_employee_id='qa'
     and p_target_level=3
     and p_profile_id='QA_Q3_CAPA_GOVERNANCE_V1' then

    v_scope := 'CAPA_GOVERNANCE';

    select count(*),
           count(distinct ee.verification->>'resourceId'),
           count(*) filter (where j.attempt_count >= 2)
    into v_verified_count, v_distinct_resources, v_recovery_count
    from vaos_private.execution_evidence ee
    join vaos_private.intents i on i.id=ee.intent_id
    join vaos_private.execution_jobs j on j.id=ee.job_id
    where i.agent_id='qa'
      and i.action_type='QA.OPEN_CAPA'
      and j.status='SUCCEEDED'
      and coalesce((ee.verification->>'verified')::boolean,false)=true;

    select count(*)
    into v_approval_count
    from vaos_private.approvals a
    join vaos_private.intents i on i.id=a.intent_id
    where i.agent_id='qa'
      and i.action_type='QA.OPEN_CAPA'
      and a.status='APPROVED';

    select count(*)
    into v_cross_domain_count
    from vaos_private.digital_thread_links l
    where (l.source_domain='QA_CAPA' or l.target_domain='QA_CAPA')
      and l.source_domain <> l.target_domain
      and l.execution_job_id is not null;

    select coalesce(jsonb_agg(ref order by ref),'[]'::jsonb)
    into v_evidence_refs
    from (
      select 'execution_evidence:' || ee.id::text as ref
      from vaos_private.execution_evidence ee
      join vaos_private.intents i on i.id=ee.intent_id
      join vaos_private.execution_jobs j on j.id=ee.job_id
      where i.agent_id='qa'
        and i.action_type='QA.OPEN_CAPA'
        and j.status='SUCCEEDED'
        and coalesce((ee.verification->>'verified')::boolean,false)=true
      union
      select 'digital_thread_link:' || l.id::text as ref
      from vaos_private.digital_thread_links l
      where (l.source_domain='QA_CAPA' or l.target_domain='QA_CAPA')
        and l.source_domain <> l.target_domain
        and l.execution_job_id is not null
    ) refs;

    v_criteria := jsonb_build_array(
      jsonb_build_object('id','verified_qa_capa_effects','required',2,'actual',v_verified_count,'pass',v_verified_count>=2),
      jsonb_build_object('id','distinct_capa_resources','required',2,'actual',v_distinct_resources,'pass',v_distinct_resources>=2),
      jsonb_build_object('id','verified_recovery_path','required',1,'actual',v_recovery_count,'pass',v_recovery_count>=1),
      jsonb_build_object('id','human_approved_qa_actions','required',2,'actual',v_approval_count,'pass',v_approval_count>=2),
      jsonb_build_object('id','executed_cross_domain_qa_trace','required',1,'actual',v_cross_domain_count,'pass',v_cross_domain_count>=1)
    );

    v_results := jsonb_build_object(
      'verifiedQaCapaEffects',v_verified_count,
      'distinctCapaResources',v_distinct_resources,
      'verifiedRecoveryPaths',v_recovery_count,
      'humanApprovedQaActions',v_approval_count,
      'executedCrossDomainQaTraces',v_cross_domain_count
    );

    v_status := case
      when v_verified_count>=2
       and v_distinct_resources>=2
       and v_recovery_count>=1
       and v_approval_count>=2
       and v_cross_domain_count>=1
      then 'PASS' else 'FAIL' end;

  elsif p_employee_id='risk'
     and p_target_level=3
     and p_profile_id='RISK_Q3_ENTERPRISE_RISK_GOVERNANCE_V1' then

    v_scope := 'ENTERPRISE_RISK_GOVERNANCE';

    select count(*),
           count(distinct ee.verification->>'resourceId'),
           count(*) filter (where j.attempt_count >= 2)
    into v_verified_count, v_distinct_resources, v_recovery_count
    from vaos_private.execution_evidence ee
    join vaos_private.intents i on i.id=ee.intent_id
    join vaos_private.execution_jobs j on j.id=ee.job_id
    where i.agent_id='risk'
      and i.action_type='PROJECT.ESCALATE_RISK'
      and j.status='SUCCEEDED'
      and coalesce((ee.verification->>'verified')::boolean,false)=true;

    select count(*)
    into v_approval_count
    from vaos_private.approvals a
    join vaos_private.intents i on i.id=a.intent_id
    where i.agent_id='risk'
      and i.action_type='PROJECT.ESCALATE_RISK'
      and a.status='APPROVED';

    select count(*)
    into v_cross_domain_count
    from vaos_private.digital_thread_links l
    where (l.source_domain='PROJECT_RISK' or l.target_domain='PROJECT_RISK')
      and l.source_domain <> l.target_domain
      and l.execution_job_id is not null;

    select coalesce(jsonb_agg(ref order by ref),'[]'::jsonb)
    into v_evidence_refs
    from (
      select 'execution_evidence:' || ee.id::text as ref
      from vaos_private.execution_evidence ee
      join vaos_private.intents i on i.id=ee.intent_id
      join vaos_private.execution_jobs j on j.id=ee.job_id
      where i.agent_id='risk'
        and i.action_type='PROJECT.ESCALATE_RISK'
        and j.status='SUCCEEDED'
        and coalesce((ee.verification->>'verified')::boolean,false)=true
      union
      select 'digital_thread_link:' || l.id::text as ref
      from vaos_private.digital_thread_links l
      where (l.source_domain='PROJECT_RISK' or l.target_domain='PROJECT_RISK')
        and l.source_domain <> l.target_domain
        and l.execution_job_id is not null
    ) refs;

    v_criteria := jsonb_build_array(
      jsonb_build_object('id','verified_risk_escalation_effects','required',2,'actual',v_verified_count,'pass',v_verified_count>=2),
      jsonb_build_object('id','distinct_risk_resources','required',2,'actual',v_distinct_resources,'pass',v_distinct_resources>=2),
      jsonb_build_object('id','verified_recovery_path','required',1,'actual',v_recovery_count,'pass',v_recovery_count>=1),
      jsonb_build_object('id','human_approved_risk_actions','required',2,'actual',v_approval_count,'pass',v_approval_count>=2),
      jsonb_build_object('id','executed_cross_domain_risk_trace','required',1,'actual',v_cross_domain_count,'pass',v_cross_domain_count>=1)
    );

    v_results := jsonb_build_object(
      'verifiedRiskEscalationEffects',v_verified_count,
      'distinctRiskResources',v_distinct_resources,
      'verifiedRecoveryPaths',v_recovery_count,
      'humanApprovedRiskActions',v_approval_count,
      'executedCrossDomainRiskTraces',v_cross_domain_count
    );

    v_status := case
      when v_verified_count>=2
       and v_distinct_resources>=2
       and v_recovery_count>=1
       and v_approval_count>=2
       and v_cross_domain_count>=1
      then 'PASS' else 'FAIL' end;

  elsif p_employee_id='security'
     and p_target_level=4
     and p_profile_id='SECURITY_Q4_IDENTITY_ASSURANCE_V1' then

    v_scope := 'IDENTITY_SECURITY_ASSURANCE';

    select count(*),
           count(distinct ee.verification->>'resourceId'),
           count(*) filter (where j.attempt_count >= 2)
    into v_verified_count, v_distinct_resources, v_recovery_count
    from vaos_private.execution_evidence ee
    join vaos_private.intents i on i.id=ee.intent_id
    join vaos_private.execution_jobs j on j.id=ee.job_id
    where i.agent_id='security'
      and i.action_type='SECURITY.OBSERVE_IDENTITY'
      and j.status='SUCCEEDED'
      and coalesce((ee.verification->>'verified')::boolean,false)=true;

    select count(*)
    into v_approval_count
    from vaos_private.approvals a
    join vaos_private.intents i on i.id=a.intent_id
    where i.agent_id='security'
      and i.action_type='SECURITY.OBSERVE_IDENTITY'
      and a.status='APPROVED';

    select count(*)
    into v_cross_domain_count
    from vaos_private.digital_thread_links l
    join vaos_private.execution_jobs j on j.id=l.execution_job_id
    join vaos_private.intents i on i.id=j.intent_id
    where i.agent_id='security'
      and i.action_type='SECURITY.OBSERVE_IDENTITY'
      and l.source_domain <> l.target_domain
      and coalesce((l.context->>'securityQualification')::boolean,false)=true;

    select count(*)
    into v_denial_count
    from vaos_private.intents i
    where i.agent_id='security'
      and i.action_type='SECURITY.OBSERVE_IDENTITY'
      and i.status='DENIED'
      and coalesce(i.result->>'reason','')='DIGITAL_EMPLOYEE_NOT_ACTIVE';

    select coalesce(jsonb_agg(ref order by ref),'[]'::jsonb)
    into v_evidence_refs
    from (
      select 'execution_evidence:' || ee.id::text as ref
      from vaos_private.execution_evidence ee
      join vaos_private.intents i on i.id=ee.intent_id
      join vaos_private.execution_jobs j on j.id=ee.job_id
      where i.agent_id='security'
        and i.action_type='SECURITY.OBSERVE_IDENTITY'
        and j.status='SUCCEEDED'
        and coalesce((ee.verification->>'verified')::boolean,false)=true
      union
      select 'digital_thread_link:' || l.id::text as ref
      from vaos_private.digital_thread_links l
      join vaos_private.execution_jobs j on j.id=l.execution_job_id
      join vaos_private.intents i on i.id=j.intent_id
      where i.agent_id='security'
        and i.action_type='SECURITY.OBSERVE_IDENTITY'
        and l.source_domain <> l.target_domain
        and coalesce((l.context->>'securityQualification')::boolean,false)=true
      union
      select 'intent:' || i.id::text as ref
      from vaos_private.intents i
      where i.agent_id='security'
        and i.action_type='SECURITY.OBSERVE_IDENTITY'
        and i.status='DENIED'
        and coalesce(i.result->>'reason','')='DIGITAL_EMPLOYEE_NOT_ACTIVE'
    ) refs;

    v_criteria := jsonb_build_array(
      jsonb_build_object('id','verified_security_identity_observations','required',3,'actual',v_verified_count,'pass',v_verified_count>=3),
      jsonb_build_object('id','distinct_security_resources','required',3,'actual',v_distinct_resources,'pass',v_distinct_resources>=3),
      jsonb_build_object('id','verified_recovery_path','required',1,'actual',v_recovery_count,'pass',v_recovery_count>=1),
      jsonb_build_object('id','human_approved_security_actions','required',3,'actual',v_approval_count,'pass',v_approval_count>=3),
      jsonb_build_object('id','executed_cross_domain_security_trace','required',1,'actual',v_cross_domain_count,'pass',v_cross_domain_count>=1),
      jsonb_build_object('id','fail_closed_security_denial','required',1,'actual',v_denial_count,'pass',v_denial_count>=1)
    );

    v_results := jsonb_build_object(
      'verifiedSecurityIdentityObservations',v_verified_count,
      'distinctSecurityResources',v_distinct_resources,
      'verifiedRecoveryPaths',v_recovery_count,
      'humanApprovedSecurityActions',v_approval_count,
      'executedCrossDomainSecurityTraces',v_cross_domain_count,
      'failClosedSecurityDenials',v_denial_count
    );

    v_status := case
      when v_verified_count>=3
       and v_distinct_resources>=3
       and v_recovery_count>=1
       and v_approval_count>=3
       and v_cross_domain_count>=1
       and v_denial_count>=1
      then 'PASS' else 'FAIL' end;

  else
    return jsonb_build_object('outcome','UNSUPPORTED_QUALIFICATION_PROFILE');
  end if;

  insert into vaos_private.digital_employee_qualification_assessments(
    employee_id,target_level,profile_id,scope,status,criteria,results,evidence_refs,
    assessed_by,intent_id,execution_job_id
  ) values (
    p_employee_id,p_target_level,p_profile_id,v_scope,v_status,v_criteria,v_results,v_evidence_refs,
    v_approval.decided_by,v_job.intent_id,v_job.id
  ) returning id into v_assessment_id;

  insert into vaos_private.events(type,source,payload)
  values(
    'WORKFORCE.QUALIFICATION_ASSESSED',
    v_approval.decided_by,
    jsonb_build_object(
      'employeeId',p_employee_id,
      'targetLevel',p_target_level,
      'profileId',p_profile_id,
      'scope',v_scope,
      'status',v_status,
      'assessmentId',v_assessment_id,
      'executionJobId',v_job.id
    )
  );

  return jsonb_build_object(
    'outcome','CREATED',
    'assessment',vaos_private.qualification_assessment_snapshot(v_assessment_id)
  );
end;
$$;

revoke all on function vaos_private.assess_digital_employee_qualification(uuid,uuid,text,smallint,text)
  from public, anon, authenticated, service_role;
