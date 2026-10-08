-- Definitive operating model for the original eight VAOS agents.
-- Adds durable missions, work packages and governed handoffs without expanding agent authority.
-- All tables remain private + RLS; access is only through server-key-gated service-role RPCs.

create table if not exists vaos_private.missions (
  id text primary key,
  objective text not null,
  catalog_version text not null,
  status text not null default 'PLANNED',
  created_by_agent_id text not null,
  request_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mission_status_check check (status in ('PLANNED','ACTIVE','HOLD','READY_FOR_CLOSURE','COMPLETED','CANCELLED')),
  constraint mission_creator_check check (created_by_agent_id='orchestrator')
);

create table if not exists vaos_private.work_packages (
  id text primary key,
  mission_id text not null,
  action_type text not null,
  owner_agent_id text not null,
  verifier_agent_ids text[] not null default '{}'::text[],
  authority smallint not null,
  risk text not null,
  execution_mode text not null,
  human_approval_required boolean not null default false,
  monitoring boolean not null default false,
  sla_hours numeric not null,
  kpis text[] not null default '{}'::text[],
  depends_on text[] not null default '{}'::text[],
  status text not null default 'PLANNED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_packages_mission_fk foreign key (mission_id)
    references vaos_private.missions(id) on update cascade on delete cascade,
  constraint work_package_owner_check check (
    owner_agent_id in ('orchestrator','project','vibpe','qa','risk','security','knowledge','release')
  ),
  constraint work_package_authority_check check (authority between 0 and 5),
  constraint work_package_risk_check check (risk in ('low','medium','high','critical')),
  constraint work_package_sla_check check (sla_hours > 0),
  constraint work_package_status_check check (status in ('PLANNED','READY','IN_PROGRESS','BLOCKED','COMPLETED','FAILED','CANCELLED'))
);

create table if not exists vaos_private.agent_handoffs (
  id text primary key,
  mission_id text not null,
  work_package_id text not null,
  from_agent_id text not null,
  to_agent_id text not null,
  requested_job text not null,
  reason text not null,
  required_outcome text not null,
  acceptance_criteria text[] not null,
  evidence_refs text[] not null default '{}'::text[],
  priority text not null default 'NORMAL',
  status text not null default 'PENDING',
  version integer not null default 1,
  request_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_handoffs_mission_fk foreign key (mission_id)
    references vaos_private.missions(id) on update cascade on delete cascade,
  constraint agent_handoffs_work_package_fk foreign key (work_package_id)
    references vaos_private.work_packages(id) on update cascade on delete cascade,
  constraint agent_handoff_from_check check (
    from_agent_id in ('orchestrator','project','vibpe','qa','risk','security','knowledge','release')
  ),
  constraint agent_handoff_to_check check (
    to_agent_id in ('orchestrator','project','vibpe','qa','risk','security','knowledge','release')
  ),
  constraint agent_handoff_distinct_agents check (from_agent_id<>to_agent_id),
  constraint agent_handoff_priority_check check (priority in ('LOW','NORMAL','HIGH','CRITICAL')),
  constraint agent_handoff_status_check check (status in ('PENDING','ACCEPTED','INFORMATION_REQUIRED','RETURNED','ESCALATED','COMPLETED','REJECTED')),
  constraint agent_handoff_acceptance_check check (cardinality(acceptance_criteria)>0),
  constraint agent_handoff_version_check check (version>=1)
);

create table if not exists vaos_private.agent_handoff_events (
  id bigint generated always as identity primary key,
  handoff_id text not null,
  outcome text not null,
  from_status text,
  to_status text not null,
  by_agent_id text not null,
  reason text,
  evidence_refs text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  constraint agent_handoff_events_handoff_fk foreign key (handoff_id)
    references vaos_private.agent_handoffs(id) on update cascade on delete cascade,
  constraint agent_handoff_event_actor_check check (
    by_agent_id in ('orchestrator','project','vibpe','qa','risk','security','knowledge','release')
  )
);

alter table vaos_private.missions enable row level security;
alter table vaos_private.work_packages enable row level security;
alter table vaos_private.agent_handoffs enable row level security;
alter table vaos_private.agent_handoff_events enable row level security;

revoke all on table vaos_private.missions from public, anon, authenticated, service_role;
revoke all on table vaos_private.work_packages from public, anon, authenticated, service_role;
revoke all on table vaos_private.agent_handoffs from public, anon, authenticated, service_role;
revoke all on table vaos_private.agent_handoff_events from public, anon, authenticated, service_role;

create index if not exists work_packages_mission_status_idx
  on vaos_private.work_packages(mission_id,status);
create index if not exists work_packages_owner_status_idx
  on vaos_private.work_packages(owner_agent_id,status);
create index if not exists agent_handoffs_mission_status_idx
  on vaos_private.agent_handoffs(mission_id,status);
create index if not exists agent_handoffs_recipient_status_idx
  on vaos_private.agent_handoffs(to_agent_id,status);
create index if not exists agent_handoff_events_handoff_created_idx
  on vaos_private.agent_handoff_events(handoff_id,created_at);

create or replace function public.vaos_create_operating_mission(
  p_server_key text,
  p_mission_id text,
  p_objective text,
  p_catalog_version text,
  p_created_by_agent_id text,
  p_work_packages jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_hash text;
  v_existing vaos_private.missions%rowtype;
  v_wp jsonb;
  v_wp_count integer := 0;
begin
  perform vaos_private.assert_server_key(p_server_key);

  if nullif(trim(p_mission_id),'') is null then raise exception 'MISSION_ID_REQUIRED'; end if;
  if nullif(trim(p_objective),'') is null then raise exception 'MISSION_OBJECTIVE_REQUIRED'; end if;
  if nullif(trim(p_catalog_version),'') is null then raise exception 'MISSION_CATALOG_VERSION_REQUIRED'; end if;
  if p_created_by_agent_id <> 'orchestrator' then raise exception 'MISSION_CREATOR_INVALID'; end if;
  if jsonb_typeof(coalesce(p_work_packages,'null'::jsonb)) <> 'array' or jsonb_array_length(p_work_packages)=0 then
    raise exception 'MISSION_WORK_PACKAGES_REQUIRED';
  end if;

  v_request_hash := md5(p_objective || '|' || p_catalog_version || '|' || p_created_by_agent_id || '|' || p_work_packages::text);

  select * into v_existing
  from vaos_private.missions
  where id=p_mission_id;

  if found then
    if v_existing.request_hash<>v_request_hash then
      raise exception 'MISSION_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'outcome','REPLAY',
      'mission',to_jsonb(v_existing),
      'workPackages',coalesce((
        select jsonb_agg(to_jsonb(w) order by w.id)
        from vaos_private.work_packages w
        where w.mission_id=p_mission_id
      ),'[]'::jsonb)
    );
  end if;

  insert into vaos_private.missions(
    id,objective,catalog_version,status,created_by_agent_id,request_hash
  ) values (
    p_mission_id,p_objective,p_catalog_version,'PLANNED',p_created_by_agent_id,v_request_hash
  );

  for v_wp in select value from jsonb_array_elements(p_work_packages)
  loop
    if nullif(trim(v_wp->>'id'),'') is null
       or nullif(trim(v_wp->>'actionType'),'') is null
       or nullif(trim(v_wp->>'ownerAgentId'),'') is null then
      raise exception 'WORK_PACKAGE_REQUIRED_FIELD_MISSING';
    end if;

    insert into vaos_private.work_packages(
      id,mission_id,action_type,owner_agent_id,verifier_agent_ids,authority,risk,
      execution_mode,human_approval_required,monitoring,sla_hours,kpis,depends_on,status
    ) values (
      v_wp->>'id',
      p_mission_id,
      v_wp->>'actionType',
      v_wp->>'ownerAgentId',
      coalesce(array(select jsonb_array_elements_text(coalesce(v_wp->'verifierAgentIds','[]'::jsonb))), '{}'::text[]),
      (v_wp->>'authority')::smallint,
      v_wp->>'risk',
      coalesce(nullif(v_wp->>'executionMode',''),'ANALYSE'),
      coalesce((v_wp->>'humanApprovalRequired')::boolean,false),
      coalesce((v_wp->>'monitoring')::boolean,false),
      (v_wp->>'slaHours')::numeric,
      coalesce(array(select jsonb_array_elements_text(coalesce(v_wp->'kpis','[]'::jsonb))), '{}'::text[]),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_wp->'dependsOn','[]'::jsonb))), '{}'::text[]),
      'PLANNED'
    );
    v_wp_count := v_wp_count + 1;
  end loop;

  return jsonb_build_object(
    'outcome','CREATED',
    'mission',(
      select to_jsonb(m) from vaos_private.missions m where m.id=p_mission_id
    ),
    'workPackages',(
      select coalesce(jsonb_agg(to_jsonb(w) order by w.id),'[]'::jsonb)
      from vaos_private.work_packages w where w.mission_id=p_mission_id
    ),
    'workPackageCount',v_wp_count
  );
end;
$$;

create or replace function public.vaos_create_operating_handoff(
  p_server_key text,
  p_handoff_id text,
  p_mission_id text,
  p_work_package_id text,
  p_from_agent_id text,
  p_to_agent_id text,
  p_requested_job text,
  p_reason text,
  p_required_outcome text,
  p_acceptance_criteria jsonb,
  p_evidence_refs jsonb,
  p_priority text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner text;
  v_action text;
  v_request_hash text;
  v_existing vaos_private.agent_handoffs%rowtype;
  v_acceptance text[];
  v_evidence text[];
begin
  perform vaos_private.assert_server_key(p_server_key);

  if p_from_agent_id not in ('orchestrator','project','vibpe','qa','risk','security','knowledge','release')
     or p_to_agent_id not in ('orchestrator','project','vibpe','qa','risk','security','knowledge','release')
     or p_from_agent_id=p_to_agent_id then
    raise exception 'HANDOFF_AGENT_INVALID';
  end if;

  select owner_agent_id,action_type into v_owner,v_action
  from vaos_private.work_packages
  where id=p_work_package_id and mission_id=p_mission_id;

  if not found then raise exception 'HANDOFF_WORK_PACKAGE_NOT_FOUND'; end if;
  if v_owner<>p_to_agent_id then raise exception 'HANDOFF_RECIPIENT_NOT_JOB_OWNER'; end if;
  if v_action<>p_requested_job then raise exception 'HANDOFF_REQUESTED_JOB_MISMATCH'; end if;

  if jsonb_typeof(coalesce(p_acceptance_criteria,'null'::jsonb))<>'array'
     or jsonb_array_length(p_acceptance_criteria)=0 then
    raise exception 'HANDOFF_ACCEPTANCE_CRITERIA_REQUIRED';
  end if;
  if p_evidence_refs is not null and jsonb_typeof(p_evidence_refs)<>'array' then
    raise exception 'HANDOFF_EVIDENCE_INVALID';
  end if;

  v_acceptance := array(select distinct jsonb_array_elements_text(p_acceptance_criteria));
  v_evidence := coalesce(array(select distinct jsonb_array_elements_text(coalesce(p_evidence_refs,'[]'::jsonb))), '{}'::text[]);
  v_request_hash := md5(
    p_mission_id || '|' || p_work_package_id || '|' || p_from_agent_id || '|' ||
    p_to_agent_id || '|' || p_requested_job || '|' || p_reason || '|' ||
    p_required_outcome || '|' || p_acceptance_criteria::text || '|' ||
    coalesce(p_evidence_refs,'[]'::jsonb)::text || '|' || coalesce(p_priority,'NORMAL')
  );

  select * into v_existing
  from vaos_private.agent_handoffs
  where id=p_handoff_id;

  if found then
    if v_existing.request_hash<>v_request_hash then
      raise exception 'HANDOFF_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('outcome','REPLAY','handoff',to_jsonb(v_existing));
  end if;

  insert into vaos_private.agent_handoffs(
    id,mission_id,work_package_id,from_agent_id,to_agent_id,requested_job,reason,
    required_outcome,acceptance_criteria,evidence_refs,priority,status,version,request_hash
  ) values (
    p_handoff_id,p_mission_id,p_work_package_id,p_from_agent_id,p_to_agent_id,p_requested_job,p_reason,
    p_required_outcome,v_acceptance,v_evidence,coalesce(p_priority,'NORMAL'),'PENDING',1,v_request_hash
  );

  insert into vaos_private.agent_handoff_events(
    handoff_id,outcome,from_status,to_status,by_agent_id,reason,evidence_refs
  ) values (
    p_handoff_id,'CREATED',null,'PENDING',p_from_agent_id,p_reason,v_evidence
  );

  update vaos_private.missions
  set status=case when status='PLANNED' then 'ACTIVE' else status end,updated_at=now()
  where id=p_mission_id;

  return jsonb_build_object(
    'outcome','CREATED',
    'handoff',(select to_jsonb(h) from vaos_private.agent_handoffs h where h.id=p_handoff_id)
  );
end;
$$;

create or replace function public.vaos_transition_operating_handoff(
  p_server_key text,
  p_handoff_id text,
  p_expected_version integer,
  p_outcome text,
  p_by_agent_id text,
  p_reason text default null,
  p_evidence_refs jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handoff vaos_private.agent_handoffs%rowtype;
  v_next_status text;
  v_new_evidence text[];
  v_new_version integer;
begin
  perform vaos_private.assert_server_key(p_server_key);

  select * into v_handoff
  from vaos_private.agent_handoffs
  where id=p_handoff_id
  for update;

  if not found then raise exception 'HANDOFF_NOT_FOUND'; end if;
  if p_expected_version is null or p_expected_version<>v_handoff.version then
    raise exception 'HANDOFF_VERSION_CONFLICT';
  end if;
  if jsonb_typeof(coalesce(p_evidence_refs,'null'::jsonb))<>'array' then
    raise exception 'HANDOFF_EVIDENCE_INVALID';
  end if;

  v_next_status := case
    when v_handoff.status='PENDING' and p_outcome='ACCEPT' then 'ACCEPTED'
    when v_handoff.status='PENDING' and p_outcome='REQUEST_INFORMATION' then 'INFORMATION_REQUIRED'
    when v_handoff.status='PENDING' and p_outcome='REJECT_INVALID' then 'REJECTED'
    when v_handoff.status='ACCEPTED' and p_outcome='COMPLETE' then 'COMPLETED'
    when v_handoff.status='ACCEPTED' and p_outcome='REQUEST_INFORMATION' then 'INFORMATION_REQUIRED'
    when v_handoff.status='ACCEPTED' and p_outcome='RETURN_FOR_CORRECTION' then 'RETURNED'
    when v_handoff.status='ACCEPTED' and p_outcome='ESCALATE' then 'ESCALATED'
    when v_handoff.status='INFORMATION_REQUIRED' and p_outcome='RESUBMIT' then 'PENDING'
    when v_handoff.status='RETURNED' and p_outcome='RESUBMIT' then 'PENDING'
    when v_handoff.status='ESCALATED' and p_outcome='RESOLVE_ESCALATION' then 'ACCEPTED'
    else null
  end;

  if v_next_status is null then raise exception 'HANDOFF_TRANSITION_INVALID'; end if;

  if p_outcome='RESUBMIT' then
    if p_by_agent_id<>v_handoff.from_agent_id then raise exception 'HANDOFF_ACTOR_NOT_AUTHORIZED'; end if;
  elsif p_outcome='RESOLVE_ESCALATION' then
    if p_by_agent_id not in ('orchestrator',v_handoff.from_agent_id) then raise exception 'HANDOFF_ACTOR_NOT_AUTHORIZED'; end if;
  else
    if p_by_agent_id<>v_handoff.to_agent_id then raise exception 'HANDOFF_ACTOR_NOT_AUTHORIZED'; end if;
  end if;

  v_new_evidence := array(
    select distinct value
    from unnest(
      coalesce(v_handoff.evidence_refs,'{}'::text[])
      || coalesce(array(select jsonb_array_elements_text(p_evidence_refs)),'{}'::text[])
    ) as value
    order by value
  );
  v_new_version := v_handoff.version+1;

  update vaos_private.agent_handoffs
  set status=v_next_status,
      version=v_new_version,
      evidence_refs=v_new_evidence,
      updated_at=now()
  where id=p_handoff_id;

  insert into vaos_private.agent_handoff_events(
    handoff_id,outcome,from_status,to_status,by_agent_id,reason,evidence_refs
  ) values (
    p_handoff_id,p_outcome,v_handoff.status,v_next_status,p_by_agent_id,p_reason,
    coalesce(array(select jsonb_array_elements_text(p_evidence_refs)),'{}'::text[])
  );

  update vaos_private.work_packages
  set status=case
        when v_next_status='ACCEPTED' then 'IN_PROGRESS'
        when v_next_status='COMPLETED' then 'COMPLETED'
        when v_next_status in ('INFORMATION_REQUIRED','RETURNED','ESCALATED') then 'BLOCKED'
        when v_next_status='PENDING' then 'READY'
        when v_next_status='REJECTED' then 'FAILED'
        else status
      end,
      updated_at=now()
  where id=v_handoff.work_package_id;

  update vaos_private.missions
  set status=case
        when v_next_status in ('INFORMATION_REQUIRED','RETURNED','ESCALATED','REJECTED') then 'HOLD'
        when status='HOLD' and v_next_status in ('PENDING','ACCEPTED','COMPLETED') then 'ACTIVE'
        when status='PLANNED' then 'ACTIVE'
        else status
      end,
      updated_at=now()
  where id=v_handoff.mission_id;

  return jsonb_build_object(
    'outcome','UPDATED',
    'handoff',(select to_jsonb(h) from vaos_private.agent_handoffs h where h.id=p_handoff_id)
  );
end;
$$;

create or replace function public.vaos_operating_mission_snapshot(
  p_server_key text,
  p_mission_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mission vaos_private.missions%rowtype;
  v_total integer := 0;
  v_completed integer := 0;
  v_blocked integer := 0;
  v_pending_handoffs integer := 0;
  v_escalated_handoffs integer := 0;
  v_ready_for_closure boolean := false;
begin
  perform vaos_private.assert_server_key(p_server_key);

  select * into v_mission from vaos_private.missions where id=p_mission_id;
  if not found then raise exception 'MISSION_NOT_FOUND'; end if;

  select
    count(*),
    count(*) filter (where status='COMPLETED'),
    count(*) filter (where status in ('BLOCKED','FAILED'))
  into v_total,v_completed,v_blocked
  from vaos_private.work_packages
  where mission_id=p_mission_id;

  select
    count(*) filter (where status in ('PENDING','ACCEPTED','INFORMATION_REQUIRED','RETURNED')),
    count(*) filter (where status='ESCALATED')
  into v_pending_handoffs,v_escalated_handoffs
  from vaos_private.agent_handoffs
  where mission_id=p_mission_id;

  v_ready_for_closure :=
    v_total>0
    and v_completed=v_total
    and v_pending_handoffs=0
    and v_escalated_handoffs=0
    and v_blocked=0;

  return jsonb_build_object(
    'schemaVersion','vaos.eight-agent-operating-model.v1',
    'mission',to_jsonb(v_mission),
    'workPackages',coalesce((
      select jsonb_agg(to_jsonb(w) order by w.id)
      from vaos_private.work_packages w
      where w.mission_id=p_mission_id
    ),'[]'::jsonb),
    'handoffs',coalesce((
      select jsonb_agg(to_jsonb(h) order by h.created_at,h.id)
      from vaos_private.agent_handoffs h
      where h.mission_id=p_mission_id
    ),'[]'::jsonb),
    'handoffEvents',coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at,e.id)
      from vaos_private.agent_handoff_events e
      join vaos_private.agent_handoffs h on h.id=e.handoff_id
      where h.mission_id=p_mission_id
    ),'[]'::jsonb),
    'metrics',jsonb_build_object(
      'totalWorkPackages',v_total,
      'completedWorkPackages',v_completed,
      'blockedWorkPackages',v_blocked,
      'pendingHandoffs',v_pending_handoffs,
      'escalatedHandoffs',v_escalated_handoffs,
      'readyForClosure',v_ready_for_closure
    )
  );
end;
$$;

revoke all on function public.vaos_create_operating_mission(text,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.vaos_create_operating_handoff(text,text,text,text,text,text,text,text,text,jsonb,jsonb,text) from public, anon, authenticated;
revoke all on function public.vaos_transition_operating_handoff(text,text,integer,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.vaos_operating_mission_snapshot(text,text) from public, anon, authenticated;

grant execute on function public.vaos_create_operating_mission(text,text,text,text,text,jsonb) to service_role;
grant execute on function public.vaos_create_operating_handoff(text,text,text,text,text,text,text,text,text,jsonb,jsonb,text) to service_role;
grant execute on function public.vaos_transition_operating_handoff(text,text,integer,text,text,text,jsonb) to service_role;
grant execute on function public.vaos_operating_mission_snapshot(text,text) to service_role;
