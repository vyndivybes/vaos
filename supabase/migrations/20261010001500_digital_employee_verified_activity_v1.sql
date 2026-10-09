-- Digital Employee activity repair. Last verified work is NOT an online heartbeat.
-- No authority, approval, provider or execution-routing changes.

create function vaos_private.record_employee_execution_activity()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_agent_id text;
  v_proof_at timestamptz;
begin
  if NEW.status <> 'SUCCEEDED' or OLD.status = 'SUCCEEDED'
     or NEW.action_type LIKE 'WORKFORCE.%' then
    return NEW;
  end if;

  select i.agent_id, ev.verified_at into v_agent_id, v_proof_at
  from vaos_private.intents i
  join vaos_private.execution_evidence ev on ev.intent_id=i.id and ev.job_id=NEW.id
  where i.id = NEW.intent_id
    and ev.verification @> '{"verified":true}'::jsonb
    and ev.verified_at <= now()
  limit 1;

  if v_agent_id is not null and v_proof_at is not null then
    update vaos_private.digital_employees
    set heartbeat_at = greatest(coalesce(heartbeat_at,v_proof_at),v_proof_at),
        updated_at = now()
    where id = v_agent_id and status = 'ACTIVE'
      and (heartbeat_at is null or heartbeat_at < v_proof_at);
  end if;
  return NEW;
end;
$$;

revoke all on function vaos_private.record_employee_execution_activity() from public, anon, authenticated, service_role;
create trigger vaos_employee_execution_activity
  after update of status on vaos_private.execution_jobs
  for each row
  when (NEW.status = 'SUCCEEDED' and OLD.status is distinct from NEW.status)
  execute function vaos_private.record_employee_execution_activity();

-- A handoff requires separate checker approval and hash-bearing work evidence.
create function vaos_private.record_employee_handoff_activity()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_proof_at timestamptz;
begin
  if NEW.status <> 'COMPLETED' or OLD.status = 'COMPLETED'
     or NEW.verified_by_agent_id is null
     or NEW.verified_by_agent_id = NEW.to_agent_id
     or NEW.verified_at is null then
    return NEW;
  end if;

  select max(w.created_at) into v_proof_at
  from vaos_private.handoff_work_evidence w
  where w.handoff_id=NEW.id
    and w.author_agent_id = NEW.to_agent_id
    and w.action_type = NEW.requested_job
    and w.report_sha256 IS NOT NULL
    and w.created_at <= NEW.verified_at;

  if v_proof_at is not null then
    update vaos_private.digital_employees
    set heartbeat_at=greatest(coalesce(heartbeat_at,v_proof_at),v_proof_at),
        updated_at=now()
    where id=NEW.to_agent_id and status='ACTIVE'
      and (heartbeat_at is null or heartbeat_at < v_proof_at);
  end if;
  return NEW;
end;
$$;

revoke all on function vaos_private.record_employee_handoff_activity() from public, anon, authenticated, service_role;
create trigger vaos_employee_handoff_activity
  after update of status on vaos_private.agent_handoffs
  for each row
  when (NEW.status = 'COMPLETED' and OLD.status is distinct from NEW.status)
  execute function vaos_private.record_employee_handoff_activity();

-- Backfill from historic proof timestamps; never assign now() as heartbeat.
with execution_proofs as (
  select i.agent_id, ev.verified_at as proof_at
  from vaos_private.execution_jobs j
  join vaos_private.execution_evidence ev on ev.job_id=j.id and ev.intent_id=j.intent_id
  join vaos_private.intents i on i.id=j.intent_id
  WHERE j.status='SUCCEEDED'
    and j.action_type NOT LIKE 'WORKFORCE.%'
    and ev.verification @> '{"verified":true}'::jsonb
    and ev.verified_at <= now()
), handoff_proofs as (
  select h.to_agent_id as agent_id, w.created_at as proof_at
  from vaos_private.agent_handoffs h
  join vaos_private.handoff_work_evidence w on w.handoff_id=h.id
    and w.author_agent_id=h.to_agent_id and w.action_type=h.requested_job
  WHERE h.status='COMPLETED'
    and h.verified_by_agent_id <> h.to_agent_id
    and h.verified_at is not null
    and w.report_sha256 is not null
    and w.created_at <= h.verified_at
), proof_union as (
  select * from execution_proofs union all select * from handoff_proofs
), latest_proof as (
  select agent_id, MAX(proof_at) as proof_at from proof_union group by agent_id
)
update vaos_private.digital_employees e
set heartbeat_at=greatest(coalesce(e.heartbeat_at,p.proof_at),p.proof_at),
    updated_at=now()
from latest_proof p
where e.id=p.agent_id and e.status='ACTIVE'
  and (e.heartbeat_at is null or e.heartbeat_at < p.proof_at);

-- Replace old qualification placeholders only when no current mission exists.
update vaos_private.digital_employees e
set current_assignment='No open mission assignment',updated_at=now()
where e.status='ACTIVE'
  and e.current_assignment like 'Awaiting % qualification'
  and not exists (
    select 1 from vaos_private.work_packages wp
    where wp.owner_agent_id=e.id and wp.status in ('PLANNED','READY','IN_PROGRESS','BLOCKED')
  );

-- Retain the existing authenticated snapshot endpoint and server-key enforcement.
alter function public.vaos_control_snapshot(text) rename to vaos_control_snapshot_pre_workstate;
revoke all on function public.vaos_control_snapshot_pre_workstate(text) from public, anon, authenticated;

create function public.vaos_control_snapshot(p_server_key text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_snapshot jsonb;
  v_employees jsonb;
begin
  v_snapshot := public.vaos_control_snapshot_pre_workstate(p_server_key);
  select coalesce(jsonb_agg(
    item.value || jsonb_build_object(
      'currentAssignment', case when wp.id is null
        then item.value->>'currentAssignment'
        else 'Mission ' || wp.mission_id || ': ' || wp.action_type || ' (' || wp.status || ')' end,
      'assignmentStatus',coalesce(wp.status,'UNASSIGNED'),
      'lastVerifiedActivityAt',item.value->'heartbeatAt',
      'activitySignal',case when item.value->>'heartbeatAt' is null
        then 'NO_VERIFIED_ACTIVITY' else 'RECORDED' end
    ) order by item.ordinality
  ), '[]'::jsonb) into v_employees
  from jsonb_array_elements(coalesce(v_snapshot#>'{workforce,digitalEmployees}','[]'::jsonb))
       with ordinality as item(value, ordinality)
  left join lateral (
    select wp.id,wp.mission_id,wp.action_type,wp.status
    from vaos_private.work_packages wp
    where wp.owner_agent_id = item.value->>'id'
      and wp.status in ('PLANNED','READY','IN_PROGRESS','BLOCKED')
    order by case wp.status when 'IN_PROGRESS' then 1 when 'BLOCKED' then 2
               when 'READY' then 3 else 4 end, wp.updated_at desc, wp.id
    limit 1
  ) wp on true;
  return jsonb_set(v_snapshot,'{workforce,digitalEmployees}',v_employees,false);
end;
$$;
revoke all on function public.vaos_control_snapshot(text) from public, anon, authenticated;
grant execute on function public.vaos_control_snapshot(text) to service_role;
