-- Read-only VAOS mission SLA age screening. The catalogue SLA is NOT an
-- approved project milestone. Evidence, discovery and closure advance together.
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
       'PROJECT.TRACK_DEPENDENCY','KNOWLEDGE.DETECT_GAP','RELEASE.CHECK_OPEN_ITEMS','RISK.IDENTIFY','PROJECT.DETECT_DELAY'
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
          and (
            -- Existing active-work queue: only bounded, qualified read-only work.
            (
              h.status in ('PENDING','ACCEPTED','SUBMITTED')
              and h.requested_job in (
                'PROJECT.TRACK_DEPENDENCY','KNOWLEDGE.DETECT_GAP',
                'RELEASE.CHECK_OPEN_ITEMS','RISK.IDENTIFY','PROJECT.DETECT_DELAY'
              )
              and wp.human_approval_required=false
              and wp.authority<=2
              and wp.action_type=h.requested_job
              and d.status='ACTIVE'
              and d.qualification_level>=wp.minimum_qualification_level
            )
            or
            -- A manual RUN_SAFE call can complete the final handoff before the
            -- scheduled sweep sees the mission. Re-discover ONLY fully
            -- completed read-only missions so the existing server-key-gated
            -- independent-evidence closure RPC can assess readiness.
            (
              not exists (
                select 1 from vaos_private.work_packages remaining
                where remaining.mission_id=m.id
                  and (
                    remaining.status <> 'COMPLETED'
                    or remaining.action_type not in (
                      'PROJECT.TRACK_DEPENDENCY','KNOWLEDGE.DETECT_GAP',
                      'RELEASE.CHECK_OPEN_ITEMS','RISK.IDENTIFY','PROJECT.DETECT_DELAY'
                    )
                    or remaining.human_approval_required=true
                    or remaining.authority>2
                    or remaining.execution_mode not in ('ANALYSE','PREPARE')
                  )
              )
              and not exists (
                select 1 from vaos_private.agent_handoffs unresolved
                where unresolved.mission_id=m.id
                  and unresolved.status <> 'COMPLETED'
              )
              and exists (
                select 1 from vaos_private.agent_handoffs verified
                where verified.mission_id=m.id
                  and verified.status='COMPLETED'
                  and verified.verified_by_agent_id is not null
                  and verified.verified_by_agent_id <> verified.to_agent_id
              )
            )
          )
        order by m.id
        limit p_limit
      ) q
    ),'[]'::jsonb)
  );
end;
$$;




create or replace function public.vaos_prepare_operating_mission_closure(
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
  v_total integer;
  v_verified integer;
begin
  perform vaos_private.assert_server_key(p_server_key);
  if nullif(trim(coalesce(p_mission_id,'')),'') is null then
    raise exception 'MISSION_ID_REQUIRED';
  end if;

  select * into v_mission from vaos_private.missions
  where id=p_mission_id for update;
  if not found then raise exception 'MISSION_NOT_FOUND'; end if;
  if v_mission.status='READY_FOR_CLOSURE' then
    return jsonb_build_object('outcome','REPLAY','missionId',p_mission_id,'status','READY_FOR_CLOSURE');
  end if;
  if v_mission.status <> 'ACTIVE' then
    raise exception 'MISSION_CLOSURE_NOT_READY';
  end if;

  select count(*) into v_total from vaos_private.work_packages where mission_id=p_mission_id;
  if v_total <= 0 then raise exception 'MISSION_CLOSURE_NOT_READY'; end if;

  -- Every package must be completed through a separate verified handoff,
  -- and the signed-off report must be backed by evidence.
  select count(*) into v_verified
  from vaos_private.work_packages wp
  where wp.mission_id=p_mission_id
    and wp.status='COMPLETED'
    and exists (
      select 1
      from vaos_private.agent_handoffs h
      where h.work_package_id=wp.id
        and h.mission_id=p_mission_id
        and h.status='COMPLETED'
        and h.verified_by_agent_id is not null
        and h.verified_by_agent_id <> h.to_agent_id
        and cardinality(h.evidence_refs)>0
        and exists (
          select 1 from vaos_private.agent_handoff_events ev
          where ev.handoff_id=h.id
            and ev.outcome='VERIFY'
            and ev.by_agent_id=h.verified_by_agent_id
            and cardinality(ev.evidence_refs)>0
        )
        -- Read-only automatic findings require an actual immutable evidence report,
        -- not merely a handoff reference submitted by the worker.
        and (
          wp.action_type not in (
            'PROJECT.TRACK_DEPENDENCY','KNOWLEDGE.DETECT_GAP','RELEASE.CHECK_OPEN_ITEMS','RISK.IDENTIFY','PROJECT.DETECT_DELAY'
          )
          or exists (
            select 1 from vaos_private.handoff_work_evidence we
            where we.handoff_id=h.id
              and we.author_agent_id=h.to_agent_id
              and we.action_type=wp.action_type
              and we.evidence_id=any(h.evidence_refs)
              and we.report_sha256 =
                encode(extensions.digest(convert_to(we.report::text,'UTF8'),'sha256'),'hex')
              and exists (
                select 1 from vaos_private.agent_handoff_events ve
                where ve.handoff_id=h.id and ve.outcome='VERIFY'
                  and ('REVIEWED:'||we.evidence_id)=any(ve.evidence_refs)
              )
          )
        )
    );

  if v_verified<>v_total then raise exception 'MISSION_CLOSURE_NOT_READY'; end if;
  -- Refuse any unresolved or rejected handoff on the mission.
  if exists (
    select 1 from vaos_private.agent_handoffs h
    where h.mission_id=p_mission_id
      and h.status<>'COMPLETED'
  ) then raise exception 'MISSION_CLOSURE_NOT_READY'; end if;

  update vaos_private.missions
  set status='READY_FOR_CLOSURE',updated_at=now()
  where id=p_mission_id;

  return jsonb_build_object(
    'outcome','PREPARED',
    'missionId',p_mission_id,
    'status','READY_FOR_CLOSURE',
    'verifiedWorkPackages',v_verified,
    'requiresHumanApproval',true
  );
end;
$$;


revoke all on function public.vaos_record_handoff_work_evidence(text,text,integer,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.vaos_record_handoff_work_evidence(text,text,integer,text,jsonb)
 to service_role;
revoke all on function public.vaos_list_runnable_missions(text,integer)
 from public,anon,authenticated;
grant execute on function public.vaos_list_runnable_missions(text,integer)
 to service_role;
revoke all on function public.vaos_prepare_operating_mission_closure(text,text)
 from public,anon,authenticated;
grant execute on function public.vaos_prepare_operating_mission_closure(text,text)
 to service_role;
