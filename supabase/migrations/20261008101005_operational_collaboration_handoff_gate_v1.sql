-- Operational collaboration handoff gate v1.
-- Derives eight-agent commissioning coverage from existing execution-bound digital-thread lineage,
-- verified Orchestrator activation handoffs, and Release prepare-only evidence.

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
  v_thread_handoff_agents integer := 0;
  v_orchestrator_handoff_targets integer := 0;
  v_collaboration_coverage integer := 0;
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

  with resolved_links as (
    select
      l.intent_id as link_intent_id,
      case l.source_domain
        when 'QA_CAPA' then (select c.intent_id from vaos_private.capa_records c where c.id=l.source_record_id)
        when 'ENGINEERING_BASELINE' then (select e.intent_id from vaos_private.engineering_baseline_changes e where e.id=l.source_record_id)
        when 'PROJECT_RISK' then (select r.intent_id from vaos_private.project_risk_escalations r where r.id=l.source_record_id)
        when 'SECURITY_IDENTITY_OBSERVATION' then (select s.intent_id from vaos_private.security_identity_observations s where s.id=l.source_record_id)
        else null
      end as source_intent_id,
      case l.target_domain
        when 'QA_CAPA' then (select c.intent_id from vaos_private.capa_records c where c.id=l.target_record_id)
        when 'ENGINEERING_BASELINE' then (select e.intent_id from vaos_private.engineering_baseline_changes e where e.id=l.target_record_id)
        when 'PROJECT_RISK' then (select r.intent_id from vaos_private.project_risk_escalations r where r.id=l.target_record_id)
        when 'SECURITY_IDENTITY_OBSERVATION' then (select s.intent_id from vaos_private.security_identity_observations s where s.id=l.target_record_id)
        else null
      end as target_intent_id
    from vaos_private.digital_thread_links l
    where l.execution_job_id is not null
  ),
  thread_agents as (
    select source_intent.agent_id
    from resolved_links rl
    join vaos_private.intents source_intent on source_intent.id=rl.source_intent_id
    union
    select linking_intent.agent_id
    from resolved_links rl
    join vaos_private.intents linking_intent on linking_intent.id=rl.link_intent_id
    union
    select target_intent.agent_id
    from resolved_links rl
    join vaos_private.intents target_intent on target_intent.id=rl.target_intent_id
  )
  select count(distinct agent_id) into v_thread_handoff_agents
  from thread_agents
  where agent_id in ('knowledge','project','qa','risk','security','vibpe');

  select count(distinct i.payload->>'employeeId') into v_orchestrator_handoff_targets
  from vaos_private.intents i
  join vaos_private.execution_jobs j on j.intent_id=i.id
  join vaos_private.execution_evidence execution_evidence on execution_evidence.job_id=j.id
  where i.agent_id='orchestrator'
    and i.action_type='WORKFORCE.ACTIVATE'
    and i.status='EXECUTED'
    and j.status='SUCCEEDED'
    and coalesce((execution_evidence.verification->>'verified')::boolean,false)=true
    and i.payload->>'employeeId' in ('knowledge','project','qa','release','risk','security','vibpe');

  v_collaboration_coverage :=
    v_thread_handoff_agents
    + case when v_orchestrator_handoff_targets=7 then 1 else 0 end
    + case when v_release_prepared>=2 then 1 else 0 end;

  v_core_ready :=
    v_active_count=8
    and v_qualification_count=8
    and v_contract_count=8
    and v_governed_agents=8
    and v_thread_handoff_agents=6
    and v_orchestrator_handoff_targets=7
    and v_collaboration_coverage=8
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
    'schemaVersion','vaos.operational-commissioning.v3',
    'assessedAt',now(),
    'state',case when v_commissioned then 'COMMISSIONED' else 'NOT_READY' end,
    'externalProviderState',case when v_automation_ready then 'READY_LOCKED' else 'NOT_READY' end,
    'criteria',jsonb_build_array(
      jsonb_build_object('id','workforce_active','required',8,'actual',v_active_count,'pass',v_active_count=8),
      jsonb_build_object('id','qualification_floor','required',8,'actual',v_qualification_count,'pass',v_qualification_count=8),
      jsonb_build_object('id','contracts_linked','required',8,'actual',v_contract_count,'pass',v_contract_count=8),
      jsonb_build_object('id','governed_activity','required',8,'actual',v_governed_agents,'pass',v_governed_agents=8),
      jsonb_build_object('id','agent_handoff_coverage','required',8,'actual',v_collaboration_coverage,'pass',v_collaboration_coverage=8),
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
      'threadHandoffAgents',v_thread_handoff_agents,
      'orchestratorActivatedPeers',v_orchestrator_handoff_targets,
      'collaborationCoverage',v_collaboration_coverage,
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
