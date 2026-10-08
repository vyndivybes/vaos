-- Remaining Q2 Digital Employee qualification paths.
-- Release qualifies on recommendation/preparation evidence at L2.
-- Knowledge qualifies on approval-gated durable digital-thread links at L4.

create or replace function public.vaos_link_knowledge_qualification(
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
  v_risk vaos_private.project_risk_escalations%rowtype;
  v_baseline vaos_private.engineering_baseline_changes%rowtype;
  v_link vaos_private.digital_thread_links%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);

  if nullif(trim(coalesce(p_source_risk_id,'')), '') is null
     or nullif(trim(coalesce(p_target_baseline,'')), '') is null
     or p_relation_type <> 'RELATED_TO' then
    return jsonb_build_object('outcome','PAYLOAD_INVALID');
  end if;

  select * into v_job
  from vaos_private.execution_jobs
  where id::text=p_job_id
  for update;

  if v_job.id is null then return jsonb_build_object('outcome','JOB_NOT_FOUND'); end if;
  if v_job.status<>'LEASED'
     or v_job.lease_token::text<>p_lease_token
     or v_job.action_type<>'DIGITAL_THREAD.CREATE_LINK'
     or coalesce((v_job.payload->>'qualificationKnowledgeLink')::boolean,false)<>true
     or coalesce(v_job.payload->>'sourceRiskId','')<>p_source_risk_id
     or coalesce(v_job.payload->>'targetBaseline','')<>p_target_baseline
     or coalesce(v_job.payload->>'relationType','')<>p_relation_type then
    return jsonb_build_object('outcome','CONFLICT');
  end if;

  select * into v_intent
  from vaos_private.intents
  where id=v_job.intent_id;

  if v_intent.id is null or v_intent.agent_id<>'knowledge' then
    return jsonb_build_object('outcome','AGENT_MISMATCH');
  end if;

  select * into v_approval
  from vaos_private.approvals
  where intent_id=v_job.intent_id
    and status='APPROVED'
    and coalesce(decided_by,'')<>''
  order by decided_at desc
  limit 1;

  if v_approval.id is null then
    return jsonb_build_object('outcome','APPROVAL_REQUIRED');
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
      return jsonb_build_object(
        'outcome','REPLAY',
        'link',jsonb_build_object(
          'id',v_link.id,
          'sourceRiskId',p_source_risk_id,
          'targetBaseline',p_target_baseline,
          'relationType',v_link.relation_type,
          'intentId',v_link.intent_id,
          'executionJobId',v_link.execution_job_id
        )
      );
    end if;
    return jsonb_build_object('outcome','CONFLICT');
  end if;

  if exists (
    select 1
    from vaos_private.digital_thread_links
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
      'knowledgeQualification',coalesce((v_job.payload->>'qualificationMode')::boolean,false),
      'profileId',case when coalesce((v_job.payload->>'qualificationMode')::boolean,false)
        then 'KNOWLEDGE_Q2_TRACEABILITY_GOVERNANCE_V1' else null end,
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
      'knowledgeQualification',coalesce((v_job.payload->>'qualificationMode')::boolean,false)
    )
  );

  return jsonb_build_object(
    'outcome','CREATED',
    'link',jsonb_build_object(
      'id',v_link.id,
      'sourceRiskId',p_source_risk_id,
      'targetBaseline',p_target_baseline,
      'relationType',v_link.relation_type,
      'intentId',v_link.intent_id,
      'executionJobId',v_link.execution_job_id
    )
  );
end;
$$;

create or replace function public.vaos_get_knowledge_qualification_link(
  p_server_key text,
  p_job_id text,
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
  v_link vaos_private.digital_thread_links%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);

  select * into v_link
  from vaos_private.digital_thread_links
  where execution_job_id::text=p_job_id
    and relation_type=p_relation_type
    and coalesce(context->>'sourceRiskId','')=p_source_risk_id
    and coalesce(context->>'targetBaseline','')=p_target_baseline
  limit 1;

  if v_link.id is null then return null; end if;

  return jsonb_build_object(
    'id',v_link.id,
    'sourceRiskId',p_source_risk_id,
    'targetBaseline',p_target_baseline,
    'relationType',v_link.relation_type,
    'intentId',v_link.intent_id,
    'executionJobId',v_link.execution_job_id
  );
end;
$$;

create or replace function public.vaos_assess_release_q2_qualification(
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
set search_path=vaos_private, public, pg_temp
as $$
declare
  v_job vaos_private.execution_jobs%rowtype;
  v_approval vaos_private.approvals%rowtype;
  v_employee vaos_private.digital_employees%rowtype;
  v_existing vaos_private.digital_employee_qualification_assessments%rowtype;
  v_prepared_count integer := 0;
  v_distinct_resources integer := 0;
  v_denial_count integer := 0;
  v_status text;
  v_criteria jsonb;
  v_results jsonb;
  v_evidence_refs jsonb;
  v_assessment_id uuid;
begin
  perform vaos_private.assert_server_key(p_server_key);

  if p_employee_id<>'release'
     or p_target_level<>2
     or p_profile_id<>'RELEASE_Q2_RELEASE_ASSURANCE_V1' then
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
  if v_job.status<>'LEASED' or v_job.lease_token::text<>p_lease_token then
    return jsonb_build_object('outcome','LEASE_CONFLICT');
  end if;
  if v_job.action_type<>'WORKFORCE.ASSESS_QUALIFICATION' then
    return jsonb_build_object('outcome','ACTION_MISMATCH');
  end if;
  if coalesce(v_job.payload->>'employeeId','')<>p_employee_id
     or coalesce((v_job.payload->>'targetLevel')::smallint,0)<>p_target_level
     or coalesce(v_job.payload->>'profileId','')<>p_profile_id then
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
         count(distinct i.payload->>'gateId')
  into v_prepared_count, v_distinct_resources
  from vaos_private.intents i
  where i.agent_id='release'
    and i.action_type='RELEASE.OBSERVE_GATE'
    and i.status='PREPARED'
    and coalesce((i.payload->>'qualificationMode')::boolean,false)=true;

  select count(*)
  into v_denial_count
  from vaos_private.intents i
  where i.agent_id='release'
    and i.action_type='RELEASE.OBSERVE_GATE'
    and i.status='DENIED'
    and coalesce(i.result->>'reason','')='DIGITAL_EMPLOYEE_NOT_ACTIVE';

  select coalesce(jsonb_agg(ref order by ref),'[]'::jsonb)
  into v_evidence_refs
  from (
    select 'intent:' || i.id::text as ref
    from vaos_private.intents i
    where i.agent_id='release'
      and i.action_type='RELEASE.OBSERVE_GATE'
      and i.status='PREPARED'
      and coalesce((i.payload->>'qualificationMode')::boolean,false)=true
    union
    select 'intent:' || i.id::text as ref
    from vaos_private.intents i
    where i.agent_id='release'
      and i.action_type='RELEASE.OBSERVE_GATE'
      and i.status='DENIED'
      and coalesce(i.result->>'reason','')='DIGITAL_EMPLOYEE_NOT_ACTIVE'
  ) refs;

  v_criteria := jsonb_build_array(
    jsonb_build_object('id','prepared_release_gate_observations','required',2,'actual',v_prepared_count,'pass',v_prepared_count>=2),
    jsonb_build_object('id','distinct_release_gate_resources','required',2,'actual',v_distinct_resources,'pass',v_distinct_resources>=2),
    jsonb_build_object('id','fail_closed_release_denial','required',1,'actual',v_denial_count,'pass',v_denial_count>=1)
  );

  v_results := jsonb_build_object(
    'preparedReleaseGateObservations',v_prepared_count,
    'distinctReleaseGateResources',v_distinct_resources,
    'failClosedReleaseDenials',v_denial_count
  );

  v_status := case
    when v_prepared_count>=2
     and v_distinct_resources>=2
     and v_denial_count>=1
    then 'PASS' else 'FAIL' end;

  insert into vaos_private.digital_employee_qualification_assessments(
    employee_id,target_level,profile_id,scope,status,criteria,results,evidence_refs,
    assessed_by,intent_id,execution_job_id
  ) values (
    p_employee_id,p_target_level,p_profile_id,'RELEASE_ASSURANCE',v_status,v_criteria,v_results,v_evidence_refs,
    v_approval.decided_by,v_job.intent_id,v_job.id
  ) returning id into v_assessment_id;

  insert into vaos_private.events(type,source,payload)
  values(
    'WORKFORCE.QUALIFICATION_ASSESSED',
    v_approval.decided_by,
    jsonb_build_object(
      'employeeId',p_employee_id,'targetLevel',p_target_level,'profileId',p_profile_id,
      'scope','RELEASE_ASSURANCE','status',v_status,
      'assessmentId',v_assessment_id,'executionJobId',v_job.id
    )
  );

  return jsonb_build_object(
    'outcome','CREATED',
    'assessment',vaos_private.qualification_assessment_snapshot(v_assessment_id)
  );
end;
$$;

create or replace function public.vaos_assess_knowledge_q2_qualification(
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
set search_path=vaos_private, public, pg_temp
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

  if p_employee_id<>'knowledge'
     or p_target_level<>2
     or p_profile_id<>'KNOWLEDGE_Q2_TRACEABILITY_GOVERNANCE_V1' then
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
  if v_job.status<>'LEASED' or v_job.lease_token::text<>p_lease_token then
    return jsonb_build_object('outcome','LEASE_CONFLICT');
  end if;
  if v_job.action_type<>'WORKFORCE.ASSESS_QUALIFICATION' then
    return jsonb_build_object('outcome','ACTION_MISMATCH');
  end if;
  if coalesce(v_job.payload->>'employeeId','')<>p_employee_id
     or coalesce((v_job.payload->>'targetLevel')::smallint,0)<>p_target_level
     or coalesce(v_job.payload->>'profileId','')<>p_profile_id then
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
         count(distinct i.payload->>'sourceRiskId')
  into v_verified_count, v_distinct_resources
  from vaos_private.execution_evidence ee
  join vaos_private.intents i on i.id=ee.intent_id
  join vaos_private.execution_jobs j on j.id=ee.job_id
  where i.agent_id='knowledge'
    and i.action_type='DIGITAL_THREAD.CREATE_LINK'
    and coalesce((i.payload->>'qualificationMode')::boolean,false)=true
    and coalesce((i.payload->>'qualificationKnowledgeLink')::boolean,false)=true
    and j.status='SUCCEEDED'
    and coalesce((ee.verification->>'verified')::boolean,false)=true;

  select count(*)
  into v_approval_count
  from vaos_private.approvals a
  join vaos_private.intents i on i.id=a.intent_id
  where i.agent_id='knowledge'
    and i.action_type='DIGITAL_THREAD.CREATE_LINK'
    and coalesce((i.payload->>'qualificationMode')::boolean,false)=true
    and coalesce((i.payload->>'qualificationKnowledgeLink')::boolean,false)=true
    and a.status='APPROVED';

  select count(*)
  into v_denial_count
  from vaos_private.intents i
  where i.agent_id='knowledge'
    and i.action_type='DIGITAL_THREAD.CREATE_LINK'
    and i.status='DENIED'
    and coalesce(i.result->>'reason','')='DIGITAL_EMPLOYEE_NOT_ACTIVE';

  select coalesce(jsonb_agg(ref order by ref),'[]'::jsonb)
  into v_evidence_refs
  from (
    select 'execution_evidence:' || ee.id::text as ref
    from vaos_private.execution_evidence ee
    join vaos_private.intents i on i.id=ee.intent_id
    join vaos_private.execution_jobs j on j.id=ee.job_id
    where i.agent_id='knowledge'
      and i.action_type='DIGITAL_THREAD.CREATE_LINK'
      and coalesce((i.payload->>'qualificationMode')::boolean,false)=true
      and coalesce((i.payload->>'qualificationKnowledgeLink')::boolean,false)=true
      and j.status='SUCCEEDED'
      and coalesce((ee.verification->>'verified')::boolean,false)=true
    union
    select 'intent:' || i.id::text as ref
    from vaos_private.intents i
    where i.agent_id='knowledge'
      and i.action_type='DIGITAL_THREAD.CREATE_LINK'
      and i.status='DENIED'
      and coalesce(i.result->>'reason','')='DIGITAL_EMPLOYEE_NOT_ACTIVE'
  ) refs;

  v_criteria := jsonb_build_array(
    jsonb_build_object('id','verified_knowledge_links','required',2,'actual',v_verified_count,'pass',v_verified_count>=2),
    jsonb_build_object('id','distinct_knowledge_link_resources','required',2,'actual',v_distinct_resources,'pass',v_distinct_resources>=2),
    jsonb_build_object('id','human_approved_knowledge_links','required',2,'actual',v_approval_count,'pass',v_approval_count>=2),
    jsonb_build_object('id','fail_closed_knowledge_denial','required',1,'actual',v_denial_count,'pass',v_denial_count>=1)
  );

  v_results := jsonb_build_object(
    'verifiedKnowledgeLinks',v_verified_count,
    'distinctKnowledgeLinkResources',v_distinct_resources,
    'humanApprovedKnowledgeLinks',v_approval_count,
    'failClosedKnowledgeDenials',v_denial_count
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
    p_employee_id,p_target_level,p_profile_id,'KNOWLEDGE_TRACEABILITY_GOVERNANCE',
    v_status,v_criteria,v_results,v_evidence_refs,
    v_approval.decided_by,v_job.intent_id,v_job.id
  ) returning id into v_assessment_id;

  insert into vaos_private.events(type,source,payload)
  values(
    'WORKFORCE.QUALIFICATION_ASSESSED',
    v_approval.decided_by,
    jsonb_build_object(
      'employeeId',p_employee_id,'targetLevel',p_target_level,'profileId',p_profile_id,
      'scope','KNOWLEDGE_TRACEABILITY_GOVERNANCE','status',v_status,
      'assessmentId',v_assessment_id,'executionJobId',v_job.id
    )
  );

  return jsonb_build_object(
    'outcome','CREATED',
    'assessment',vaos_private.qualification_assessment_snapshot(v_assessment_id)
  );
end;
$$;

revoke all on function public.vaos_link_knowledge_qualification(text,text,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.vaos_get_knowledge_qualification_link(text,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.vaos_assess_release_q2_qualification(text,text,text,text,smallint,text)
  from public, anon, authenticated;
revoke all on function public.vaos_assess_knowledge_q2_qualification(text,text,text,text,smallint,text)
  from public, anon, authenticated;

grant execute on function public.vaos_link_knowledge_qualification(text,text,text,text,text,text)
  to service_role;
grant execute on function public.vaos_get_knowledge_qualification_link(text,text,text,text,text)
  to service_role;
grant execute on function public.vaos_assess_release_q2_qualification(text,text,text,text,smallint,text)
  to service_role;
grant execute on function public.vaos_assess_knowledge_q2_qualification(text,text,text,text,smallint,text)
  to service_role;
