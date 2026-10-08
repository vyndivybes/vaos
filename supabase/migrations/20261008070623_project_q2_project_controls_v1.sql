-- Project Controls Q2 governed qualification profile.
-- Aligns durable authority with the human-approved responsibility contract and adds an isolated assessor.

update vaos_private.digital_employees
set capabilities = jsonb_set(
      coalesce(capabilities,'{}'::jsonb),
      '{PROJECT.ESCALATE_RISK}',
      '4'::jsonb,
      true
    ),
    updated_at=now()
where id='project';

create or replace function public.vaos_assess_project_q2_qualification(
  p_server_key text,
  p_job_id text,
  p_lease_token text,
  p_employee_id text,
  p_target_level smallint,
  p_profile_id text
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_job vaos_private.execution_jobs%rowtype;
  v_approval vaos_private.approvals%rowtype;
  v_employee vaos_private.digital_employees%rowtype;
  v_existing vaos_private.digital_employee_qualification_assessments%rowtype;
  v_verified_count integer := 0;
  v_distinct_resources integer := 0;
  v_approval_count integer := 0;
  v_denial_count integer := 0;
  v_status text;
  v_criteria jsonb;
  v_results jsonb;
  v_evidence_refs jsonb;
  v_assessment_id uuid;
begin
  perform vaos_private.assert_server_key(p_server_key);

  if p_employee_id <> 'project'
     or p_target_level <> 2
     or p_profile_id <> 'PROJECT_Q2_PROJECT_CONTROLS_V1' then
    return jsonb_build_object('outcome','PROFILE_MISMATCH');
  end if;

  select * into v_existing
  from vaos_private.digital_employee_qualification_assessments
  where execution_job_id=p_job_id::uuid;

  if v_existing.id is not null then
    return jsonb_build_object(
      'outcome','REPLAY',
      'assessment',vaos_private.qualification_assessment_snapshot(v_existing.id)
    );
  end if;

  select * into v_job
  from vaos_private.execution_jobs
  where id=p_job_id::uuid
  for update;

  if v_job.id is null then return jsonb_build_object('outcome','JOB_NOT_FOUND'); end if;
  if v_job.status <> 'LEASED' or v_job.lease_token::text <> p_lease_token then
    return jsonb_build_object('outcome','LEASE_CONFLICT');
  end if;
  if v_job.action_type <> 'WORKFORCE.ASSESS_QUALIFICATION' then
    return jsonb_build_object('outcome','ACTION_MISMATCH');
  end if;
  if coalesce(v_job.payload->>'employeeId','') <> p_employee_id
     or coalesce((v_job.payload->>'targetLevel')::smallint,0) <> p_target_level
     or coalesce(v_job.payload->>'profileId','') <> p_profile_id then
    return jsonb_build_object('outcome','PAYLOAD_MISMATCH');
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

  select count(*),
         count(distinct ee.verification->>'resourceId')
  into v_verified_count, v_distinct_resources
  from vaos_private.execution_evidence ee
  join vaos_private.intents i on i.id=ee.intent_id
  join vaos_private.execution_jobs j on j.id=ee.job_id
  where i.agent_id='project'
    and i.action_type='PROJECT.ESCALATE_RISK'
    and j.status='SUCCEEDED'
    and coalesce((ee.verification->>'verified')::boolean,false)=true;

  select count(*)
  into v_approval_count
  from vaos_private.approvals a
  join vaos_private.intents i on i.id=a.intent_id
  where i.agent_id='project'
    and i.action_type='PROJECT.ESCALATE_RISK'
    and a.status='APPROVED';

  select count(*)
  into v_denial_count
  from vaos_private.intents i
  where i.agent_id='project'
    and i.action_type='PROJECT.ESCALATE_RISK'
    and i.status='DENIED'
    and coalesce(i.result->>'reason','')='DIGITAL_EMPLOYEE_NOT_ACTIVE';

  select coalesce(jsonb_agg(ref order by ref),'[]'::jsonb)
  into v_evidence_refs
  from (
    select 'execution_evidence:' || ee.id::text as ref
    from vaos_private.execution_evidence ee
    join vaos_private.intents i on i.id=ee.intent_id
    join vaos_private.execution_jobs j on j.id=ee.job_id
    where i.agent_id='project'
      and i.action_type='PROJECT.ESCALATE_RISK'
      and j.status='SUCCEEDED'
      and coalesce((ee.verification->>'verified')::boolean,false)=true
    union
    select 'intent:' || i.id::text as ref
    from vaos_private.intents i
    where i.agent_id='project'
      and i.action_type='PROJECT.ESCALATE_RISK'
      and i.status='DENIED'
      and coalesce(i.result->>'reason','')='DIGITAL_EMPLOYEE_NOT_ACTIVE'
  ) refs;

  v_criteria := jsonb_build_array(
    jsonb_build_object('id','verified_project_risk_effects','required',2,'actual',v_verified_count,'pass',v_verified_count>=2),
    jsonb_build_object('id','distinct_project_risk_resources','required',2,'actual',v_distinct_resources,'pass',v_distinct_resources>=2),
    jsonb_build_object('id','human_approved_project_actions','required',2,'actual',v_approval_count,'pass',v_approval_count>=2),
    jsonb_build_object('id','fail_closed_project_denial','required',1,'actual',v_denial_count,'pass',v_denial_count>=1)
  );

  v_results := jsonb_build_object(
    'verifiedProjectRiskEffects',v_verified_count,
    'distinctProjectRiskResources',v_distinct_resources,
    'humanApprovedProjectActions',v_approval_count,
    'failClosedProjectDenials',v_denial_count
  );

  v_status := case
    when v_verified_count>=2
     and v_distinct_resources>=2
     and v_approval_count>=2
     and v_denial_count>=1
    then 'PASS' else 'FAIL' end;

  insert into vaos_private.digital_employee_qualification_assessments(
    employee_id,target_level,profile_id,scope,status,criteria,results,evidence_refs,
    assessed_by,intent_id,execution_job_id
  ) values (
    p_employee_id,p_target_level,p_profile_id,'PROJECT_RISK_CONTROL',v_status,v_criteria,v_results,v_evidence_refs,
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
      'scope','PROJECT_RISK_CONTROL',
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

revoke all on function public.vaos_assess_project_q2_qualification(text,text,text,text,smallint,text)
  from public, anon, authenticated;
grant execute on function public.vaos_assess_project_q2_qualification(text,text,text,text,smallint,text)
  to service_role;
