-- Operating mission dispatch v1: atomic qualified-agent assignments only.
-- No automatic action effects or agent-identity impersonation are authorized here.

create or replace function vaos_private.assert_operating_handoff_ready()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wp vaos_private.work_packages%rowtype;
  v_employee vaos_private.digital_employees%rowtype;
begin
  select * into v_wp
  from vaos_private.work_packages
  where id=new.work_package_id and mission_id=new.mission_id
  for update;

  if not found then raise exception 'HANDOFF_WORK_PACKAGE_NOT_FOUND'; end if;
  if new.to_agent_id <> v_wp.owner_agent_id or new.requested_job <> v_wp.action_type then
    raise exception 'HANDOFF_OWNER_JOB_MISMATCH';
  end if;
  if v_wp.status not in ('PLANNED','READY') then
    raise exception 'HANDOFF_WORK_PACKAGE_NOT_READY';
  end if;
  if exists (
    select 1
    from unnest(v_wp.depends_on) as dep(work_package_id)
    left join vaos_private.work_packages child
      on child.id=dep.work_package_id and child.mission_id=new.mission_id
    where child.id is null or child.status <> 'COMPLETED'
  ) then
    raise exception 'HANDOFF_DEPENDENCY_NOT_COMPLETE';
  end if;

  select * into v_employee
  from vaos_private.digital_employees
  where id=new.to_agent_id;
  if not found
     or v_employee.status <> 'ACTIVE'
     or v_employee.qualification_level < v_wp.minimum_qualification_level
     or not exists (
       select 1 from vaos_private.responsibility_contracts rc
       where rc.id=v_employee.responsibility_contract_id
     ) then
    raise exception 'HANDOFF_AGENT_NOT_ACTIVE_OR_QUALIFIED';
  end if;

  if exists (
    select 1 from vaos_private.agent_handoffs prior
    where prior.work_package_id=new.work_package_id
  ) then
    raise exception 'HANDOFF_WORK_PACKAGE_ALREADY_ASSIGNED';
  end if;

  return new;
end;
$$;

revoke all on function vaos_private.assert_operating_handoff_ready() from public, anon, authenticated, service_role;

drop trigger if exists agent_handoff_readiness_guard
  on vaos_private.agent_handoffs;
create trigger agent_handoff_readiness_guard
before insert on vaos_private.agent_handoffs
for each row execute function vaos_private.assert_operating_handoff_ready();

create or replace function public.vaos_dispatch_operating_mission(
  p_server_key text,
  p_mission_id text,
  p_max_assignments integer default 8
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
  if p_max_assignments is null or p_max_assignments < 1 or p_max_assignments > 8 then
    raise exception 'MISSION_DISPATCH_LIMIT_INVALID';
  end if;

  -- Serializes dispatches for one mission; each assignment and event is transactional.
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
    join vaos_private.digital_employees de
      on de.id=w.owner_agent_id
    join vaos_private.responsibility_contracts rc
      on rc.id=de.responsibility_contract_id
    where w.mission_id=p_mission_id
      and w.status in ('PLANNED','READY')
      and w.owner_agent_id <> 'orchestrator'
      and de.status = 'ACTIVE'
      and qualification_level >= minimum_qualification_level
      and not exists (
        select 1
        from unnest(w.depends_on) as dep(work_package_id)
        left join vaos_private.work_packages child
          on child.id=dep.work_package_id and child.mission_id=w.mission_id
        where child.id is null or child.status <> 'COMPLETED'
      )
      and not exists (
        select 1
        from vaos_private.agent_handoffs prior
        where prior.work_package_id=w.id
      )
    order by w.id
    for update of w skip locked
    limit p_max_assignments
  loop
    v_handoff_id := 'hnd-' || substr(md5(p_mission_id || ':' || v_wp.id),1,24);

    insert into vaos_private.agent_handoffs (
      id,mission_id,work_package_id,from_agent_id,to_agent_id,requested_job,reason,
      required_outcome,acceptance_criteria,evidence_refs,priority,status,version,request_hash
    ) values (
      v_handoff_id,p_mission_id,v_wp.id,'orchestrator',v_wp.owner_agent_id,v_wp.action_type,
      'Assignment from governed mission: ' || v_mission.objective,
      'Independent evidence-supported assessment: ' || v_wp.action_type,
      array['Attach outcome evidence', 'Obtain independent verification'],
      '{}'::text[],
      case when v_wp.risk='critical' then 'CRITICAL'
           when v_wp.risk='high' then 'HIGH'
           when v_wp.risk='medium' then 'NORMAL'
           else 'LOW' end,
      'PENDING',1,md5('VAOS_DISPATCH_V1|' || p_mission_id || '|' || v_wp.id)
    )
    returning * into v_handoff;

    insert into vaos_private.agent_handoff_events (
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

  if v_count > 0 then
    update vaos_private.missions
    set status='ACTIVE',updated_at=now()
    where id=p_mission_id;
  end if;

  return jsonb_build_object(
    'schemaVersion','vaos.mission-dispatch.v1',
    'outcome',case when v_count>0 then 'DISPATCHED' else 'NO_READY_WORK' end,
    'missionId',p_mission_id,
    'count',v_count,
    'handoffs',v_handoffs
  );
end;
$$;

revoke all on function public.vaos_dispatch_operating_mission(text,text,integer)
  from public, anon, authenticated;
grant execute on function public.vaos_dispatch_operating_mission(text,text,integer)
  to service_role;
