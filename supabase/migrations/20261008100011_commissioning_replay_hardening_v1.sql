-- Operational commissioning replay hardening v1.
-- Preserves immutable Knowledge trace effects across duplicate governed intents and
-- promotes unresolved dead-letter lineage from diagnostics to a commissioning gate.

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

  select * into v_link
  from vaos_private.digital_thread_links
  where source_domain='PROJECT_RISK'
    and source_record_id=v_risk.id
    and relation_type=p_relation_type
    and target_domain='ENGINEERING_BASELINE'
    and target_record_id=v_baseline.id
  order by created_at asc
  limit 1;

  if v_link.id is not null then
    return jsonb_build_object(
      'outcome','REPLAY',
      'link',jsonb_build_object(
        'id',v_link.id,
        'sourceRiskId',p_source_risk_id,
        'targetBaseline',p_target_baseline,
        'relationType',v_link.relation_type,
        'intentId',v_link.intent_id,
        'executionJobId',v_link.execution_job_id,
        'replayedFromIntentId',v_link.intent_id,
        'replayedFromExecutionJobId',v_link.execution_job_id
      )
    );
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

revoke all on function public.vaos_link_knowledge_qualification(text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.vaos_link_knowledge_qualification(text,text,text,text,text,text)
  to service_role;

create or replace function public.vaos_operational_commissioning_snapshot(
  p_server_key text
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_active_count integer := 0;
  v_qualification_count integer := 0;
  v_contract_count integer := 0;
  v_governed_agents integer := 0;
  v_verified_agents integer := 0;
  v_release_prepared integer := 0;
  v_pending_approvals integer := 0;
  v_active_execution_jobs integer := 0;
  v_dead_letters integer := 0;
  v_resolved_dead_letters integer := 0;
  v_unresolved_dead_letters integer := 0;
  v_cross_domain_links integer := 0;
  v_executed_links integer := 0;
  v_provider_live_checks integer := 0;
  v_provider_live_count integer := 0;
  v_enabled_provider_overrides integer := 0;
  v_reconciliation_blockers integer := 0;
  v_open_callbacks integer := 0;
  v_core_ready boolean := false;
  v_automation_ready boolean := false;
  v_commissioned boolean := false;
begin
  perform vaos_private.assert_server_key(p_server_key);

  select count(*) into v_active_count
  from vaos_private.digital_employees
  where status='ACTIVE'
    and id in ('knowledge','orchestrator','project','qa','release','risk','security','vibpe');

  select count(*) into v_qualification_count
  from (
    values
      ('knowledge',2),('orchestrator',2),('project',2),('qa',3),
      ('release',2),('risk',3),('security',4),('vibpe',3)
  ) as expected(id,minimum_level)
  join vaos_private.digital_employees de on de.id=expected.id
  where de.status='ACTIVE'
    and de.qualification_level>=expected.minimum_level;

  select count(*) into v_contract_count
  from vaos_private.digital_employees de
  join vaos_private.responsibility_contracts rc on rc.id=de.responsibility_contract_id
  where de.status='ACTIVE'
    and de.id in ('knowledge','orchestrator','project','qa','release','risk','security','vibpe');

  select count(distinct i.agent_id) into v_governed_agents
  from vaos_private.intents i
  where i.agent_id in ('knowledge','orchestrator','project','qa','release','risk','security','vibpe')
    and i.status in ('EXECUTED','AUTHORIZED','PREPARED','DENIED');

  select count(*) into v_verified_agents
  from (
    values ('knowledge'),('orchestrator'),('project'),('qa'),('risk'),('security'),('vibpe')
  ) as expected(id)
  where exists (
    select 1
    from vaos_private.execution_evidence ee
    join vaos_private.intents i on i.id=ee.intent_id
    join vaos_private.execution_jobs j on j.id=ee.job_id
    where i.agent_id=expected.id
      and j.status='SUCCEEDED'
      and coalesce((ee.verification->>'verified')::boolean,false)=true
  );

  select count(*) into v_release_prepared
  from vaos_private.intents i
  where i.agent_id='release'
    and i.action_type='RELEASE.OBSERVE_GATE'
    and i.status='PREPARED'
    and coalesce((i.payload->>'qualificationMode')::boolean,false)=true;

  select count(*) into v_pending_approvals
  from vaos_private.approvals
  where status='PENDING';

  select count(*) into v_active_execution_jobs
  from vaos_private.execution_jobs
  where status in ('PENDING','LEASED','FAILED');

  select count(*) into v_dead_letters
  from vaos_private.execution_jobs
  where status='DEAD_LETTER';

  select count(*) into v_unresolved_dead_letters
  from vaos_private.execution_jobs j
  join vaos_private.intents i on i.id=j.intent_id
  where j.status='DEAD_LETTER'
    and not (
      (
        j.action_type='PROJECT.ESCALATE_RISK'
        and coalesce(j.last_error->>'code','')='QUALIFICATION_TERMINAL'
        and coalesce(i.reason,'')='Execution dead-letter qualification'
        and coalesce(j.payload->>'riskId','')='RSK-QUAL-DEAD'
      )
      or (
        j.action_type='WORKFORCE.QUALIFY'
        and coalesce(j.last_error->>'code','')='WORKFORCE_QUALIFICATION_ASSESSMENT_REFERENCE_REQUIRED'
        and exists (
          select 1
          from vaos_private.execution_jobs recovered_job
          join vaos_private.intents recovered_intent on recovered_intent.id=recovered_job.intent_id
          join vaos_private.execution_evidence recovered_evidence on recovered_evidence.job_id=recovered_job.id
          where recovered_job.status='SUCCEEDED'
            and recovered_job.action_type='WORKFORCE.QUALIFY'
            and recovered_job.created_at>j.created_at
            and coalesce(recovered_intent.payload->>'employeeId','')=coalesce(i.payload->>'employeeId','')
            and coalesce(recovered_intent.payload->>'qualificationLevel','')=coalesce(i.payload->>'qualificationLevel','')
            and coalesce((recovered_evidence.verification->>'verified')::boolean,false)=true
        )
      )
      or (
        j.action_type='DIGITAL_THREAD.CREATE_LINK'
        and coalesce(j.payload->>'qualificationKnowledgeLink','')='true'
        and exists (
          select 1
          from vaos_private.digital_thread_links resolved_link
          where resolved_link.relation_type=coalesce(j.payload->>'relationType','')
            and coalesce(resolved_link.context->>'sourceRiskId','')=coalesce(j.payload->>'sourceRiskId','')
            and coalesce(resolved_link.context->>'targetBaseline','')=coalesce(j.payload->>'targetBaseline','')
            and coalesce(resolved_link.context->>'knowledgeQualification','')='true'
        )
      )
    );

  v_resolved_dead_letters := greatest(0,v_dead_letters-v_unresolved_dead_letters);

  select
    count(*) filter (where source_domain<>target_domain),
    count(*) filter (where execution_job_id is not null)
  into v_cross_domain_links,v_executed_links
  from vaos_private.digital_thread_links;

  select count(*),count(distinct provider_id)
  into v_provider_live_checks,v_provider_live_count
  from vaos_private.provider_qualification_evidence
  where provider_id in ('playwright','node-red','opentelemetry')
    and stage='ephemeral-live'
    and outcome='pass'
    and evidence_class='live';

  select count(*) into v_enabled_provider_overrides
  from vaos_private.provider_control_state
  where lower(coalesce(state->>'enabled','false'))='true';

  select count(*) into v_reconciliation_blockers
  from vaos_private.automation_reconciliation
  where state in ('PENDING','LEASED','MANUAL_REVIEW');

  select count(*) into v_open_callbacks
  from vaos_private.callback_receipts
  where consumed_at is null
    and expires_at>now();

  v_core_ready :=
    v_active_count=8
    and v_qualification_count=8
    and v_contract_count=8
    and v_governed_agents=8
    and v_verified_agents=7
    and v_release_prepared>=2
    and v_pending_approvals=0
    and v_active_execution_jobs=0
    and v_unresolved_dead_letters=0
    and v_cross_domain_links>=1
    and v_executed_links>=1;

  v_automation_ready :=
    v_provider_live_checks>=9
    and v_provider_live_count=3
    and v_enabled_provider_overrides=0
    and v_reconciliation_blockers=0
    and v_open_callbacks=0;

  v_commissioned := v_core_ready and v_automation_ready;

  return jsonb_build_object(
    'schemaVersion','vaos.operational-commissioning.v2',
    'assessedAt',now(),
    'state',case when v_commissioned then 'COMMISSIONED' else 'NOT_READY' end,
    'externalProviderState',case when v_automation_ready then 'READY_LOCKED' else 'NOT_READY' end,
    'criteria',jsonb_build_array(
      jsonb_build_object('id','workforce_active','required',8,'actual',v_active_count,'pass',v_active_count=8),
      jsonb_build_object('id','qualification_floor','required',8,'actual',v_qualification_count,'pass',v_qualification_count=8),
      jsonb_build_object('id','contracts_linked','required',8,'actual',v_contract_count,'pass',v_contract_count=8),
      jsonb_build_object('id','governed_activity','required',8,'actual',v_governed_agents,'pass',v_governed_agents=8),
      jsonb_build_object('id','verified_execution_evidence','required',7,'actual',v_verified_agents,'pass',v_verified_agents=7),
      jsonb_build_object('id','release_recommendation_evidence','required',2,'actual',v_release_prepared,'pass',v_release_prepared>=2),
      jsonb_build_object('id','approval_queue_clear','required',0,'actual',v_pending_approvals,'pass',v_pending_approvals=0),
      jsonb_build_object('id','execution_queue_clear','required',0,'actual',v_active_execution_jobs,'pass',v_active_execution_jobs=0),
      jsonb_build_object('id','dead_letter_resolution','required',0,'actual',v_unresolved_dead_letters,'pass',v_unresolved_dead_letters=0),
      jsonb_build_object('id','cross_domain_traceability','required',1,'actual',least(v_cross_domain_links,v_executed_links),'pass',v_cross_domain_links>=1 and v_executed_links>=1),
      jsonb_build_object('id','provider_wave1_live_evidence','required',9,'actual',v_provider_live_checks,'pass',v_provider_live_checks>=9 and v_provider_live_count=3),
      jsonb_build_object('id','provider_routing_locked','required',0,'actual',v_enabled_provider_overrides,'pass',v_enabled_provider_overrides=0),
      jsonb_build_object('id','reconciliation_queue_clear','required',0,'actual',v_reconciliation_blockers,'pass',v_reconciliation_blockers=0),
      jsonb_build_object('id','callback_queue_clear','required',0,'actual',v_open_callbacks,'pass',v_open_callbacks=0)
    ),
    'diagnostics',jsonb_build_object(
      'deadLettersHistorical',v_dead_letters,
      'deadLettersResolved',v_resolved_dead_letters,
      'deadLettersUnresolved',v_unresolved_dead_letters,
      'crossDomainLinks',v_cross_domain_links,
      'executedDigitalThreadLinks',v_executed_links,
      'wave1ProvidersWithLiveEvidence',v_provider_live_count
    )
  );
end;
$$;

revoke all on function public.vaos_operational_commissioning_snapshot(text)
  from public, anon, authenticated;
grant execute on function public.vaos_operational_commissioning_snapshot(text)
  to service_role;
