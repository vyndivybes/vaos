-- Digital Workforce v2: governed lifecycle, qualification evidence, and service-only transition RPCs.
-- Applied to Supabase as migration 20261007133440 / digital_workforce_lifecycle_v2.
create table if not exists vaos_private.digital_employee_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references vaos_private.digital_employees(id) on update cascade on delete restrict,
  intent_id uuid not null references vaos_private.intents(id) on delete restrict,
  execution_job_id uuid not null unique references vaos_private.execution_jobs(id) on delete restrict,
  action_type text not null,
  from_status text not null,
  to_status text not null,
  from_qualification_level smallint not null,
  to_qualification_level smallint not null,
  reason text not null,
  approved_by text not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  transitioned_at timestamptz not null default now(),
  constraint workforce_lifecycle_evidence_array check (jsonb_typeof(evidence_refs)='array')
);
alter table vaos_private.digital_employee_lifecycle_events enable row level security;
revoke all on table vaos_private.digital_employee_lifecycle_events from public, anon, authenticated, service_role;
create index if not exists digital_employee_lifecycle_employee_idx on vaos_private.digital_employee_lifecycle_events(employee_id, transitioned_at desc);
create index if not exists digital_employee_lifecycle_action_idx on vaos_private.digital_employee_lifecycle_events(action_type, transitioned_at desc);

create or replace function vaos_private.digital_employee_snapshot(p_employee_id text)
returns jsonb language sql stable set search_path = vaos_private, public, pg_temp as $$
  select jsonb_build_object(
    'id',e.id,'name',e.name,'role',e.role,'department',e.department,'status',e.status,
    'qualificationLevel',e.qualification_level,'qualificationRecord',e.qualification_record,
    'evidenceRefs',e.evidence_refs,'autonomyLevel',e.autonomy_level,'confidence',e.confidence,'updatedAt',e.updated_at
  ) from vaos_private.digital_employees e where e.id=p_employee_id
$$;
revoke all on function vaos_private.digital_employee_snapshot(text) from public, anon, authenticated, service_role;

create or replace function vaos_private.apply_digital_employee_transition(
  p_job_id uuid,p_lease_token uuid,p_employee_id text,p_action_type text,
  p_qualification_level smallint default null,p_evidence_refs jsonb default '[]'::jsonb
) returns jsonb language plpgsql set search_path = vaos_private, public, pg_temp as $$
declare
  v_job vaos_private.execution_jobs%rowtype;
  v_intent vaos_private.intents%rowtype;
  v_approval vaos_private.approvals%rowtype;
  v_employee vaos_private.digital_employees%rowtype;
  v_existing vaos_private.digital_employee_lifecycle_events%rowtype;
  v_from_status text; v_to_status text; v_from_level smallint; v_to_level smallint; v_reason text;
begin
  select * into v_existing from vaos_private.digital_employee_lifecycle_events where execution_job_id=p_job_id and employee_id=p_employee_id;
  if v_existing.id is not null then
    return jsonb_build_object('outcome','REPLAY','employee',vaos_private.digital_employee_snapshot(p_employee_id),
      'transition',jsonb_build_object('actionType',v_existing.action_type,'fromStatus',v_existing.from_status,'toStatus',v_existing.to_status,'approvedBy',v_existing.approved_by,'transitionedAt',v_existing.transitioned_at));
  end if;

  select * into v_job from vaos_private.execution_jobs where id=p_job_id for update;
  if v_job.id is null then return jsonb_build_object('outcome','JOB_NOT_FOUND'); end if;
  if v_job.status <> 'LEASED' or v_job.lease_token <> p_lease_token then return jsonb_build_object('outcome','LEASE_CONFLICT'); end if;
  if v_job.action_type <> p_action_type then return jsonb_build_object('outcome','ACTION_MISMATCH'); end if;
  if coalesce(v_job.payload->>'employeeId','') <> p_employee_id then return jsonb_build_object('outcome','EMPLOYEE_MISMATCH'); end if;

  select * into v_intent from vaos_private.intents where id=v_job.intent_id;
  if v_intent.id is null then return jsonb_build_object('outcome','INTENT_NOT_FOUND'); end if;
  select * into v_approval from vaos_private.approvals where intent_id=v_job.intent_id and status='APPROVED' order by decided_at desc limit 1;
  if v_approval.id is null or coalesce(v_approval.decided_by,'')='' then return jsonb_build_object('outcome','APPROVAL_REQUIRED'); end if;

  select * into v_employee from vaos_private.digital_employees where id=p_employee_id for update;
  if v_employee.id is null then return jsonb_build_object('outcome','EMPLOYEE_NOT_FOUND'); end if;
  v_from_status:=v_employee.status; v_from_level:=v_employee.qualification_level; v_to_level:=v_employee.qualification_level;
  v_reason:=coalesce(nullif(trim(v_intent.reason),''),'Governed workforce lifecycle transition');

  case p_action_type
    when 'WORKFORCE.START_TRAINING' then
      if v_employee.status <> 'PROPOSED' then return jsonb_build_object('outcome','INVALID_TRANSITION','currentStatus',v_employee.status,'expectedStatus','PROPOSED'); end if;
      v_to_status:='TRAINING';
    when 'WORKFORCE.QUALIFY' then
      if v_employee.status not in ('TRAINING','RETRAINING') then return jsonb_build_object('outcome','INVALID_TRANSITION','currentStatus',v_employee.status,'expectedStatus','TRAINING_OR_RETRAINING'); end if;
      if p_qualification_level is null or p_qualification_level < 1 or p_qualification_level > 4 then return jsonb_build_object('outcome','INVALID_QUALIFICATION_LEVEL'); end if;
      if p_evidence_refs is null or jsonb_typeof(p_evidence_refs) <> 'array' or jsonb_array_length(p_evidence_refs)=0 then return jsonb_build_object('outcome','QUALIFICATION_EVIDENCE_REQUIRED'); end if;
      v_to_status:='QUALIFIED'; v_to_level:=p_qualification_level;
    when 'WORKFORCE.ACTIVATE' then
      if v_employee.status <> 'QUALIFIED' then return jsonb_build_object('outcome','INVALID_TRANSITION','currentStatus',v_employee.status,'expectedStatus','QUALIFIED'); end if;
      if v_employee.qualification_level < 1 or v_employee.qualification_record is null then return jsonb_build_object('outcome','QUALIFICATION_REQUIRED'); end if;
      v_to_status:='ACTIVE';
    when 'WORKFORCE.RESTRICT' then
      if v_employee.status <> 'ACTIVE' then return jsonb_build_object('outcome','INVALID_TRANSITION','currentStatus',v_employee.status,'expectedStatus','ACTIVE'); end if;
      if length(v_reason)<3 then return jsonb_build_object('outcome','REASON_REQUIRED'); end if;
      v_to_status:='RESTRICTED';
    when 'WORKFORCE.START_RETRAINING' then
      if v_employee.status <> 'RESTRICTED' then return jsonb_build_object('outcome','INVALID_TRANSITION','currentStatus',v_employee.status,'expectedStatus','RESTRICTED'); end if;
      if length(v_reason)<3 then return jsonb_build_object('outcome','REASON_REQUIRED'); end if;
      v_to_status:='RETRAINING';
    when 'WORKFORCE.RETIRE' then
      if v_employee.status='RETIRED' then return jsonb_build_object('outcome','INVALID_TRANSITION','currentStatus','RETIRED'); end if;
      if length(v_reason)<3 then return jsonb_build_object('outcome','REASON_REQUIRED'); end if;
      v_to_status:='RETIRED';
    else return jsonb_build_object('outcome','UNSUPPORTED_WORKFORCE_ACTION');
  end case;

  if p_action_type='WORKFORCE.QUALIFY' then
    update vaos_private.digital_employees set status=v_to_status,qualification_level=v_to_level,
      qualification_record=jsonb_build_object('qualifiedBy',v_approval.decided_by,'qualifiedAt',now(),'level',v_to_level,'evidenceRefs',p_evidence_refs,'intentId',v_job.intent_id,'executionJobId',v_job.id),
      evidence_refs=p_evidence_refs,updated_at=now() where id=p_employee_id;
  else
    update vaos_private.digital_employees set status=v_to_status,updated_at=now() where id=p_employee_id;
  end if;

  insert into vaos_private.digital_employee_lifecycle_events(employee_id,intent_id,execution_job_id,action_type,from_status,to_status,from_qualification_level,to_qualification_level,reason,approved_by,evidence_refs)
  values(p_employee_id,v_job.intent_id,v_job.id,p_action_type,v_from_status,v_to_status,v_from_level,v_to_level,v_reason,v_approval.decided_by,coalesce(p_evidence_refs,'[]'::jsonb));

  insert into vaos_private.events(type,source,payload) values('WORKFORCE.DIGITAL_EMPLOYEE.TRANSITIONED',v_approval.decided_by,
    jsonb_build_object('employeeId',p_employee_id,'intentId',v_job.intent_id,'executionJobId',v_job.id,'actionType',p_action_type,'fromStatus',v_from_status,'toStatus',v_to_status,'qualificationLevel',v_to_level));

  return jsonb_build_object('outcome','CREATED','employee',vaos_private.digital_employee_snapshot(p_employee_id),
    'transition',jsonb_build_object('actionType',p_action_type,'fromStatus',v_from_status,'toStatus',v_to_status,'approvedBy',v_approval.decided_by));
end;
$$;
revoke all on function vaos_private.apply_digital_employee_transition(uuid,uuid,text,text,smallint,jsonb) from public, anon, authenticated, service_role;

create or replace function public.vaos_transition_digital_employee(
  p_server_key text,p_job_id text,p_lease_token text,p_employee_id text,p_action_type text,
  p_qualification_level smallint default null,p_evidence_refs jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = vaos_private, public, pg_temp as $$
begin
  perform vaos_private.assert_server_key(p_server_key);
  return vaos_private.apply_digital_employee_transition(p_job_id::uuid,p_lease_token::uuid,p_employee_id,p_action_type,p_qualification_level,coalesce(p_evidence_refs,'[]'::jsonb));
end;
$$;

create or replace function public.vaos_get_digital_employee(p_server_key text,p_employee_id text)
returns jsonb language plpgsql security definer set search_path = vaos_private, public, pg_temp as $$
declare v_record jsonb;
begin
  perform vaos_private.assert_server_key(p_server_key);
  v_record:=vaos_private.digital_employee_snapshot(p_employee_id);
  return v_record;
end;
$$;
revoke all on function public.vaos_transition_digital_employee(text,text,text,text,text,smallint,jsonb) from public, anon, authenticated;
revoke all on function public.vaos_get_digital_employee(text,text) from public, anon, authenticated;
grant execute on function public.vaos_transition_digital_employee(text,text,text,text,text,smallint,jsonb) to service_role;
grant execute on function public.vaos_get_digital_employee(text,text) to service_role;
