
create table if not exists vaos_private.digital_employee_qualification_assessments (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references vaos_private.digital_employees(id) on update cascade on delete restrict,
  target_level smallint not null,
  profile_id text not null,
  scope text not null,
  status text not null,
  criteria jsonb not null default '[]'::jsonb,
  results jsonb not null default '{}'::jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  assessed_by text not null,
  intent_id uuid not null references vaos_private.intents(id) on delete restrict,
  execution_job_id uuid not null unique references vaos_private.execution_jobs(id) on delete restrict,
  assessed_at timestamptz not null default now(),
  constraint workforce_assessment_level check (target_level between 1 and 4),
  constraint workforce_assessment_status check (status in ('PASS','FAIL')),
  constraint workforce_assessment_criteria_array check (jsonb_typeof(criteria)='array'),
  constraint workforce_assessment_results_object check (jsonb_typeof(results)='object'),
  constraint workforce_assessment_evidence_array check (jsonb_typeof(evidence_refs)='array')
);

alter table vaos_private.digital_employee_qualification_assessments enable row level security;
revoke all on table vaos_private.digital_employee_qualification_assessments from public, anon, authenticated, service_role;
create index if not exists workforce_assessment_employee_idx
  on vaos_private.digital_employee_qualification_assessments(employee_id, assessed_at desc);
create index if not exists workforce_assessment_level_idx
  on vaos_private.digital_employee_qualification_assessments(employee_id, target_level, status, assessed_at desc);

create or replace function vaos_private.qualification_assessment_snapshot(p_assessment_id uuid)
returns jsonb
language sql
stable
set search_path = vaos_private, public, pg_temp
as $$
  select jsonb_build_object(
    'id',a.id,
    'employeeId',a.employee_id,
    'targetLevel',a.target_level,
    'profileId',a.profile_id,
    'scope',a.scope,
    'status',a.status,
    'criteria',a.criteria,
    'results',a.results,
    'evidenceRefs',a.evidence_refs,
    'assessedBy',a.assessed_by,
    'intentId',a.intent_id,
    'executionJobId',a.execution_job_id,
    'assessedAt',a.assessed_at
  )
  from vaos_private.digital_employee_qualification_assessments a
  where a.id=p_assessment_id
$$;
revoke all on function vaos_private.qualification_assessment_snapshot(uuid)
  from public, anon, authenticated, service_role;

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

create or replace function public.vaos_assess_digital_employee_qualification(
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
begin
  perform vaos_private.assert_server_key(p_server_key);
  return vaos_private.assess_digital_employee_qualification(
    p_job_id::uuid,p_lease_token::uuid,p_employee_id,p_target_level,p_profile_id
  );
end;
$$;

create or replace function public.vaos_get_qualification_assessment(
  p_server_key text,
  p_job_id text,
  p_employee_id text
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform vaos_private.assert_server_key(p_server_key);
  select id into v_id
  from vaos_private.digital_employee_qualification_assessments
  where execution_job_id=p_job_id::uuid and employee_id=p_employee_id
  limit 1;
  if v_id is null then return null; end if;
  return vaos_private.qualification_assessment_snapshot(v_id);
end;
$$;

revoke all on function public.vaos_assess_digital_employee_qualification(text,text,text,text,smallint,text)
  from public, anon, authenticated;
revoke all on function public.vaos_get_qualification_assessment(text,text,text)
  from public, anon, authenticated;
grant execute on function public.vaos_assess_digital_employee_qualification(text,text,text,text,smallint,text)
  to service_role;
grant execute on function public.vaos_get_qualification_assessment(text,text,text)
  to service_role;

create or replace function public.vaos_control_snapshot(p_server_key text)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_snapshot jsonb;
begin
  v_snapshot := public.vaos_control_snapshot_core(p_server_key);
  return v_snapshot || jsonb_build_object(
    'workforce', jsonb_build_object(
      'digitalEmployees', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',e.id,'name',e.name,'role',e.role,'department',e.department,'mission',e.mission,
          'responsibilities',e.responsibilities,'responsibilityContractId',e.responsibility_contract_id,
          'qualificationLevel',e.qualification_level,'status',e.status,'skills',e.skills,'tools',e.tools,
          'kpis',e.kpis,'escalationPaths',e.escalation_paths,'capabilities',e.capabilities,
          'owner',e.owner,'supervisor',e.supervisor,'autonomyLevel',e.autonomy_level,
          'modelRequirements',e.model_requirements,'costBudget',e.cost_budget,'sla',e.sla,
          'memoryPolicy',e.memory_policy,'contextPolicy',e.context_policy,
          'currentAssignment',e.current_assignment,'priority',e.priority,'confidence',e.confidence,
          'heartbeatAt',e.heartbeat_at,'qualificationRecord',e.qualification_record,
          'evidenceRefs',e.evidence_refs,
          'latestAssessment',(
            select jsonb_build_object(
              'id',a.id,'targetLevel',a.target_level,'profileId',a.profile_id,'scope',a.scope,
              'status',a.status,'criteria',a.criteria,'results',a.results,'evidenceRefs',a.evidence_refs,
              'assessedBy',a.assessed_by,'assessedAt',a.assessed_at
            )
            from vaos_private.digital_employee_qualification_assessments a
            where a.employee_id=e.id
            order by a.assessed_at desc
            limit 1
          ),
          'version',e.version,'createdAt',e.created_at,'updatedAt',e.updated_at
        ) order by e.department,e.name)
        from vaos_private.digital_employees e
      ),'[]'::jsonb),
      'responsibilityContracts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',c.id,'role',c.role,'mission',c.mission,'outcomes',c.outcomes,
          'autonomousActions',c.autonomous_actions,'approvalRequiredActions',c.approval_required_actions,
          'prohibitedActions',c.prohibited_actions,'escalationConditions',c.escalation_conditions,
          'approvalThresholds',c.approval_thresholds,'evidenceRequirements',c.evidence_requirements,
          'version',c.version,'createdAt',c.created_at,'updatedAt',c.updated_at
        ) order by c.role)
        from vaos_private.responsibility_contracts c
      ),'[]'::jsonb),
      'metrics',jsonb_build_object(
        'totalDigitalEmployees',(select count(*) from vaos_private.digital_employees),
        'proposedDigitalEmployees',(select count(*) from vaos_private.digital_employees where status='PROPOSED'),
        'qualifiedDigitalEmployees',(select count(*) from vaos_private.digital_employees where status in ('QUALIFIED','ACTIVE')),
        'activeDigitalEmployees',(select count(*) from vaos_private.digital_employees where status='ACTIVE'),
        'restrictedDigitalEmployees',(select count(*) from vaos_private.digital_employees where status='RESTRICTED'),
        'responsibilityContracts',(select count(*) from vaos_private.responsibility_contracts),
        'qualificationAssessments',(select count(*) from vaos_private.digital_employee_qualification_assessments)
      )
    )
  );
end;
$$;
revoke all on function public.vaos_control_snapshot(text) from public, anon, authenticated;
grant execute on function public.vaos_control_snapshot(text) to service_role;

create or replace function vaos_private.apply_digital_employee_transition(
  p_job_id uuid,
  p_lease_token uuid,
  p_employee_id text,
  p_action_type text,
  p_qualification_level smallint default null,
  p_evidence_refs jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_job vaos_private.execution_jobs%rowtype;
  v_intent vaos_private.intents%rowtype;
  v_approval vaos_private.approvals%rowtype;
  v_employee vaos_private.digital_employees%rowtype;
  v_existing vaos_private.digital_employee_lifecycle_events%rowtype;
  v_assessment vaos_private.digital_employee_qualification_assessments%rowtype;
  v_from_status text;
  v_to_status text;
  v_from_level smallint;
  v_to_level smallint;
  v_reason text;
  v_assessment_ref text;
begin
  select * into v_existing
  from vaos_private.digital_employee_lifecycle_events
  where execution_job_id=p_job_id and employee_id=p_employee_id;

  if v_existing.id is not null then
    return jsonb_build_object(
      'outcome','REPLAY',
      'employee',vaos_private.digital_employee_snapshot(p_employee_id),
      'transition',jsonb_build_object(
        'actionType',v_existing.action_type,
        'fromStatus',v_existing.from_status,
        'toStatus',v_existing.to_status,
        'approvedBy',v_existing.approved_by,
        'transitionedAt',v_existing.transitioned_at
      )
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
  if v_job.action_type <> p_action_type then return jsonb_build_object('outcome','ACTION_MISMATCH'); end if;
  if coalesce(v_job.payload->>'employeeId','') <> p_employee_id then
    return jsonb_build_object('outcome','EMPLOYEE_MISMATCH');
  end if;

  select * into v_intent from vaos_private.intents where id=v_job.intent_id;
  if v_intent.id is null then return jsonb_build_object('outcome','INTENT_NOT_FOUND'); end if;

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

  v_from_status := v_employee.status;
  v_from_level := v_employee.qualification_level;
  v_to_level := v_employee.qualification_level;
  v_reason := coalesce(nullif(trim(v_intent.reason),''),'Governed workforce lifecycle transition');

  case p_action_type
    when 'WORKFORCE.START_TRAINING' then
      if v_employee.status <> 'PROPOSED' then
        return jsonb_build_object('outcome','INVALID_TRANSITION','currentStatus',v_employee.status,'expectedStatus','PROPOSED');
      end if;
      v_to_status := 'TRAINING';

    when 'WORKFORCE.QUALIFY' then
      if v_employee.status not in ('TRAINING','RETRAINING') then
        return jsonb_build_object('outcome','INVALID_TRANSITION','currentStatus',v_employee.status,'expectedStatus','TRAINING_OR_RETRAINING');
      end if;
      if p_qualification_level is null or p_qualification_level < 1 or p_qualification_level > 4 then
        return jsonb_build_object('outcome','INVALID_QUALIFICATION_LEVEL');
      end if;
      if p_evidence_refs is null or jsonb_typeof(p_evidence_refs) <> 'array' or jsonb_array_length(p_evidence_refs)=0 then
        return jsonb_build_object('outcome','QUALIFICATION_EVIDENCE_REQUIRED');
      end if;

      select * into v_assessment
      from vaos_private.digital_employee_qualification_assessments
      where employee_id=p_employee_id
        and target_level=p_qualification_level
        and status='PASS'
      order by assessed_at desc
      limit 1;

      if v_assessment.id is null then
        return jsonb_build_object('outcome','QUALIFICATION_ASSESSMENT_REQUIRED');
      end if;

      v_assessment_ref := 'qualification_assessment:' || v_assessment.id::text;
      if not (p_evidence_refs @> jsonb_build_array(v_assessment_ref)) then
        return jsonb_build_object(
          'outcome','QUALIFICATION_ASSESSMENT_REFERENCE_REQUIRED',
          'assessmentRef',v_assessment_ref
        );
      end if;

      v_to_status := 'QUALIFIED';
      v_to_level := p_qualification_level;

    when 'WORKFORCE.ACTIVATE' then
      if v_employee.status <> 'QUALIFIED' then
        return jsonb_build_object('outcome','INVALID_TRANSITION','currentStatus',v_employee.status,'expectedStatus','QUALIFIED');
      end if;
      if v_employee.qualification_level < 1 or v_employee.qualification_record is null then
        return jsonb_build_object('outcome','QUALIFICATION_REQUIRED');
      end if;
      v_to_status := 'ACTIVE';

    when 'WORKFORCE.RESTRICT' then
      if v_employee.status <> 'ACTIVE' then
        return jsonb_build_object('outcome','INVALID_TRANSITION','currentStatus',v_employee.status,'expectedStatus','ACTIVE');
      end if;
      if length(v_reason) < 3 then return jsonb_build_object('outcome','REASON_REQUIRED'); end if;
      v_to_status := 'RESTRICTED';

    when 'WORKFORCE.START_RETRAINING' then
      if v_employee.status <> 'RESTRICTED' then
        return jsonb_build_object('outcome','INVALID_TRANSITION','currentStatus',v_employee.status,'expectedStatus','RESTRICTED');
      end if;
      if length(v_reason) < 3 then return jsonb_build_object('outcome','REASON_REQUIRED'); end if;
      v_to_status := 'RETRAINING';

    when 'WORKFORCE.RETIRE' then
      if v_employee.status = 'RETIRED' then
        return jsonb_build_object('outcome','INVALID_TRANSITION','currentStatus','RETIRED');
      end if;
      if length(v_reason) < 3 then return jsonb_build_object('outcome','REASON_REQUIRED'); end if;
      v_to_status := 'RETIRED';

    else
      return jsonb_build_object('outcome','UNSUPPORTED_WORKFORCE_ACTION');
  end case;

  if p_action_type='WORKFORCE.QUALIFY' then
    update vaos_private.digital_employees
    set status=v_to_status,
        qualification_level=v_to_level,
        qualification_record=jsonb_build_object(
          'qualifiedBy',v_approval.decided_by,
          'qualifiedAt',now(),
          'level',v_to_level,
          'assessmentId',v_assessment.id,
          'assessmentProfileId',v_assessment.profile_id,
          'assessmentScope',v_assessment.scope,
          'evidenceRefs',p_evidence_refs,
          'intentId',v_job.intent_id,
          'executionJobId',v_job.id
        ),
        evidence_refs=p_evidence_refs,
        updated_at=now()
    where id=p_employee_id;
  else
    update vaos_private.digital_employees
    set status=v_to_status, updated_at=now()
    where id=p_employee_id;
  end if;

  insert into vaos_private.digital_employee_lifecycle_events(
    employee_id,intent_id,execution_job_id,action_type,
    from_status,to_status,from_qualification_level,to_qualification_level,
    reason,approved_by,evidence_refs
  ) values (
    p_employee_id,v_job.intent_id,v_job.id,p_action_type,
    v_from_status,v_to_status,v_from_level,v_to_level,
    v_reason,v_approval.decided_by,coalesce(p_evidence_refs,'[]'::jsonb)
  );

  insert into vaos_private.events(type,source,payload)
  values(
    'WORKFORCE.DIGITAL_EMPLOYEE.TRANSITIONED',
    v_approval.decided_by,
    jsonb_build_object(
      'employeeId',p_employee_id,
      'intentId',v_job.intent_id,
      'executionJobId',v_job.id,
      'actionType',p_action_type,
      'fromStatus',v_from_status,
      'toStatus',v_to_status,
      'qualificationLevel',v_to_level,
      'assessmentId',case when p_action_type='WORKFORCE.QUALIFY' then v_assessment.id else null end
    )
  );

  return jsonb_build_object(
    'outcome','CREATED',
    'employee',vaos_private.digital_employee_snapshot(p_employee_id),
    'transition',jsonb_build_object(
      'actionType',p_action_type,
      'fromStatus',v_from_status,
      'toStatus',v_to_status,
      'approvedBy',v_approval.decided_by,
      'assessmentId',case when p_action_type='WORKFORCE.QUALIFY' then v_assessment.id else null end
    )
  );
end;
$$;
revoke all on function vaos_private.apply_digital_employee_transition(uuid,uuid,text,text,smallint,jsonb)
  from public, anon, authenticated, service_role;
