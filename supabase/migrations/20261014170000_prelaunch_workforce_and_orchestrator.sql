-- Reconcile an existing founder-approved Q2 qualification. This does not run a
-- new training fixture, award broader competence, or change employee authority.
create or replace function vaos_private.record_orchestrator_q2_assessment(
 p_registration_job uuid,p_source_job uuid,p_registration_intent uuid,p_assessed_by text
) returns jsonb language plpgsql set search_path='' as $$
declare
 v_existing vaos_private.digital_employee_qualification_assessments%rowtype;
 v_source vaos_private.execution_jobs%rowtype;
 v_founder text;
 v_activated boolean;
 v_handoffs integer;
 v_risk integer;
 v_recovery integer;
 v_terminal integer;
 v_refs jsonb;
 v_pass boolean;
 v_id uuid;
begin
 select * into v_existing from vaos_private.digital_employee_qualification_assessments where execution_job_id=p_registration_job;
 if found then return jsonb_build_object('outcome','REPLAY','assessment',vaos_private.qualification_assessment_snapshot(v_existing.id)); end if;
 select * into v_source from vaos_private.execution_jobs where id=p_source_job;
 if not found or v_source.status<>'SUCCEEDED' or v_source.action_type<>'WORKFORCE.QUALIFY'
  or v_source.payload->>'employeeId' is distinct from 'orchestrator'
  or v_source.payload->>'qualificationLevel' is distinct from '2'
  or v_source.result->'verification'->>'verified' is distinct from 'true' then
  return jsonb_build_object('outcome','SOURCE_QUALIFICATION_NOT_VERIFIED');
 end if;
 select decided_by into v_founder from vaos_private.approvals where intent_id=v_source.intent_id and status='APPROVED' and nullif(decided_by,'') is not null order by decided_at desc limit 1;
 if v_founder is null or nullif(p_assessed_by,'') is null then return jsonb_build_object('outcome','APPROVAL_REQUIRED'); end if;
 select exists(select 1 from vaos_private.digital_employee_lifecycle_events l
  join vaos_private.execution_jobs j on j.id=l.execution_job_id
  join vaos_private.approvals a on a.intent_id=l.intent_id and a.status='APPROVED'
  where l.employee_id='orchestrator' and l.action_type='WORKFORCE.ACTIVATE'
   and l.to_status='ACTIVE' and l.to_qualification_level>=2 and j.status='SUCCEEDED') into v_activated;
 select count(*) into v_handoffs from vaos_private.agent_handoffs h
  join vaos_private.handoff_work_evidence we on we.handoff_id=h.id
  where h.from_agent_id='orchestrator' and h.status='COMPLETED'
   and h.verified_by_agent_id is not null and h.verified_by_agent_id<>h.to_agent_id and h.to_agent_id<>'orchestrator'
   and we.author_agent_id=h.to_agent_id and we.action_type=h.requested_job
   and we.report->>'workPackageId'=h.work_package_id
   and we.evidence_id=any(h.evidence_refs) and ('REVIEWED:'||we.evidence_id)=any(h.evidence_refs)
   and we.report_sha256=encode(extensions.digest(convert_to(we.report::text,'UTF8'),'sha256'),'hex')
   and exists(select 1 from vaos_private.agent_handoff_events e where e.handoff_id=h.id and e.outcome='VERIFY' and e.by_agent_id=h.verified_by_agent_id and ('REVIEWED:'||we.evidence_id)=any(e.evidence_refs));
 select count(*),count(*) filter(where j.attempt_count>=2) into v_risk,v_recovery
  from vaos_private.execution_evidence e join vaos_private.execution_jobs j on j.id=e.job_id
  join vaos_private.intents i on i.id=e.intent_id
  where i.agent_id='orchestrator' and i.action_type='PROJECT.ESCALATE_RISK'
   and j.status='SUCCEEDED' and e.verification->>'verified'='true';
 select count(*) into v_terminal from vaos_private.execution_jobs j join vaos_private.intents i on i.id=j.intent_id
  where i.agent_id='orchestrator' and j.status='DEAD_LETTER' and exists(
   select 1 from vaos_private.events e where e.payload->>'executionJobId'=j.id::text
    and e.payload->'error'->>'retryable'='false');
 v_refs:=jsonb_build_array('execution_job:'||v_source.id::text,'intent:'||v_source.intent_id::text)||coalesce(v_source.payload->'evidenceRefs','[]'::jsonb);
 v_pass:=v_activated and v_handoffs>=9 and v_risk>=3 and v_recovery>=2 and v_terminal>=1;
 insert into vaos_private.digital_employee_qualification_assessments(
  employee_id,target_level,profile_id,scope,status,criteria,results,evidence_refs,assessed_by,intent_id,execution_job_id)
 values('orchestrator',2,'ORCHESTRATOR_Q2_COORDINATION_GOVERNANCE_V1','RECORDED_Q2_COORDINATION_RECONCILIATION',case when v_pass then 'PASS' else 'FAIL' end,
  jsonb_build_array(
   jsonb_build_object('id','existing_approved_q2','pass',true),
   jsonb_build_object('id','existing_approved_activation','pass',v_activated),
   jsonb_build_object('id','reviewed_handoff_integrity','required',9,'actual',v_handoffs,'pass',v_handoffs>=9),
   jsonb_build_object('id','recorded_risk_executions','required',3,'actual',v_risk,'pass',v_risk>=3),
   jsonb_build_object('id','recorded_retry_recovery','required',2,'actual',v_recovery,'pass',v_recovery>=2),
   jsonb_build_object('id','recorded_terminal_handling','required',1,'actual',v_terminal,'pass',v_terminal>=1)),
  jsonb_build_object('sourceQualificationJobId',v_source.id,'originalApprovedBy',v_founder,
   'reviewedHandoffs',v_handoffs,'riskExecutions',v_risk,'retryRecovery',v_recovery,'terminalHandling',v_terminal,
   'scope','EXISTING_RECORDED_Q2_ONLY','allCatalogJobsQualified',false,'businessOperationsCertified',false),
  v_refs,p_assessed_by,p_registration_intent,p_registration_job) returning id into v_id;
 insert into vaos_private.events(type,source,payload) values('WORKFORCE.QUALIFICATION_RECONCILED','vaos-governed-assessment-reconciliation',
  jsonb_build_object('employeeId','orchestrator','assessmentId',v_id,'sourceQualificationJobId',v_source.id,'status',case when v_pass then 'PASS' else 'FAIL' end,'scope','RECORDED_Q2_COORDINATION_RECONCILIATION'));
 return jsonb_build_object('outcome','CREATED','assessment',vaos_private.qualification_assessment_snapshot(v_id));
end;
$$;
revoke all on function vaos_private.record_orchestrator_q2_assessment(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;

create or replace function public.vaos_assess_orchestrator_q2_qualification(p_server_key text,p_job_id text,p_lease_token text,p_employee_id text,p_target_level smallint,p_profile_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job vaos_private.execution_jobs%rowtype; v_source uuid; v_actor text;
begin
 perform vaos_private.assert_server_key(p_server_key);
 if p_employee_id is distinct from 'orchestrator' or p_target_level is distinct from 2 or p_profile_id is distinct from 'ORCHESTRATOR_Q2_COORDINATION_GOVERNANCE_V1' then return jsonb_build_object('outcome','PROFILE_MISMATCH'); end if;
 select * into v_job from vaos_private.execution_jobs where id=p_job_id::uuid for update;
 if not found or v_job.status<>'LEASED' or v_job.lease_token::text is distinct from p_lease_token then return jsonb_build_object('outcome','LEASE_CONFLICT'); end if;
 if v_job.action_type<>'WORKFORCE.ASSESS_QUALIFICATION' or v_job.payload->>'employeeId' is distinct from p_employee_id or v_job.payload->>'targetLevel' is distinct from '2' or v_job.payload->>'profileId' is distinct from p_profile_id then return jsonb_build_object('outcome','PAYLOAD_MISMATCH'); end if;
 select decided_by into v_actor from vaos_private.approvals where intent_id=v_job.intent_id and status='APPROVED' and nullif(decided_by,'') is not null order by decided_at desc limit 1;
 if v_actor is null then return jsonb_build_object('outcome','APPROVAL_REQUIRED'); end if;
 select id into v_source from vaos_private.execution_jobs where action_type='WORKFORCE.QUALIFY' and status='SUCCEEDED' and payload->>'employeeId'='orchestrator' and payload->>'qualificationLevel'='2' order by updated_at desc limit 1;
 if v_source is null then return jsonb_build_object('outcome','SOURCE_QUALIFICATION_NOT_VERIFIED'); end if;
 return vaos_private.record_orchestrator_q2_assessment(v_job.id,v_source,v_job.intent_id,v_actor);
end;
$$;
revoke all on function public.vaos_assess_orchestrator_q2_qualification(text,text,text,text,smallint,text) from public,anon,authenticated;
grant execute on function public.vaos_assess_orchestrator_q2_qualification(text,text,text,text,smallint,text) to service_role;

-- One-time retrospective registration uses the actual already-approved,
-- successfully executed qualification job and approval identity. No new leased
-- job, human decision or operational execution is falsely represented.
do $$
declare v_source vaos_private.execution_jobs%rowtype; v_actor text;
begin
 select * into v_source from vaos_private.execution_jobs where action_type='WORKFORCE.QUALIFY' and status='SUCCEEDED' and payload->>'employeeId'='orchestrator' and payload->>'qualificationLevel'='2' order by updated_at desc limit 1;
 if found then
  select decided_by into v_actor from vaos_private.approvals where intent_id=v_source.intent_id and status='APPROVED' and nullif(decided_by,'') is not null order by decided_at desc limit 1;
  if v_actor is not null then perform vaos_private.record_orchestrator_q2_assessment(v_source.id,v_source.id,v_source.intent_id,v_actor); end if;
 end if;
end;
$$;

create table if not exists vaos_private.prelaunch_work_outputs(
 request_id uuid primary key,actor_email text not null,request_sha256 text not null,
 output jsonb not null,created_at timestamptz not null default now(),
 constraint prelaunch_work_output_scope check(output->>'schemaVersion'='VAOS_PRELAUNCH_RUN_V1' and output->>'businessEffectsExecuted'='false'));
alter table vaos_private.prelaunch_work_outputs enable row level security;
revoke all on table vaos_private.prelaunch_work_outputs from public,anon,authenticated,service_role;
create or replace function public.vaos_prelaunch_output(p_server_key text,p_actor_email text,p_request_id text default null,p_request_sha256 text default null,p_output jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_existing vaos_private.prelaunch_work_outputs%rowtype;
begin
 perform vaos_private.assert_server_key(p_server_key);
 if p_actor_email is distinct from 'shyamsundhar1982@gmail.com' then raise exception 'FOUNDER_ONLY'; end if;
 if p_request_id is null then
  return jsonb_build_object('runs',coalesce((select jsonb_agg(r.output order by r.created_at desc) from (select output,created_at from vaos_private.prelaunch_work_outputs where actor_email=p_actor_email order by created_at desc limit 10) r),'[]'::jsonb));
 end if;
 if p_request_sha256 is null or p_request_sha256 !~ '^[a-f0-9]{64}$' or p_output is null or octet_length(p_output::text)>65536 or jsonb_typeof(p_output)<>'object'
  or p_output->>'schemaVersion' is distinct from 'VAOS_PRELAUNCH_RUN_V1' or p_output->>'businessEffectsExecuted' is distinct from 'false' then raise exception 'PRELAUNCH_OUTPUT_INVALID'; end if;
 insert into vaos_private.prelaunch_work_outputs(request_id,actor_email,request_sha256,output) values(p_request_id::uuid,p_actor_email,p_request_sha256,p_output) on conflict(request_id) do nothing;
 select * into v_existing from vaos_private.prelaunch_work_outputs where request_id=p_request_id::uuid;
 if v_existing.actor_email<>p_actor_email or v_existing.request_sha256<>p_request_sha256 then raise exception 'PRELAUNCH_IDEMPOTENCY_CONFLICT'; end if;
 return jsonb_build_object('outcome','RECORDED_OR_REPLAYED','data',v_existing.output);
end;
$$;
revoke all on function public.vaos_prelaunch_output(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.vaos_prelaunch_output(text,text,text,text,jsonb) to service_role;

create table if not exists vaos_private.prelaunch_recovery_inventory(
 id text primary key,inventory jsonb not null,updated_at timestamptz not null default now());
alter table vaos_private.prelaunch_recovery_inventory enable row level security;
revoke all on table vaos_private.prelaunch_recovery_inventory from public,anon,authenticated,service_role;
create or replace function public.vaos_prelaunch_recovery(p_server_key text,p_actor_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform vaos_private.assert_server_key(p_server_key);
 if p_actor_email is distinct from 'shyamsundhar1982@gmail.com' then raise exception 'FOUNDER_ONLY'; end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'inventory',inventory,'updatedAt',updated_at) order by id) from vaos_private.prelaunch_recovery_inventory),'[]'::jsonb));
end;
$$;
revoke all on function public.vaos_prelaunch_recovery(text,text) from public,anon,authenticated;
grant execute on function public.vaos_prelaunch_recovery(text,text) to service_role;
