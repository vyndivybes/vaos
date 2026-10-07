-- Digital Workforce v1: durable Digital Employee registry + responsibility contracts.
-- Applied to Supabase as migration 20261007131344 / digital_workforce_v1.
create table if not exists vaos_private.responsibility_contracts (
  id text primary key,
  role text not null,
  mission text not null,
  outcomes jsonb not null default '[]'::jsonb,
  autonomous_actions jsonb not null default '[]'::jsonb,
  approval_required_actions jsonb not null default '[]'::jsonb,
  prohibited_actions jsonb not null default '[]'::jsonb,
  escalation_conditions jsonb not null default '[]'::jsonb,
  approval_thresholds jsonb not null default '{}'::jsonb,
  evidence_requirements jsonb not null default '[]'::jsonb,
  version text not null default '1.0.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint responsibility_contract_id_format check (id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  constraint responsibility_contract_outcomes_array check (jsonb_typeof(outcomes)='array'),
  constraint responsibility_contract_autonomous_array check (jsonb_typeof(autonomous_actions)='array'),
  constraint responsibility_contract_approval_array check (jsonb_typeof(approval_required_actions)='array'),
  constraint responsibility_contract_prohibited_array check (jsonb_typeof(prohibited_actions)='array'),
  constraint responsibility_contract_escalation_array check (jsonb_typeof(escalation_conditions)='array'),
  constraint responsibility_contract_thresholds_object check (jsonb_typeof(approval_thresholds)='object'),
  constraint responsibility_contract_evidence_array check (jsonb_typeof(evidence_requirements)='array')
);

create table if not exists vaos_private.digital_employees (
  id text primary key,
  name text not null,
  role text not null,
  department text not null,
  mission text not null,
  responsibilities jsonb not null default '[]'::jsonb,
  responsibility_contract_id text not null references vaos_private.responsibility_contracts(id) on update cascade on delete restrict,
  qualification_level smallint not null default 0,
  status text not null default 'PROPOSED',
  skills jsonb not null default '[]'::jsonb,
  tools jsonb not null default '[]'::jsonb,
  kpis jsonb not null default '[]'::jsonb,
  escalation_paths jsonb not null default '[]'::jsonb,
  capabilities jsonb not null default '{}'::jsonb,
  owner text not null,
  supervisor text not null,
  autonomy_level smallint not null default 0,
  model_requirements jsonb not null default '{}'::jsonb,
  cost_budget jsonb not null default '{}'::jsonb,
  sla jsonb not null default '{}'::jsonb,
  memory_policy jsonb not null default '{}'::jsonb,
  context_policy jsonb not null default '{}'::jsonb,
  current_assignment text not null default 'Awaiting work',
  priority text not null default 'NORMAL',
  confidence smallint not null default 0,
  heartbeat_at timestamptz,
  qualification_record jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  version text not null default '1.0.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint digital_employee_id_format check (id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  constraint digital_employee_qualification check (qualification_level between 0 and 4),
  constraint digital_employee_status check (status in ('PROPOSED','TRAINING','QUALIFIED','ACTIVE','RESTRICTED','RETRAINING','RETIRED')),
  constraint digital_employee_autonomy check (autonomy_level between 0 and 5),
  constraint digital_employee_priority check (priority in ('LOW','NORMAL','HIGH','CRITICAL')),
  constraint digital_employee_confidence check (confidence between 0 and 100),
  constraint digital_employee_responsibilities_array check (jsonb_typeof(responsibilities)='array'),
  constraint digital_employee_skills_array check (jsonb_typeof(skills)='array'),
  constraint digital_employee_tools_array check (jsonb_typeof(tools)='array'),
  constraint digital_employee_kpis_array check (jsonb_typeof(kpis)='array'),
  constraint digital_employee_escalation_array check (jsonb_typeof(escalation_paths)='array'),
  constraint digital_employee_capabilities_object check (jsonb_typeof(capabilities)='object'),
  constraint digital_employee_model_object check (jsonb_typeof(model_requirements)='object'),
  constraint digital_employee_budget_object check (jsonb_typeof(cost_budget)='object'),
  constraint digital_employee_sla_object check (jsonb_typeof(sla)='object'),
  constraint digital_employee_memory_object check (jsonb_typeof(memory_policy)='object'),
  constraint digital_employee_context_object check (jsonb_typeof(context_policy)='object'),
  constraint digital_employee_evidence_array check (jsonb_typeof(evidence_refs)='array')
);

alter table vaos_private.responsibility_contracts enable row level security;
alter table vaos_private.digital_employees enable row level security;
revoke all on table vaos_private.responsibility_contracts from public, anon, authenticated, service_role;
revoke all on table vaos_private.digital_employees from public, anon, authenticated, service_role;

create index if not exists digital_employees_status_idx on vaos_private.digital_employees(status);
create index if not exists digital_employees_department_idx on vaos_private.digital_employees(department);
create index if not exists digital_employees_contract_idx on vaos_private.digital_employees(responsibility_contract_id);

insert into vaos_private.responsibility_contracts
(id, role, mission, outcomes, autonomous_actions, approval_required_actions, prohibited_actions, escalation_conditions, approval_thresholds, evidence_requirements, version)
values
('orchestrator-contract','Enterprise Orchestrator','Coordinate cross-domain work, decisions and escalation while preserving policy and evidence.','["Cross-domain work remains coordinated","Governed escalations reach accountable authority"]','[]','["PROJECT.ESCALATE_RISK"]','[]','["Authority boundary reached","Cross-domain conflict","Required evidence unavailable"]','{"highRisk":"human-approval","criticalRisk":"human-approval"}','["Decision event","Execution evidence"]','1.0.0'),
('vibpe-contract','Engineering Intelligence','Protect engineering baseline integrity and prepare governed technical decisions.','["Engineering changes remain traceable","Baseline decisions are evidence-backed"]','[]','["ENGINEERING.BASELINE_CHANGE"]','[]','["Verification evidence missing","Authority boundary reached","Configuration conflict"]','{"baselineChange":"human-approval"}','["Engineering change record","Verification evidence"]','1.0.0'),
('qa-contract','Quality Assurance','Detect quality issues, coordinate CAPA and preserve closed-loop verification evidence.','["CAPA actions remain governed","Quality closure is evidence-backed"]','[]','["QA.OPEN_CAPA"]','[]','["Safety impact detected","Repeated non-conformance","Verification ineffective"]','{"capaOpen":"human-approval"}','["CAPA record","Effectiveness evidence"]','1.0.0'),
('risk-contract','Enterprise Risk','Monitor enterprise exposure and escalate risks that exceed governed tolerance.','["Material risks are surfaced","Escalations retain accountable ownership"]','[]','["PROJECT.ESCALATE_RISK"]','[]','["Tolerance exceeded","Risk propagation detected","Mitigation ownership absent"]','{"riskEscalation":"human-approval"}','["Risk record","Mitigation evidence"]','1.0.0'),
('release-contract','Release Assurance','Observe release readiness and recommend action from governed evidence.','["Release decisions use current evidence","Missing gates are surfaced before release"]','["RELEASE.OBSERVE_GATE"]','[]','[]','["Release gate incomplete","Evidence stale","Critical dependency unresolved"]','{"releaseEffect":"human-approval"}','["Release gate evidence"]','1.0.0'),
('project-contract','Project Controls','Track execution variance and prepare governed project-risk escalation.','["Schedule variance is visible","Project decisions use current execution evidence"]','[]','["PROJECT.ESCALATE_RISK"]','[]','["Milestone tolerance exceeded","Resource constraint unresolved","Dependency threatens commitment"]','{"riskEscalation":"human-approval"}','["Project control evidence"]','1.0.0'),
('security-contract','Security Assurance','Monitor identity and policy state and escalate material security drift.','["Identity drift is visible","Security exceptions are governed"]','[]','["SECURITY.OBSERVE_IDENTITY"]','[]','["Identity control drift","Policy violation","Privileged access anomaly"]','{"securityEffect":"human-approval"}','["Security observation evidence"]','1.0.0'),
('knowledge-contract','Knowledge Governance','Maintain source authority, enterprise context and governed digital-thread relationships.','["Enterprise knowledge remains traceable","Cross-domain links preserve source authority"]','["KNOWLEDGE.READ_GRAPH"]','["DIGITAL_THREAD.CREATE_LINK"]','[]','["Source authority uncertain","Conflicting evidence","Cross-domain link requires governance"]','{"digitalThreadWrite":"human-approval"}','["Source reference","Governed link evidence"]','1.0.0')
on conflict (id) do update set role=excluded.role, mission=excluded.mission, outcomes=excluded.outcomes, autonomous_actions=excluded.autonomous_actions, approval_required_actions=excluded.approval_required_actions, prohibited_actions=excluded.prohibited_actions, escalation_conditions=excluded.escalation_conditions, approval_thresholds=excluded.approval_thresholds, evidence_requirements=excluded.evidence_requirements, version=excluded.version, updated_at=now();

insert into vaos_private.digital_employees
(id,name,role,department,mission,responsibilities,responsibility_contract_id,qualification_level,status,skills,tools,kpis,escalation_paths,capabilities,owner,supervisor,autonomy_level,model_requirements,cost_budget,sla,memory_policy,context_policy,current_assignment,priority,confidence,heartbeat_at,qualification_record,evidence_refs,version)
values
('orchestrator','VAOS Orchestrator','Enterprise Orchestrator','Enterprise Operations','Coordinate cross-domain work, decisions and escalation while preserving policy and evidence.','["Coordinate cross-domain intents","Route governed decisions","Escalate unresolved enterprise risk"]','orchestrator-contract',0,'PROPOSED','["Orchestration","Decision routing","Risk coordination"]','["VAOS control plane","Evidence ledger"]','["Decision latency","Escalation closure"]','["Human governance"]','{"PROJECT.ESCALATE_RISK":5}','Vāyū Shastr Pvt. Ltd.','Human governance',4,'{"minimumQualification":"Q2_BUSINESS","reasoning":"high","fallbackAllowed":true}','{"mode":"governed","limitConfigured":false}','{"class":"standard","deadlinePolicy":"assignment-controlled"}','{"scope":"role","retention":"governed","sensitiveData":"least-privilege"}','{"sourceAuthority":"required","compaction":"enabled","crossDomain":"governed"}','Coordinating event and approval flow','HIGH',97,null,null,'[]','1.0.0'),
('vibpe','VIBPE Engineering','Engineering Intelligence','Engineering','Protect engineering baseline integrity and prepare governed technical decisions.','["Analyse engineering change impact","Protect configuration integrity","Prepare evidence-backed decisions"]','vibpe-contract',0,'PROPOSED','["Engineering analysis","Configuration control","Verification planning"]','["VAOS control plane","Digital thread","Evidence ledger"]','["Decision quality","Evidence completeness"]','["Engineering authority","Human governance"]','{"ENGINEERING.BASELINE_CHANGE":5}','Vāyū Shastr Pvt. Ltd.','Human governance',4,'{"minimumQualification":"Q3_ENGINEERING","reasoning":"high","fallbackAllowed":false}','{"mode":"governed","limitConfigured":false}','{"class":"engineering","deadlinePolicy":"assignment-controlled"}','{"scope":"role","retention":"governed","sensitiveData":"least-privilege"}','{"sourceAuthority":"required","compaction":"enabled","crossDomain":"governed"}','Monitoring engineering baseline changes','HIGH',94,null,null,'[]','1.0.0'),
('qa','QA / CAPA Agent','Quality Assurance','Quality','Detect quality issues, coordinate CAPA and preserve closed-loop verification evidence.','["Detect recurring non-conformance","Prepare CAPA","Verify closure evidence"]','qa-contract',0,'PROPOSED','["Quality assurance","CAPA","Root-cause coordination"]','["VAOS control plane","Evidence ledger"]','["CAPA closure quality","Recurrence rate"]','["Quality authority","Human governance"]','{"QA.OPEN_CAPA":4}','Vāyū Shastr Pvt. Ltd.','Human governance',4,'{"minimumQualification":"Q3_ENGINEERING","reasoning":"high","fallbackAllowed":false}','{"mode":"governed","limitConfigured":false}','{"class":"quality","deadlinePolicy":"assignment-controlled"}','{"scope":"role","retention":"governed","sensitiveData":"least-privilege"}','{"sourceAuthority":"required","compaction":"enabled","crossDomain":"governed"}','Monitoring durable CAPA state','HIGH',91,null,null,'[]','1.0.0'),
('risk','Risk Agent','Enterprise Risk','Governance','Monitor enterprise exposure and escalate risks that exceed governed tolerance.','["Monitor risk exposure","Prepare escalation","Track mitigation ownership"]','risk-contract',0,'PROPOSED','["Risk analysis","Scenario assessment","Escalation"]','["VAOS control plane","Evidence ledger"]','["Risk closure","Mitigation timeliness"]','["Human governance"]','{"PROJECT.ESCALATE_RISK":4}','Vāyū Shastr Pvt. Ltd.','Human governance',4,'{"minimumQualification":"Q2_BUSINESS","reasoning":"high","fallbackAllowed":true}','{"mode":"governed","limitConfigured":false}','{"class":"risk","deadlinePolicy":"assignment-controlled"}','{"scope":"role","retention":"governed","sensitiveData":"least-privilege"}','{"sourceAuthority":"required","compaction":"enabled","crossDomain":"governed"}','Monitoring enterprise risk exposure','HIGH',89,null,null,'[]','1.0.0'),
('release','Release Agent','Release Assurance','Delivery','Observe release readiness and recommend action from governed evidence.','["Observe release gates","Detect stale evidence","Recommend release action"]','release-contract',0,'PROPOSED','["Release assurance","Evidence review"]','["Evidence ledger"]','["Gate completeness","Evidence freshness"]','["Release authority"]','{"RELEASE.OBSERVE_GATE":2}','Vāyū Shastr Pvt. Ltd.','Human governance',2,'{"minimumQualification":"Q2_BUSINESS","reasoning":"medium","fallbackAllowed":true}','{"mode":"governed","limitConfigured":false}','{"class":"release","deadlinePolicy":"assignment-controlled"}','{"scope":"role","retention":"governed","sensitiveData":"least-privilege"}','{"sourceAuthority":"required","compaction":"enabled","crossDomain":"governed"}','Watching release gate evidence','NORMAL',96,null,null,'[]','1.0.0'),
('project','Project Controls','Project Controls','Management','Track execution variance and prepare governed project-risk escalation.','["Track milestone variance","Surface resource constraints","Prepare project-risk escalation"]','project-contract',0,'PROPOSED','["Project controls","Schedule analysis","Dependency tracking"]','["VAOS control plane","Evidence ledger"]','["Milestone predictability","Escalation timeliness"]','["Project authority","Human governance"]','{"PROJECT.ESCALATE_RISK":3}','Vāyū Shastr Pvt. Ltd.','Human governance',3,'{"minimumQualification":"Q2_BUSINESS","reasoning":"medium","fallbackAllowed":true}','{"mode":"governed","limitConfigured":false}','{"class":"project","deadlinePolicy":"assignment-controlled"}','{"scope":"role","retention":"governed","sensitiveData":"least-privilege"}','{"sourceAuthority":"required","compaction":"enabled","crossDomain":"governed"}','Tracking milestone variance','NORMAL',92,null,null,'[]','1.0.0'),
('security','Security Agent','Security Assurance','Security','Monitor identity and policy state and escalate material security drift.','["Monitor identity state","Detect policy drift","Escalate material security exceptions"]','security-contract',0,'PROPOSED','["Security monitoring","Identity governance","Policy assurance"]','["VAOS control plane","Evidence ledger"]','["Exception detection","Closure timeliness"]','["Security authority","Human governance"]','{"SECURITY.OBSERVE_IDENTITY":4}','Vāyū Shastr Pvt. Ltd.','Human governance',2,'{"minimumQualification":"Q4_HIGH_ASSURANCE","reasoning":"high","fallbackAllowed":false}','{"mode":"governed","limitConfigured":false}','{"class":"security","deadlinePolicy":"assignment-controlled"}','{"scope":"role","retention":"governed","sensitiveData":"least-privilege"}','{"sourceAuthority":"required","compaction":"enabled","crossDomain":"restricted"}','Monitoring identity and policy state','HIGH',98,null,null,'[]','1.0.0'),
('knowledge','Knowledge Agent','Knowledge Governance','Intelligence','Maintain source authority, enterprise context and governed digital-thread relationships.','["Maintain source authority","Read enterprise graph","Prepare governed cross-domain links"]','knowledge-contract',0,'PROPOSED','["Knowledge governance","Source authority","Digital-thread authoring"]','["Digital thread","Evidence ledger"]','["Source quality","Traceability completeness"]','["Human governance"]','{"KNOWLEDGE.READ_GRAPH":1,"DIGITAL_THREAD.CREATE_LINK":4}','Vāyū Shastr Pvt. Ltd.','Human governance',4,'{"minimumQualification":"Q2_BUSINESS","reasoning":"high","fallbackAllowed":true}','{"mode":"governed","limitConfigured":false}','{"class":"knowledge","deadlinePolicy":"assignment-controlled"}','{"scope":"role","retention":"governed","sensitiveData":"least-privilege"}','{"sourceAuthority":"required","compaction":"enabled","crossDomain":"governed"}','Maintaining source authority and digital thread','NORMAL',93,null,null,'[]','1.0.0')
on conflict (id) do update set name=excluded.name, role=excluded.role, department=excluded.department, mission=excluded.mission, responsibilities=excluded.responsibilities, responsibility_contract_id=excluded.responsibility_contract_id, skills=excluded.skills, tools=excluded.tools, kpis=excluded.kpis, escalation_paths=excluded.escalation_paths, capabilities=excluded.capabilities, owner=excluded.owner, supervisor=excluded.supervisor, autonomy_level=excluded.autonomy_level, model_requirements=excluded.model_requirements, cost_budget=excluded.cost_budget, sla=excluded.sla, memory_policy=excluded.memory_policy, context_policy=excluded.context_policy, current_assignment=excluded.current_assignment, priority=excluded.priority, confidence=excluded.confidence, version=excluded.version, updated_at=now();

alter function public.vaos_control_snapshot(text) rename to vaos_control_snapshot_core;
revoke all on function public.vaos_control_snapshot_core(text) from public, anon, authenticated;
grant execute on function public.vaos_control_snapshot_core(text) to service_role;

create function public.vaos_control_snapshot(p_server_key text)
returns jsonb language plpgsql security definer
set search_path = vaos_private, public, pg_temp
as $$
declare v_snapshot jsonb;
begin
  v_snapshot := public.vaos_control_snapshot_core(p_server_key);
  return v_snapshot || jsonb_build_object(
    'workforce', jsonb_build_object(
      'digitalEmployees', coalesce((select jsonb_agg(jsonb_build_object(
        'id',e.id,'name',e.name,'role',e.role,'department',e.department,'mission',e.mission,
        'responsibilities',e.responsibilities,'responsibilityContractId',e.responsibility_contract_id,
        'qualificationLevel',e.qualification_level,'status',e.status,'skills',e.skills,'tools',e.tools,
        'kpis',e.kpis,'escalationPaths',e.escalation_paths,'capabilities',e.capabilities,'owner',e.owner,
        'supervisor',e.supervisor,'autonomyLevel',e.autonomy_level,'modelRequirements',e.model_requirements,
        'costBudget',e.cost_budget,'sla',e.sla,'memoryPolicy',e.memory_policy,'contextPolicy',e.context_policy,
        'currentAssignment',e.current_assignment,'priority',e.priority,'confidence',e.confidence,
        'heartbeatAt',e.heartbeat_at,'qualificationRecord',e.qualification_record,'evidenceRefs',e.evidence_refs,
        'version',e.version,'createdAt',e.created_at,'updatedAt',e.updated_at
      ) order by e.department,e.name) from vaos_private.digital_employees e),'[]'::jsonb),
      'responsibilityContracts', coalesce((select jsonb_agg(jsonb_build_object(
        'id',c.id,'role',c.role,'mission',c.mission,'outcomes',c.outcomes,'autonomousActions',c.autonomous_actions,
        'approvalRequiredActions',c.approval_required_actions,'prohibitedActions',c.prohibited_actions,
        'escalationConditions',c.escalation_conditions,'approvalThresholds',c.approval_thresholds,
        'evidenceRequirements',c.evidence_requirements,'version',c.version,'createdAt',c.created_at,'updatedAt',c.updated_at
      ) order by c.role) from vaos_private.responsibility_contracts c),'[]'::jsonb),
      'metrics',jsonb_build_object(
        'totalDigitalEmployees',(select count(*) from vaos_private.digital_employees),
        'proposedDigitalEmployees',(select count(*) from vaos_private.digital_employees where status='PROPOSED'),
        'qualifiedDigitalEmployees',(select count(*) from vaos_private.digital_employees where status in ('QUALIFIED','ACTIVE')),
        'activeDigitalEmployees',(select count(*) from vaos_private.digital_employees where status='ACTIVE'),
        'restrictedDigitalEmployees',(select count(*) from vaos_private.digital_employees where status='RESTRICTED'),
        'responsibilityContracts',(select count(*) from vaos_private.responsibility_contracts)
      )
    )
  );
end;
$$;
revoke all on function public.vaos_control_snapshot(text) from public, anon, authenticated;
grant execute on function public.vaos_control_snapshot(text) to service_role;
