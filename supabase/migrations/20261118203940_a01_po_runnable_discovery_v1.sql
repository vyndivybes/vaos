-- A01 scoped open-PO read-only discovery repair. No source authority promotion.
-- Baseline: pg_get_functiondef(public.vaos_list_runnable_missions) inspected 2026-11-18 UTC.
-- Existing deny-by-default RPC uses assert_server_key, service_role only and max eight.
-- PO remains excluded from independent-closure path until source-of-record attestation.
CREATE OR REPLACE FUNCTION public.vaos_list_runnable_missions(p_server_key text, p_limit integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
            -- A01-only active observation admission: signed/qualified PO read, never a purchase write.
            -- Existing active-work queue: only bounded, qualified read-only work.
            (
              h.status in ('PENDING','ACCEPTED','SUBMITTED')
              and (h.requested_job in (
                'PROJECT.TRACK_DEPENDENCY','KNOWLEDGE.DETECT_GAP',
                'RELEASE.CHECK_OPEN_ITEMS','RISK.IDENTIFY','PROJECT.DETECT_DELAY','ORCHESTRATOR.INTAKE_MISSION',
                      'ORCHESTRATOR.MONITOR_MISSION','ORCHESTRATOR.CONSOLIDATE_RESULT',
                'COMMERCIAL.OBSERVE_PIPELINE','PROCUREMENT.OBSERVE_SHORTAGE','INVENTORY.OBSERVE_STOCK','PRODUCTION.OBSERVE_WIP','MAINTENANCE.OBSERVE_ASSET','FINANCE.OBSERVE_LEDGER','PEOPLE.OBSERVE_WORKFORCE','ENGINEERING.OBSERVE_CONFIGURATION','ENGINEERING.ASSESS_REQUIREMENT','QA.AUDIT_EVIDENCE','SECURITY.ASSESS_ACCESS'
              ) or (m.id='JARVIS-A01-20261118'
                and h.requested_job='PROCUREMENT.OBSERVE_OPEN_POS'
                and h.to_agent_id='procurement'))
              and wp.human_approval_required=false
              and (wp.authority<=2 or (wp.action_type in ('COMMERCIAL.OBSERVE_PIPELINE','PROCUREMENT.OBSERVE_SHORTAGE','INVENTORY.OBSERVE_STOCK','PRODUCTION.OBSERVE_WIP','MAINTENANCE.OBSERVE_ASSET','FINANCE.OBSERVE_LEDGER','PEOPLE.OBSERVE_WORKFORCE','ENGINEERING.OBSERVE_CONFIGURATION') and wp.authority=5 and wp.execution_mode='ANALYSE')
                or (m.id='JARVIS-A01-20261118'
                  and h.requested_job='PROCUREMENT.OBSERVE_OPEN_POS'
                  and h.to_agent_id='procurement'
                  and wp.action_type='PROCUREMENT.OBSERVE_OPEN_POS'
                  and wp.authority=5 and wp.execution_mode='ANALYSE'))
              and wp.action_type=h.requested_job
              and d.status='ACTIVE'
              and d.qualification_level>=wp.minimum_qualification_level
            )
            or
            -- Independent-closure rule: unchanged, with PO not admitted for automatic closure.
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
                      'RELEASE.CHECK_OPEN_ITEMS','RISK.IDENTIFY','PROJECT.DETECT_DELAY','ORCHESTRATOR.INTAKE_MISSION',
                      'ORCHESTRATOR.MONITOR_MISSION','ORCHESTRATOR.CONSOLIDATE_RESULT',
                'COMMERCIAL.OBSERVE_PIPELINE','PROCUREMENT.OBSERVE_SHORTAGE','INVENTORY.OBSERVE_STOCK','PRODUCTION.OBSERVE_WIP','MAINTENANCE.OBSERVE_ASSET','FINANCE.OBSERVE_LEDGER','PEOPLE.OBSERVE_WORKFORCE','ENGINEERING.OBSERVE_CONFIGURATION','ENGINEERING.ASSESS_REQUIREMENT','QA.AUDIT_EVIDENCE','SECURITY.ASSESS_ACCESS'
                    )
                    or remaining.human_approval_required=true
                    or (remaining.authority>2 and not (remaining.action_type in ('COMMERCIAL.OBSERVE_PIPELINE','PROCUREMENT.OBSERVE_SHORTAGE','INVENTORY.OBSERVE_STOCK','PRODUCTION.OBSERVE_WIP','MAINTENANCE.OBSERVE_ASSET','FINANCE.OBSERVE_LEDGER','PEOPLE.OBSERVE_WORKFORCE','ENGINEERING.OBSERVE_CONFIGURATION') and remaining.authority=5 and remaining.execution_mode='ANALYSE'))
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
$function$;

revoke all on function public.vaos_list_runnable_missions(text,integer) from public, anon, authenticated;
grant execute on function public.vaos_list_runnable_missions(text,integer) to service_role;
