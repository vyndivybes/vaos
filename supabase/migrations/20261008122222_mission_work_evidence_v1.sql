-- Read-only original-eight mission audit evidence. No domain effects authorized.
-- Immutable, private, replay-safe evidence for independent verifier recomputation.
create table if not exists vaos_private.handoff_work_evidence (
  evidence_id text primary key,
  handoff_id text not null references vaos_private.agent_handoffs(id),
  handoff_version integer not null check (handoff_version >= 1),
  author_agent_id text not null,
  action_type text not null,
  report jsonb not null,
  report_sha256 text not null,
  created_at timestamptz not null default now(),
  unique (handoff_id, handoff_version)
);

alter table vaos_private.handoff_work_evidence enable row level security;
revoke all on table vaos_private.handoff_work_evidence from public, anon, authenticated, service_role;
create index if not exists handoff_work_evidence_handoff_idx
  on vaos_private.handoff_work_evidence(handoff_id, created_at);

create or replace function public.vaos_record_handoff_work_evidence(
  p_server_key text,
  p_handoff_id text,
  p_expected_version integer,
  p_by_agent_id text,
  p_report jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handoff vaos_private.agent_handoffs%rowtype;
  v_work vaos_private.work_packages%rowtype;
  v_agent vaos_private.digital_employees%rowtype;
  v_existing vaos_private.handoff_work_evidence%rowtype;
  v_hash text;
  v_evidence_id text;
begin
  perform vaos_private.assert_server_key(p_server_key);
  select * into v_handoff from vaos_private.agent_handoffs where id=p_handoff_id for update;
  if not found then raise exception 'HANDOFF_EVIDENCE_HANDOFF_NOT_FOUND'; end if;
  if v_handoff.status <> 'ACCEPTED' then raise exception 'HANDOFF_EVIDENCE_STATUS_INVALID'; end if;
  if p_expected_version is null or p_expected_version <> v_handoff.version then
    raise exception 'HANDOFF_VERSION_CONFLICT';
  end if;
  if p_by_agent_id <> v_handoff.to_agent_id then
    raise exception 'HANDOFF_EVIDENCE_OWNER_MISMATCH';
  end if;
  select * into v_work from vaos_private.work_packages where id=v_handoff.work_package_id;
  if not found then raise exception 'HANDOFF_EVIDENCE_WORK_PACKAGE_NOT_FOUND'; end if;
  if v_work.action_type <> v_handoff.requested_job
     or v_work.human_approval_required
     or v_work.authority > 2
     or v_work.execution_mode = 'GOVERNED_EXECUTION'
     or v_work.action_type not in (
       'PROJECT.TRACK_DEPENDENCY','KNOWLEDGE.DETECT_GAP','RELEASE.CHECK_OPEN_ITEMS'
     ) then
    raise exception 'HANDOFF_EVIDENCE_ACTION_NOT_PERMITTED';
  end if;
  select * into v_agent from vaos_private.digital_employees where id=p_by_agent_id;
  if not found or v_agent.status <> 'ACTIVE'
     or v_agent.qualification_level < v_work.minimum_qualification_level
     or not exists (
       select 1 from vaos_private.responsibility_contracts c
       where c.id=v_agent.responsibility_contract_id
     ) then
    raise exception 'HANDOFF_EVIDENCE_AGENT_NOT_QUALIFIED';
  end if;
  if jsonb_typeof(coalesce(p_report,'null'::jsonb)) <> 'object'
     or p_report->>'kind' <> 'READ_ONLY_MISSION_AUDIT'
     or p_report->>'actionType' <> v_work.action_type
     or p_report->>'workPackageId' <> v_work.id
     or p_report->>'schemaVersion' <> 'vaos.read-only-mission-audit.v1'
     or jsonb_typeof(p_report->'findings') <> 'array' then
    raise exception 'HANDOFF_EVIDENCE_REPORT_INVALID';
  end if;

  v_hash:=encode(extensions.digest(convert_to(p_report::text,'UTF8'),'sha256'),'hex');
  v_evidence_id:='vaos-evidence:'||substr(md5(v_handoff.id||':'||p_expected_version::text),1,24);

  select * into v_existing from vaos_private.handoff_work_evidence
    where handoff_id=p_handoff_id and handoff_version=p_expected_version;
  if found then
    if v_existing.report_sha256 <> v_hash then
      raise exception 'MISSION_EVIDENCE_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('outcome','REPLAY','evidenceId',v_existing.evidence_id);
  end if;

  insert into vaos_private.handoff_work_evidence
    (evidence_id,handoff_id,handoff_version,author_agent_id,action_type,report,report_sha256)
  values (v_evidence_id,p_handoff_id,p_expected_version,p_by_agent_id,v_work.action_type,p_report,v_hash);
  return jsonb_build_object('outcome','RECORDED','evidenceId',v_evidence_id);
end;
$$;

create or replace function public.vaos_get_handoff_work_evidence(
  p_server_key text,
  p_evidence_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evidence vaos_private.handoff_work_evidence%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);
  select * into v_evidence from vaos_private.handoff_work_evidence where evidence_id=p_evidence_id;
  if not found then raise exception 'MISSION_EVIDENCE_NOT_FOUND'; end if;
  return jsonb_build_object(
    'id',v_evidence.evidence_id,
    'handoff_id',v_evidence.handoff_id,
    'author_agent_id',v_evidence.author_agent_id,
    'report',v_evidence.report,
    'reportSha256',v_evidence.report_sha256
  );
end;
$$;

create or replace function public.vaos_list_runnable_missions(
  p_server_key text,
  p_limit integer default 8
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform vaos_private.assert_server_key(p_server_key);
  if p_limit is null or p_limit < 1 or p_limit > 8 then
    raise exception 'MISSION_DISCOVERY_LIMIT_INVALID';
  end if;
  return jsonb_build_object(
    'missionIds',coalesce((
      select jsonb_agg(q.id order by q.id)
      from (
        select distinct m.id
        from vaos_private.missions m
        join vaos_private.agent_handoffs h on h.mission_id=m.id
        join vaos_private.work_packages wp on wp.id=h.work_package_id
        join vaos_private.digital_employees d on d.id=h.to_agent_id
        where m.status='ACTIVE'
          and h.status in ('PENDING','ACCEPTED','SUBMITTED')
          and h.requested_job in (
            'PROJECT.TRACK_DEPENDENCY','KNOWLEDGE.DETECT_GAP','RELEASE.CHECK_OPEN_ITEMS'
          )
          and wp.human_approval_required=false
          and wp.authority<=2
          and wp.action_type=h.requested_job
          and d.status='ACTIVE'
          and d.qualification_level>=wp.minimum_qualification_level
        order by m.id
        limit p_limit
      ) q
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.vaos_record_handoff_work_evidence(text,text,integer,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.vaos_get_handoff_work_evidence(text,text)
  from public, anon, authenticated;
revoke all on function public.vaos_list_runnable_missions(text,integer)
  from public, anon, authenticated;
grant execute on function public.vaos_record_handoff_work_evidence(text,text,integer,text,jsonb)
  to service_role;
grant execute on function public.vaos_get_handoff_work_evidence(text,text)
  to service_role;
grant execute on function public.vaos_list_runnable_missions(text,integer)
  to service_role;

-- Recheck worker and independent reviewer qualification at the actual transition,
-- not only at initial assignment. The trigger rolls back an unauthorized event.
create or replace function vaos_private.assert_current_handoff_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handoff vaos_private.agent_handoffs%rowtype;
  v_work vaos_private.work_packages%rowtype;
  v_actor vaos_private.digital_employees%rowtype;
  v_floor integer;
  v_allowed text[];
begin
  if new.outcome not in ('ACCEPT','SUBMIT','VERIFY','REJECT_VERIFICATION') then
    return new;
  end if;

  select * into v_handoff
  from vaos_private.agent_handoffs where id=new.handoff_id;
  if not found then raise exception 'HANDOFF_ACTOR_REQUALIFICATION_REQUIRED'; end if;

  select * into v_work
  from vaos_private.work_packages where id=v_handoff.work_package_id;
  if not found then raise exception 'HANDOFF_ACTOR_REQUALIFICATION_REQUIRED'; end if;

  select * into v_actor
  from vaos_private.digital_employees where id=new.by_agent_id;

  v_floor := case new.by_agent_id
    when 'security' then 4
    when 'vibpe' then 3
    when 'risk' then 3
    when 'qa' then 3
    when 'orchestrator' then 2
    when 'project' then 2
    when 'knowledge' then 2
    when 'release' then 2
    else 99
  end;

  if not found
     or v_actor.status <> 'ACTIVE'
     or v_actor.qualification_level < v_floor
     or not exists (
       select 1 from vaos_private.responsibility_contracts r
       where r.id=v_actor.responsibility_contract_id
     ) then
    raise exception 'HANDOFF_ACTOR_REQUALIFICATION_REQUIRED';
  end if;

  if new.outcome in ('ACCEPT','SUBMIT') then
    if new.by_agent_id <> v_handoff.to_agent_id
       or v_actor.qualification_level < v_work.minimum_qualification_level then
      raise exception 'HANDOFF_ACTOR_REQUALIFICATION_REQUIRED';
    end if;
  else
    v_allowed:=case
      when cardinality(v_work.verifier_agent_ids)>0 then v_work.verifier_agent_ids
      when v_handoff.to_agent_id='orchestrator' then array['project']::text[]
      else array['orchestrator']::text[]
    end;
    if new.by_agent_id=v_handoff.to_agent_id
       or not new.by_agent_id=any(v_allowed) then
      raise exception 'HANDOFF_ACTOR_REQUALIFICATION_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function vaos_private.assert_current_handoff_actor()
  from public, anon, authenticated, service_role;

drop trigger if exists handoff_actor_requalification_guard
  on vaos_private.agent_handoff_events;
create trigger handoff_actor_requalification_guard
before insert on vaos_private.agent_handoff_events
for each row execute function vaos_private.assert_current_handoff_actor();
