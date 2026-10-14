-- G5: bounded, founder-only mission Q&A uses the existing mission/handoff/evidence tables.
-- Server key is validated by the existing vaos_private authority. No raw reports,
-- payloads, employee PII, purchases, or effectful operations are returned.
create or replace function public.vaos_founder_mission_answer_summary(p_server_key text)
returns jsonb
language plpgsql security definer set search_path to ''
as $fn$
declare
  v_rows jsonb := '[]'::jsonb;
  v_latest jsonb := null;
  v_total integer := 0;
begin
  perform vaos_private.assert_server_key(p_server_key);
  select count(*) into v_total from vaos_private.missions;
  with recent as (
    select m.id, m.status, m.updated_at,
      (select count(*) from vaos_private.work_packages w where w.mission_id=m.id)::integer as work_total,
      (select count(*) from vaos_private.work_packages w where w.mission_id=m.id and w.status='COMPLETED')::integer as work_completed,
      (select count(*) from vaos_private.work_packages w where w.mission_id=m.id and w.status in ('BLOCKED','FAILED'))::integer as work_blocked,
      (select count(*) from vaos_private.agent_handoffs h where h.mission_id=m.id and h.status not in ('COMPLETED','CANCELLED'))::integer as handoffs_unfinished,
      (select count(*) from vaos_private.agent_handoffs h where h.mission_id=m.id and h.status='SUBMITTED')::integer as handoffs_awaiting_review,
      (select count(*) from vaos_private.agent_handoffs h where h.mission_id=m.id and h.status in ('FAILED','RETURNED','ESCALATED'))::integer as handoffs_failed
    from vaos_private.missions m
    order by m.updated_at desc,m.id desc
    limit 10
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,
    'status',status,
    'workPackages',work_total,
    'completedWorkPackages',work_completed,
    'blockedWorkPackages',work_blocked,
    'unfinishedHandoffs',handoffs_unfinished,
    'awaitingReview',handoffs_awaiting_review,
    'failedHandoffs',handoffs_failed,
    'latestUpdate',updated_at
  ) order by updated_at desc,id desc),'[]'::jsonb)
  into v_rows from recent;

  -- A real latest departmental result requires a completed handoff and an
  -- independently reviewed immutable evidence reference; completion of one
  -- handoff must never be equated with closure of its entire mission.
  select jsonb_build_object(
    'missionId',h.mission_id,
    'actionType',h.requested_job,
    'ownerAgentId',h.to_agent_id,
    'evidenceId',e.evidence_id,
    'verifiedAt',h.verified_at
  ) into v_latest
  from vaos_private.agent_handoffs h
  join vaos_private.work_packages w on w.id=h.work_package_id
    and w.mission_id=h.mission_id and w.status='COMPLETED'
  join vaos_private.handoff_work_evidence e on e.handoff_id=h.id
    and ('REVIEWED:' || e.evidence_id)=any(h.evidence_refs)
  where h.status='COMPLETED'
    and h.verified_by_agent_id is not null
    and h.verified_by_agent_id<>h.to_agent_id
    and h.verified_at is not null
  order by h.verified_at desc,h.id desc
  limit 1;

  return jsonb_build_object(
    'schemaVersion','VAOS_FOUNDER_MISSION_SUMMARY_V1',
    'sourceAuthority','vaos_founder_mission_answer_summary',
    'sourceWindow','LATEST_10_MISSIONS',
    'totalMissions',v_total,
    'missions',v_rows,
    'latestVerifiedWork',v_latest
  );
end;
$fn$;
revoke all on function public.vaos_founder_mission_answer_summary(text)
  from public,anon,authenticated;
grant execute on function public.vaos_founder_mission_answer_summary(text)
  to service_role;
