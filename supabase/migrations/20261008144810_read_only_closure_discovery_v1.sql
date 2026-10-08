-- Recover missions whose final safe read-only handoff was verified by
-- authenticated manual RUN_SAFE before Cron attempted closure preparation.
-- This changes discovery only; the existing independently verified,
-- immutable-evidence closure RPC remains the sole authority for readiness.
-- Never discover completed effectful, human-approved or unsupported work.
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
                'RELEASE.CHECK_OPEN_ITEMS','RISK.IDENTIFY'
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
                      'RELEASE.CHECK_OPEN_ITEMS','RISK.IDENTIFY'
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



revoke all on function public.vaos_list_runnable_missions(text,integer)
  from public, anon, authenticated;
grant execute on function public.vaos_list_runnable_missions(text,integer)
  to service_role;
