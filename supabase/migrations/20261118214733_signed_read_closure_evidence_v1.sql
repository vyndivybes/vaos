-- Mission readiness safety hardening: a signed VYNDI read handoff without an
-- immutable report hash and an independent REVIEWED: evidence reference cannot
-- prepare any mission for human closure. No mission state is changed by applying DDL.
-- Read-side source-revision/completeness qualification remains independent and HOLD.
CREATE OR REPLACE FUNCTION public.vaos_prepare_operating_mission_closure(p_server_key text, p_mission_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
            'PROJECT.TRACK_DEPENDENCY','KNOWLEDGE.DETECT_GAP','RELEASE.CHECK_OPEN_ITEMS','RISK.IDENTIFY','PROJECT.DETECT_DELAY','ORCHESTRATOR.INTAKE_MISSION',
                      'ORCHESTRATOR.MONITOR_MISSION','ORCHESTRATOR.CONSOLIDATE_RESULT',
            'COMMERCIAL.OBSERVE_PIPELINE','PROCUREMENT.OBSERVE_SHORTAGE','PROCUREMENT.OBSERVE_OPEN_POS',
            'INVENTORY.OBSERVE_STOCK','PRODUCTION.OBSERVE_WIP','MAINTENANCE.OBSERVE_ASSET',
            'FINANCE.OBSERVE_LEDGER','PEOPLE.OBSERVE_WORKFORCE','ENGINEERING.OBSERVE_CONFIGURATION'
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
$function$;

revoke all on function public.vaos_prepare_operating_mission_closure(text,text) from public, anon, authenticated;
grant execute on function public.vaos_prepare_operating_mission_closure(text,text) to service_role;
