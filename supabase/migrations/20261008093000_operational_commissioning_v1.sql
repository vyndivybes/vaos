-- VAOS operational commissioning v1.
-- Restores immutable Wave-1 live evidence and exposes a live commissioning snapshot.
-- External providers remain locked; this migration never enables provider routing.

insert into vaos_private.provider_qualification_evidence(
  provider_id,capability,stage,check_id,outcome,evidence_class,evidence_refs,authority_ref,recorded_at
)
values
  ('playwright','browser.automate','ephemeral-live','live-health','pass','live',
    '["github-actions:37751740838:playwright:live-health","https://github.com/vyndivybes/vaos/actions/runs/37751740838","github-artifact-sha256:ae8bdd3dd679cf9ad82c0787c1867676f489d1c9361af1b93e86cc67ff73ba02"]'::jsonb,
    'github-actions:37751740838:8993c903dfd5d0e76c59268889e1e54964811a68',
    '2026-10-08T08:44:25.883Z'::timestamptz),
  ('playwright','browser.automate','ephemeral-live','happy-path','pass','live',
    '["github-actions:37751740838:playwright:happy-path","https://github.com/vyndivybes/vaos/actions/runs/37751740838","github-artifact-sha256:ae8bdd3dd679cf9ad82c0787c1867676f489d1c9361af1b93e86cc67ff73ba02"]'::jsonb,
    'github-actions:37751740838:8993c903dfd5d0e76c59268889e1e54964811a68',
    '2026-10-08T08:44:25.883Z'::timestamptz),
  ('playwright','browser.automate','ephemeral-live','failure-mode','pass','live',
    '["github-actions:37751740838:playwright:failure-mode","https://github.com/vyndivybes/vaos/actions/runs/37751740838","github-artifact-sha256:ae8bdd3dd679cf9ad82c0787c1867676f489d1c9361af1b93e86cc67ff73ba02"]'::jsonb,
    'github-actions:37751740838:8993c903dfd5d0e76c59268889e1e54964811a68',
    '2026-10-08T08:44:25.883Z'::timestamptz),
  ('node-red','event.edge','ephemeral-live','live-health','pass','live',
    '["github-actions:37751740838:node-red:live-health","https://github.com/vyndivybes/vaos/actions/runs/37751740838","github-artifact-sha256:ae8bdd3dd679cf9ad82c0787c1867676f489d1c9361af1b93e86cc67ff73ba02"]'::jsonb,
    'github-actions:37751740838:8993c903dfd5d0e76c59268889e1e54964811a68',
    '2026-10-08T08:44:25.883Z'::timestamptz),
  ('node-red','event.edge','ephemeral-live','approved-flow-happy-path','pass','live',
    '["github-actions:37751740838:node-red:approved-flow-happy-path","https://github.com/vyndivybes/vaos/actions/runs/37751740838","github-artifact-sha256:ae8bdd3dd679cf9ad82c0787c1867676f489d1c9361af1b93e86cc67ff73ba02"]'::jsonb,
    'github-actions:37751740838:8993c903dfd5d0e76c59268889e1e54964811a68',
    '2026-10-08T08:44:25.883Z'::timestamptz),
  ('node-red','event.edge','ephemeral-live','unknown-route-failure','pass','live',
    '["github-actions:37751740838:node-red:unknown-route-failure","https://github.com/vyndivybes/vaos/actions/runs/37751740838","github-artifact-sha256:ae8bdd3dd679cf9ad82c0787c1867676f489d1c9361af1b93e86cc67ff73ba02"]'::jsonb,
    'github-actions:37751740838:8993c903dfd5d0e76c59268889e1e54964811a68',
    '2026-10-08T08:44:25.883Z'::timestamptz),
  ('opentelemetry','telemetry.observe','ephemeral-live','collector-health','pass','live',
    '["github-actions:37751740838:opentelemetry:collector-health","https://github.com/vyndivybes/vaos/actions/runs/37751740838","github-artifact-sha256:ae8bdd3dd679cf9ad82c0787c1867676f489d1c9361af1b93e86cc67ff73ba02"]'::jsonb,
    'github-actions:37751740838:8993c903dfd5d0e76c59268889e1e54964811a68',
    '2026-10-08T08:44:25.883Z'::timestamptz),
  ('opentelemetry','telemetry.observe','ephemeral-live','otlp-http-ingest','pass','live',
    '["github-actions:37751740838:opentelemetry:otlp-http-ingest","https://github.com/vyndivybes/vaos/actions/runs/37751740838","github-artifact-sha256:ae8bdd3dd679cf9ad82c0787c1867676f489d1c9361af1b93e86cc67ff73ba02"]'::jsonb,
    'github-actions:37751740838:8993c903dfd5d0e76c59268889e1e54964811a68',
    '2026-10-08T08:44:25.883Z'::timestamptz),
  ('opentelemetry','telemetry.observe','ephemeral-live','malformed-payload-failure','pass','live',
    '["github-actions:37751740838:opentelemetry:malformed-payload-failure","https://github.com/vyndivybes/vaos/actions/runs/37751740838","github-artifact-sha256:ae8bdd3dd679cf9ad82c0787c1867676f489d1c9361af1b93e86cc67ff73ba02"]'::jsonb,
    'github-actions:37751740838:8993c903dfd5d0e76c59268889e1e54964811a68',
    '2026-10-08T08:44:25.883Z'::timestamptz)
on conflict (provider_id, capability, check_id, recorded_at, authority_ref) do nothing;

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
    'schemaVersion','vaos.operational-commissioning.v1',
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
      jsonb_build_object('id','cross_domain_traceability','required',1,'actual',least(v_cross_domain_links,v_executed_links),'pass',v_cross_domain_links>=1 and v_executed_links>=1),
      jsonb_build_object('id','provider_wave1_live_evidence','required',9,'actual',v_provider_live_checks,'pass',v_provider_live_checks>=9 and v_provider_live_count=3),
      jsonb_build_object('id','provider_routing_locked','required',0,'actual',v_enabled_provider_overrides,'pass',v_enabled_provider_overrides=0),
      jsonb_build_object('id','reconciliation_queue_clear','required',0,'actual',v_reconciliation_blockers,'pass',v_reconciliation_blockers=0),
      jsonb_build_object('id','callback_queue_clear','required',0,'actual',v_open_callbacks,'pass',v_open_callbacks=0)
    ),
    'diagnostics',jsonb_build_object(
      'deadLettersHistorical',v_dead_letters,
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
