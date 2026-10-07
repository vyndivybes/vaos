
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
