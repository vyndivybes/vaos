-- Additive, empty evidence ledgers. No production writer RPC, policies or authority changes.
-- Timestamp follows V2 because that existing migration is dated later than CLI creation time.
create table vaos_private.department_audit_results (
 id text primary key, employee_id text not null references vaos_private.digital_employees(id),
 route text not null, outcome text not null check(outcome in ('PASS','FAIL','PENDING','UNDER_REVIEW','NOT_APPLICABLE')),
 executed_at timestamptz not null, reviewed_at timestamptz not null,
 reviewer text not null check(length(trim(reviewer))>0 and lower(trim(reviewer))<>employee_id),
 environment text not null check(environment like 'authenticated-%'),
 deployed_commit text not null check(length(trim(deployed_commit))>0),
 canonical_source_ref text not null check(length(trim(canonical_source_ref))>0),
 evidence_refs text[] not null check(cardinality(evidence_refs) between 1 and 20),
 checks_evidence_refs text[] not null check(cardinality(checks_evidence_refs) between 1 and 20),
 checks jsonb not null check(jsonb_typeof(checks)='object'),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 open_findings integer not null check(open_findings>=0), corrective_owner text,
 next_audit_due_at timestamptz not null, rationale text not null check(length(trim(rationale))>0),
 supersedes_id text references vaos_private.department_audit_results(id),
 check(reviewed_at>=executed_at and next_audit_due_at>reviewed_at),
 check(outcome<>'PASS' or open_findings=0),
 check(open_findings=0 or length(trim(corrective_owner))>0 and corrective_owner is not null)
);
create table vaos_private.work_plan_baselines (
 id text primary key, work_package_id text not null unique references vaos_private.work_packages(id),
 approved_at timestamptz not null, approved_by text not null check(length(trim(approved_by))>0),
 planned_start_at timestamptz not null, planned_finish_at timestamptz not null,
 depends_on text[] not null default '{}', evidence_refs text[] not null check(cardinality(evidence_refs) between 1 and 20),
 check(planned_start_at>=approved_at and planned_finish_at>planned_start_at)
);
create table vaos_private.workforce_forecast_qualifications (
 id text primary key, employee_id text not null references vaos_private.digital_employees(id),
 model_version text not null check(length(trim(model_version))>0),
 reviewer text not null check(length(trim(reviewer))>0 and lower(trim(reviewer))<>employee_id),
 qualified_at timestamptz not null, expires_at timestamptz not null,
 lower_at timestamptz not null, projected_finish_at timestamptz not null, upper_at timestamptz not null,
 sample_size integer not null check(sample_size>=20), confidence numeric not null check(confidence>0 and confidence<1),
 backtest_coverage numeric not null check(backtest_coverage>=confidence and backtest_coverage<=1),
 capacity_per_day numeric not null check(capacity_per_day>0 and capacity_per_day<1000000),
 input_sha256 text not null check(input_sha256 ~ '^[a-f0-9]{64}$'),
 baseline_ids text[] not null check(cardinality(baseline_ids)>0),
 evidence_refs text[] not null check(cardinality(evidence_refs) between 1 and 20),
 check(expires_at>qualified_at and lower_at>=qualified_at and lower_at<=projected_finish_at and projected_finish_at<=upper_at)
);
create table vaos_private.capa_evidence_events (
 id text primary key, capa_id text not null references vaos_private.capa_records(capa_id),
 kind text not null check(kind in ('CORRECTION','RETEST_PASS','RETEST_FAIL','CLOSED','REOPENED')),
 occurred_at timestamptz not null, owner text not null check(length(trim(owner))>0),
 reviewer text not null check(length(trim(reviewer))>0 and lower(trim(reviewer))<>lower(trim(owner))),
 evidence_refs text[] not null check(cardinality(evidence_refs) between 1 and 20),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 note text not null check(length(trim(note))>0),
 retest_event_id text references vaos_private.capa_evidence_events(id)
);
create index department_audit_employee_history on vaos_private.department_audit_results(employee_id,reviewed_at desc,id);
create index forecast_employee_history on vaos_private.workforce_forecast_qualifications(employee_id,qualified_at desc,id);
create index capa_evidence_history on vaos_private.capa_evidence_events(capa_id,occurred_at,id);

create function vaos_private.guard_workforce_evidence() returns trigger
language plpgsql set search_path='' as $$
declare v_owner text; v_opened timestamptz; v_retest vaos_private.capa_evidence_events; v_ledger boolean;
begin
 if TG_OP<>'INSERT' then raise exception 'APPEND_ONLY_EVIDENCE'; end if;
 if length(trim(NEW.id))=0 or length(NEW.id)>2000 or exists(
  select 1 from unnest(NEW.evidence_refs) ref where ref is null or length(trim(ref))=0 or length(ref)>2000
 ) then raise exception 'EVIDENCE_REFERENCE_INVALID'; end if;
 if TG_TABLE_NAME='department_audit_results' then
  select s.ledger into v_ledger from (values ('orchestrator','/agent-supervision.html',false),
('orchestrator','/mission-status.html',false),
('orchestrator','/command/control-tower',false),
('orchestrator','/command/governance',false),
('orchestrator','/command/decision-inbox',false),
('vibpe','/command/engineering',false),
('vibpe','/command/technical',false),
('vibpe','/command/ibpe-operating-workspace',false),
('qa','/command/quality',true),
('qa','/command/qa-verification',false),
('qa','/command/epr-live',true),
('risk','/command/risk',false),
('risk','/command/scenarios',false),
('risk','/command/management-intelligence',false),
('security','/command/users',false),
('security','/command/governance',false),
('security','/command/recovery',false),
('security','/agent-supervision.html',false),
('release','/command/deployment-readiness',false),
('release','/command/uat-certification',false),
('release','/command/governance',false),
('project','/command/planning',false),
('project','/command/actuals',false),
('project','/command/operations',false),
('project','/command/control-tower',false),
('knowledge','/command/knowledge',false),
('knowledge','/command/ai-knowledge',false),
('knowledge','/command/technical',false),
('commercial','/command/sales',true),
('commercial','/command/sales-ledger',true),
('commercial','/command/receivables',true),
('commercial','/command/gtm',false),
('procurement','/command/procurement',false),
('procurement','/command/procurement-planning',false),
('procurement','/command/purchase-execution',true),
('procurement','/command/receiving',true),
('inventory','/command/inventory',true),
('inventory','/command/inventory-ledgers',true),
('inventory','/command/inventory-stocktake',true),
('inventory','/command/inventory-control-audit',true),
('production','/command/production',false),
('production','/command/production-jobcards',true),
('production','/command/epr-live',true),
('production','/command/manufacturing',false),
('maintenance','/command/manufacturing',true),
('maintenance','/command/production',false),
('finance','/command/accounting',true),
('finance','/command/accounting-statements',true),
('finance','/command/ca-audit',true),
('finance','/command/balance-sheet',true),
('finance','/command/payables',true),
('finance','/command/receivables',true),
('finance','/command/finance-control',true),
('finance','/command/cash',true),
('people','/command/people-office',true),
('people','/command/accounting/people-office-payments',true),
('people','/command/users',false),
('engineering-configuration','/command/bom-control',true),
('engineering-configuration','/command/bom',true),
('engineering-configuration','/command/bom-inventory-mapping',true),
('engineering-configuration','/command/engineering',false)) s(employee_id,route,ledger)
   where s.employee_id=NEW.employee_id and s.route=NEW.route;
  if not found then raise exception 'AUDIT_ROUTE_OUT_OF_SCOPE'; end if;
  if NEW.reviewed_at>now() or NEW.executed_at>now() then raise exception 'FUTURE_AUDIT_EVIDENCE'; end if;
  if NEW.outcome='PASS' and (not NEW.checks @> '{"navigation":true,"ui":true,"responsive":true,"permissions":true,"records":true,"displays":true,"reconciliation":true,"errorStates":true}'::jsonb
    or v_ledger and not NEW.checks @> '{"ledger":true}'::jsonb) then raise exception 'AUDIT_CHECKS_INCOMPLETE'; end if;
  if NEW.supersedes_id is not null and not exists(select 1 from vaos_private.department_audit_results r
   where r.id=NEW.supersedes_id and r.employee_id=NEW.employee_id and r.route=NEW.route and r.reviewed_at<NEW.reviewed_at)
   then raise exception 'AUDIT_HISTORY_MISMATCH'; end if;
 elsif TG_TABLE_NAME='work_plan_baselines' then
  if NEW.approved_at>now() then raise exception 'FUTURE_BASELINE_APPROVAL'; end if;
  if exists(select 1 from vaos_private.work_packages w where w.id=NEW.work_package_id and w.mission_id like 'VAOS-QUAL-%')
   then raise exception 'QUALIFICATION_PLAN_EXCLUDED'; end if;
  if exists(select 1 from unnest(NEW.depends_on) d where d=NEW.work_package_id or not exists(select 1 from vaos_private.work_packages w where w.id=d))
   then raise exception 'BASELINE_DEPENDENCY_INVALID'; end if;
 elsif TG_TABLE_NAME='workforce_forecast_qualifications' then
  if NEW.qualified_at>now() then raise exception 'FUTURE_FORECAST_QUALIFICATION'; end if;
  if cardinality(NEW.baseline_ids)<>(select count(distinct b.id) from vaos_private.work_plan_baselines b join vaos_private.work_packages w on w.id=b.work_package_id
   where b.id=any(NEW.baseline_ids) and w.owner_agent_id=NEW.employee_id and b.approved_at<=NEW.qualified_at)
   then raise exception 'FORECAST_BASELINES_INVALID'; end if;
 elsif TG_TABLE_NAME='capa_evidence_events' then
  perform 1 from vaos_private.capa_records where capa_id=NEW.capa_id for update;
  select i.agent_id,c.opened_at into v_owner,v_opened from vaos_private.capa_records c join vaos_private.intents i on i.id=c.intent_id where c.capa_id=NEW.capa_id;
  if v_owner is null or lower(trim(NEW.reviewer))=v_owner or NEW.occurred_at>now() or NEW.occurred_at<v_opened then raise exception 'CAPA_REVIEW_INVALID'; end if;
  if NEW.kind='CLOSED' then
   -- All events hold the same parent lock to serialize closure and failure evidence.
   select * into v_retest from vaos_private.capa_evidence_events where id=NEW.retest_event_id;
   if not found or v_retest.capa_id<>NEW.capa_id or v_retest.kind<>'RETEST_PASS' or v_retest.occurred_at>NEW.occurred_at
    then raise exception 'CAPA_PASSING_RETEST_REQUIRED'; end if;
   if exists(select 1 from vaos_private.capa_evidence_events e where e.capa_id=NEW.capa_id and e.kind in ('RETEST_FAIL','REOPENED')
    and e.occurred_at>=v_retest.occurred_at and e.occurred_at<=NEW.occurred_at) then raise exception 'CAPA_RETEST_SUPERSEDED'; end if;
  end if;
 end if;
 return NEW;
end; $$;
revoke all on function vaos_private.guard_workforce_evidence() from public,anon,authenticated,service_role;

alter table vaos_private.department_audit_results enable row level security;
revoke all on vaos_private.department_audit_results from public,anon,authenticated,service_role;
create trigger department_audit_results_append_guard before insert or update or delete on vaos_private.department_audit_results
 for each row execute function vaos_private.guard_workforce_evidence();

alter table vaos_private.work_plan_baselines enable row level security;
revoke all on vaos_private.work_plan_baselines from public,anon,authenticated,service_role;
create trigger work_plan_baselines_append_guard before insert or update or delete on vaos_private.work_plan_baselines
 for each row execute function vaos_private.guard_workforce_evidence();

alter table vaos_private.workforce_forecast_qualifications enable row level security;
revoke all on vaos_private.workforce_forecast_qualifications from public,anon,authenticated,service_role;
create trigger workforce_forecast_qualifications_append_guard before insert or update or delete on vaos_private.workforce_forecast_qualifications
 for each row execute function vaos_private.guard_workforce_evidence();

alter table vaos_private.capa_evidence_events enable row level security;
revoke all on vaos_private.capa_evidence_events from public,anon,authenticated,service_role;
create trigger capa_evidence_events_append_guard before insert or update or delete on vaos_private.capa_evidence_events
 for each row execute function vaos_private.guard_workforce_evidence();

create or replace function public.vaos_founder_workforce_overview(
  p_server_key text, p_actor_email text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_payload jsonb;
begin
  perform vaos_private.assert_server_key(p_server_key);
  if lower(trim(coalesce(p_actor_email,''))) <> 'shyamsundhar1982@gmail.com' then
    raise exception 'FOUNDER_ONLY';
  end if;
  select jsonb_build_object(
    'schemaVersion','VAOS_WORKFORCE_OVERVIEW_V1',
    'observedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'readOnly',true,
    'employees',coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,'name',e.name,'role',e.role,'department',e.department,
      'lifecycle',e.status,'qualificationLevel',e.qualification_level,
      'activitySignal',coalesce(am.observation,'NOT_OBSERVED'),
      'monitorCheckedAt',am.checked_at,
      'lastVerifiedActivityAt',e.heartbeat_at,
      'currentAssignment',e.current_assignment,
      
 'departmentReviews',coalesce((select jsonb_agg(to_jsonb(recent)) from (select r.id as "id",r.route as "route",r.outcome as "outcome",r.executed_at as "executedAt",r.reviewed_at as "reviewedAt",r.reviewer as "reviewer",r.environment as "environment",r.deployed_commit as "deployedCommit",r.canonical_source_ref as "canonicalSourceRef",r.evidence_refs as "evidenceRefs",r.checks_evidence_refs as "checksEvidenceRefs",r.checks as "checks",r.evidence_sha256 as "evidenceSha256",r.open_findings as "openFindings",r.corrective_owner as "correctiveOwner",r.next_audit_due_at as "nextAuditDueAt",r.rationale as "rationale",r.supersedes_id as "supersedesId"
  from vaos_private.department_audit_results r where r.employee_id=e.id order by r.reviewed_at desc,r.id limit 201) recent),'[]'::jsonb),

 'planBaselines',coalesce((select jsonb_agg(to_jsonb(recent)) from (select r.id as "id",r.work_package_id as "workPackageId",r.approved_at as "approvedAt",r.approved_by as "approvedBy",r.planned_start_at as "plannedStartAt",r.planned_finish_at as "plannedFinishAt",r.depends_on as "dependsOn",r.evidence_refs as "evidenceRefs"
  from vaos_private.work_plan_baselines r where r.work_package_id in (select w.id from vaos_private.work_packages w where w.owner_agent_id=e.id) order by r.approved_at desc,r.id limit 201) recent),'[]'::jsonb),

 'forecastQualifications',coalesce((select jsonb_agg(to_jsonb(recent)) from (select r.id as "id",r.model_version as "modelVersion",r.reviewer as "reviewer",r.qualified_at as "qualifiedAt",r.expires_at as "expiresAt",r.lower_at as "lowerAt",r.projected_finish_at as "projectedFinishAt",r.upper_at as "upperAt",r.sample_size as "sampleSize",r.confidence as "confidence",r.backtest_coverage as "backtestCoverage",r.capacity_per_day as "capacityPerDay",r.input_sha256 as "inputSha256",r.baseline_ids as "baselineIds",r.evidence_refs as "evidenceRefs"
  from vaos_private.workforce_forecast_qualifications r where r.employee_id=e.id order by r.qualified_at desc,r.id limit 201) recent),'[]'::jsonb),

 'capaEvents',coalesce((select jsonb_agg(to_jsonb(recent)) from (select r.id as "id",r.capa_id as "capaId",r.kind as "kind",r.occurred_at as "occurredAt",r.owner as "owner",r.reviewer as "reviewer",r.evidence_refs as "evidenceRefs",r.evidence_sha256 as "evidenceSha256",r.note as "note",r.retest_event_id as "retestEventId"
  from vaos_private.capa_evidence_events r where r.capa_id in (select c.capa_id from vaos_private.capa_records c join vaos_private.intents i on i.id=c.intent_id where i.agent_id=e.id) order by r.occurred_at desc,r.id limit 201) recent),'[]'::jsonb),
'employeeReports',coalesce((select jsonb_agg(to_jsonb(recent)) from (
 select v.evidence_id as id,v.author_agent_id as author,h.verified_by_agent_id as reviewer,
 v.created_at as "createdAt",h.verified_at as "verifiedAt",v.report_sha256 as "reportSha256",
 h.id as "handoffId",h.work_package_id as "workPackageId",v.action_type as "actionType"
 from vaos_private.handoff_work_evidence v join vaos_private.agent_handoffs h on h.id=v.handoff_id
 where h.to_agent_id=e.id and v.author_agent_id=e.id and h.status='COMPLETED'
 and h.verified_by_agent_id<>e.id and h.verified_at<=now() and v.created_at<=h.verified_at
 -- Evidence is authored while ACCEPTED, then SUBMIT and VERIFY each advance version.
 and v.handoff_version=h.version-2 and v.action_type=h.requested_job
 and v.report_sha256=encode(pg_catalog.sha256(convert_to(v.report::text,'UTF8')),'hex')
 and v.evidence_id=any(h.evidence_refs)
 and exists(select 1 from vaos_private.agent_handoff_events ev where ev.handoff_id=h.id
  and ev.outcome='VERIFY' and ev.by_agent_id=h.verified_by_agent_id and ev.created_at=h.verified_at
  and ('REVIEWED:'||v.evidence_id)=any(ev.evidence_refs))
 and exists(select 1 from vaos_private.work_packages w where w.id=h.work_package_id
  and w.owner_agent_id=e.id and w.action_type=h.requested_job and w.status='COMPLETED')
 and h.mission_id not like 'VAOS-QUAL-%' order by h.verified_at desc,v.evidence_id limit 201) recent),'[]'::jsonb),
'qualificationAssessment',(
        select jsonb_build_object(
          'status',q.status,
          'targetLevel',q.target_level,
          'assessedAt',q.assessed_at,
          'assessedBy',q.assessed_by
        )
        from vaos_private.digital_employee_qualification_assessments q
        where q.employee_id=e.id
        order by q.assessed_at desc,q.id desc limit 1
      ),
      'capaCounts',coalesce((
        select jsonb_object_agg(summary.status,summary.total)
        from (
          select c.status,count(*) as total
          from vaos_private.capa_records c
          join vaos_private.intents i on i.id=c.intent_id
          where i.agent_id=e.id
          group by c.status
        ) summary
      ),'{}'::jsonb),
      'capaCases',coalesce((
        select jsonb_agg(to_jsonb(recent) order by recent."openedAt" desc,recent.id)
        from (
          select c.capa_id as id,c.status,
            c.source_action as "sourceAction",c.opened_at as "openedAt"
          from vaos_private.capa_records c
          join vaos_private.intents i on i.id=c.intent_id
          where i.agent_id=e.id
          order by c.opened_at desc,c.id desc
          limit 20
        ) recent
      ),'[]'::jsonb),
      'work',(
        select jsonb_build_object(
          'planned',count(*) filter (where w.status='PLANNED'),
          'ready',count(*) filter (where w.status='READY'),
          'inProgress',count(*) filter (where w.status='IN_PROGRESS'),
          'completed',count(*) filter (where w.status='COMPLETED'),
          'blocked',count(*) filter (where w.status='BLOCKED'),
          'failed',count(*) filter (where w.status='FAILED'),
          'cancelled',count(*) filter (where w.status='CANCELLED'),
          'total',count(*)
        )
        from vaos_private.work_packages w where w.owner_agent_id=e.id
          and w.mission_id not like 'VAOS-QUAL-%'
      ),
      'trainingWork',(
        select jsonb_build_object(
          'total',count(*),
          'completed',count(*) filter (where w.status='COMPLETED'),
          'inProgress',count(*) filter (where w.status='IN_PROGRESS'),
          'blocked',count(*) filter (where w.status='BLOCKED')
        ) from vaos_private.work_packages w
        where w.owner_agent_id=e.id and w.mission_id like 'VAOS-QUAL-%'
      ),
      'workItems',coalesce((
        select jsonb_agg(to_jsonb(recent) order by recent."updatedAt" desc, recent.id)
        from (
          select w.id,w.mission_id as "missionId",w.action_type as "actionType",
            w.status,w.created_at as "createdAt",w.updated_at as "updatedAt"
          from vaos_private.work_packages w
          where w.owner_agent_id=e.id and w.mission_id not like 'VAOS-QUAL-%'
          order by w.updated_at desc,w.id
          limit 51 -- overflow fails source validation instead of hiding forecast inputs
        ) recent
      ),'[]'::jsonb),
      'verifiedClosures',coalesce((
        select jsonb_agg(jsonb_build_object(
          'workPackageId',proof.work_package_id,'verifiedAt',proof.verified_at
        ) order by proof.verified_at desc)
        from (
          select h.work_package_id,max(h.verified_at) as verified_at
          from vaos_private.agent_handoffs h
          where h.to_agent_id=e.id and h.status='COMPLETED'
            and h.mission_id not like 'VAOS-QUAL-%'
            and h.verified_at is not null
            and h.verified_at <= now()
            and h.verified_at >= now()-interval '90 days'
            and h.verified_by_agent_id is not null
            and h.verified_by_agent_id <> h.to_agent_id
            and exists (
              select 1 from vaos_private.handoff_work_evidence v
              where v.handoff_id=h.id
                and v.author_agent_id=h.to_agent_id
                and v.action_type=h.requested_job
                and v.report_sha256=encode(pg_catalog.sha256(convert_to(v.report::text,'UTF8')),'hex')
                and v.handoff_version=h.version-2
                and v.evidence_id=any(h.evidence_refs)
                and exists(select 1 from vaos_private.agent_handoff_events ev where ev.handoff_id=h.id
                  and ev.outcome='VERIFY' and ev.by_agent_id=h.verified_by_agent_id and ev.created_at=h.verified_at
                  and ('REVIEWED:'||v.evidence_id)=any(ev.evidence_refs))
                and exists(select 1 from vaos_private.work_packages w where w.id=h.work_package_id
                  and w.owner_agent_id=e.id and w.action_type=h.requested_job and w.status='COMPLETED')
                and v.created_at<=h.verified_at
            )
          group by h.work_package_id
          order by max(h.verified_at) desc
          limit 201 -- excess history fails schema bounds; never truncate silently
        ) proof
      ),'[]'::jsonb)
    ) order by e.id),'[]'::jsonb)
  ) into v_payload
  from vaos_private.digital_employees e
  left join vaos_private.digital_employee_activity_monitor am on am.employee_id=e.id;
  return v_payload;
end;
$$;
revoke all on function public.vaos_founder_workforce_overview(text,text)
 from public,anon,authenticated,service_role;
grant execute on function public.vaos_founder_workforce_overview(text,text) to service_role;
