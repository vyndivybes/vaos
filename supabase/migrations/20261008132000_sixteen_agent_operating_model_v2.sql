-- Sixteen-agent operating model v2.
-- Expands the durable mission/handoff fabric to the full qualified VAOS/VYNDI workforce.
-- This does NOT enable the VAOS->VYNDI write bridge. Operational mutations remain PREPARE_ONLY.

alter table vaos_private.work_packages
  drop constraint if exists work_package_owner_check;
alter table vaos_private.work_packages
  add constraint work_package_owner_check check (
    owner_agent_id in ('orchestrator','project','vibpe','qa','risk','security','knowledge','release','commercial','procurement','inventory','production','maintenance','finance','people','engineering-configuration')
  );

alter table vaos_private.agent_handoffs
  drop constraint if exists agent_handoff_from_check;
alter table vaos_private.agent_handoffs
  add constraint agent_handoff_from_check check (
    from_agent_id in ('orchestrator','project','vibpe','qa','risk','security','knowledge','release','commercial','procurement','inventory','production','maintenance','finance','people','engineering-configuration')
  );

alter table vaos_private.agent_handoffs
  drop constraint if exists agent_handoff_to_check;
alter table vaos_private.agent_handoffs
  add constraint agent_handoff_to_check check (
    to_agent_id in ('orchestrator','project','vibpe','qa','risk','security','knowledge','release','commercial','procurement','inventory','production','maintenance','finance','people','engineering-configuration')
  );

alter table vaos_private.agent_handoff_events
  drop constraint if exists agent_handoff_event_actor_check;
alter table vaos_private.agent_handoff_events
  add constraint agent_handoff_event_actor_check check (
    by_agent_id in ('orchestrator','project','vibpe','qa','risk','security','knowledge','release','commercial','procurement','inventory','production','maintenance','finance','people','engineering-configuration')
  );

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

  if p_from_agent_id not in ('orchestrator','project','vibpe','qa','risk','security','knowledge','release','commercial','procurement','inventory','production','maintenance','finance','people','engineering-configuration')
     or p_to_agent_id not in ('orchestrator','project','vibpe','qa','risk','security','knowledge','release','commercial','procurement','inventory','production','maintenance','finance','people','engineering-configuration')
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

create or replace function public.vaos_dispatch_operating_mission(
  p_server_key text,
  p_mission_id text,
  p_max_assignments integer default 16
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mission vaos_private.missions%rowtype;
  v_wp vaos_private.work_packages%rowtype;
  v_handoff_id text;
  v_handoff vaos_private.agent_handoffs%rowtype;
  v_count integer := 0;
  v_handoffs jsonb := '[]'::jsonb;
begin
  perform vaos_private.assert_server_key(p_server_key);

  if nullif(trim(coalesce(p_mission_id,'')),'') is null then
    raise exception 'MISSION_ID_REQUIRED';
  end if;
  if p_max_assignments is null or p_max_assignments < 1 or p_max_assignments > 16 then
    raise exception 'MISSION_DISPATCH_LIMIT_INVALID';
  end if;

  select * into v_mission
  from vaos_private.missions
  where id=p_mission_id
  for update;
  if not found then raise exception 'MISSION_NOT_FOUND'; end if;
  if v_mission.status not in ('PLANNED','ACTIVE') then
    raise exception 'MISSION_DISPATCH_NOT_ALLOWED';
  end if;

  for v_wp in
    select w.*
    from vaos_private.work_packages w
    join vaos_private.digital_employees de on de.id=w.owner_agent_id
    join vaos_private.responsibility_contracts rc on rc.id=de.responsibility_contract_id
    where w.mission_id=p_mission_id
      and w.status in ('PLANNED','READY')
      and w.owner_agent_id <> 'orchestrator'
      and de.status='ACTIVE'
      and de.qualification_level >= w.minimum_qualification_level
      and not exists (
        select 1
        from unnest(w.depends_on) as dep(work_package_id)
        left join vaos_private.work_packages child
          on child.id=dep.work_package_id and child.mission_id=w.mission_id
        where child.id is null or child.status<>'COMPLETED'
      )
      and not exists (
        select 1 from vaos_private.agent_handoffs prior
        where prior.work_package_id=w.id
      )
    order by w.id
    for update of w skip locked
    limit p_max_assignments
  loop
    v_handoff_id := 'hnd-' || substr(md5(p_mission_id || ':' || v_wp.id),1,24);

    insert into vaos_private.agent_handoffs(
      id,mission_id,work_package_id,from_agent_id,to_agent_id,requested_job,reason,
      required_outcome,acceptance_criteria,evidence_refs,priority,status,version,request_hash
    ) values (
      v_handoff_id,p_mission_id,v_wp.id,'orchestrator',v_wp.owner_agent_id,v_wp.action_type,
      'Assignment from governed mission: ' || v_mission.objective,
      'Independent evidence-supported assessment: ' || v_wp.action_type,
      array['Attach outcome evidence','Obtain independent verification'],
      '{}'::text[],
      case when v_wp.risk='critical' then 'CRITICAL'
           when v_wp.risk='high' then 'HIGH'
           when v_wp.risk='medium' then 'NORMAL'
           else 'LOW' end,
      'PENDING',1,md5('VAOS_DISPATCH_V2|' || p_mission_id || '|' || v_wp.id)
    )
    returning * into v_handoff;

    insert into vaos_private.agent_handoff_events(
      handoff_id,outcome,from_status,to_status,by_agent_id,reason,evidence_refs
    ) values (
      v_handoff_id,'CREATED',null,'PENDING','orchestrator',
      'Mission dispatcher assigned qualified agent','{}'::text[]
    );

    update vaos_private.work_packages
    set status='READY',updated_at=now()
    where id=v_wp.id;

    v_handoffs := v_handoffs || jsonb_build_array(to_jsonb(v_handoff));
    v_count := v_count + 1;
  end loop;

  if v_count>0 then
    update vaos_private.missions
    set status='ACTIVE',updated_at=now()
    where id=p_mission_id;
  end if;

  return jsonb_build_object(
    'schemaVersion','vaos.mission-dispatch.v2',
    'outcome',case when v_count>0 then 'DISPATCHED' else 'NO_READY_WORK' end,
    'missionId',p_mission_id,
    'count',v_count,
    'handoffs',v_handoffs
  );
end;
$$;

revoke all on function public.vaos_create_operating_handoff(text,text,text,text,text,text,text,text,text,jsonb,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.vaos_create_operating_handoff(text,text,text,text,text,text,text,text,text,jsonb,jsonb,text)
  to service_role;

revoke all on function public.vaos_dispatch_operating_mission(text,text,integer)
  from public, anon, authenticated;
grant execute on function public.vaos_dispatch_operating_mission(text,text,integer)
  to service_role;

insert into vaos_private.events(type,source,payload)
values(
  'WORKFORCE.OPERATING_MODEL_V2.ACTIVATED',
  'migration:20261008132000_sixteen_agent_operating_model_v2',
  jsonb_build_object(
    'catalogVersion','2.0.0',
    'workforceSize',16,
    'originalSupervisoryEmployees',8,
    'operationalEmployees',8,
    'missionDispatchMaxAssignments',16,
    'writeBridgeExecutionEnabled',false,
    'operationalMutations','PREPARE_ONLY'
  )
);
