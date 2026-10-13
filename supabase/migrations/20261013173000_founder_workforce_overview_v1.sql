-- Founder-only read projection. Reuses governed mission, handoff and activity ledgers.
-- NO new tables, cron, grants to browser roles, approvals, or production mutation permissions.
create or replace function public.vaos_founder_workforce_overview(
  p_server_key text, p_actor_email text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_payload jsonb;
begin
  perform vaos_private.assert_server_key(p_server_key);
  if lower(trim(coalesce(p_actor_email,''))) <> 'shyamsundhar1982@gmail.com' then
    raise exception 'FOUNDER_ONLY';
  end if;
  select jsonb_build_object(
    'schemaVersion','VAOS_WORKFORCE_OVERVIEW_V1',
    'observedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'readOnly',true,
    'employees',coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,'name',e.name,'role',e.role,'department',e.department,
      'lifecycle',e.status,'qualificationLevel',e.qualification_level,
      'activitySignal',coalesce(am.observation,'NOT_OBSERVED'),
      'monitorCheckedAt',am.checked_at,
      'lastVerifiedActivityAt',e.heartbeat_at,
      'currentAssignment',e.current_assignment,
      'work',(
        select jsonb_build_object(
          'planned',count(*) filter (where w.status='PLANNED'),
          'ready',count(*) filter (where w.status='READY'),
          'inProgress',count(*) filter (where w.status='IN_PROGRESS'),
          'completed',count(*) filter (where w.status='COMPLETED'),
          'blocked',count(*) filter (where w.status='BLOCKED'),
          'failed',count(*) filter (where w.status='FAILED'),
          'cancelled',count(*) filter (where w.status='CANCELLED'),
          'total',count(*)
        )
        from vaos_private.work_packages w where w.owner_agent_id=e.id
          and w.mission_id not like 'VAOS-QUAL-%'
      ),
      'trainingWork',(
        select jsonb_build_object(
          'total',count(*),
          'completed',count(*) filter (where w.status='COMPLETED'),
          'inProgress',count(*) filter (where w.status='IN_PROGRESS'),
          'blocked',count(*) filter (where w.status='BLOCKED')
        ) from vaos_private.work_packages w
        where w.owner_agent_id=e.id and w.mission_id like 'VAOS-QUAL-%'
      ),
      'workItems',coalesce((
        select jsonb_agg(to_jsonb(recent) order by recent."updatedAt" desc, recent.id)
        from (
          select w.id,w.mission_id as "missionId",w.action_type as "actionType",
            w.status,w.created_at as "createdAt",w.updated_at as "updatedAt"
          from vaos_private.work_packages w
          where w.owner_agent_id=e.id
          order by w.updated_at desc,w.id
          limit 50
        ) recent
      ),'[]'::jsonb),
      'verifiedClosures',coalesce((
        select jsonb_agg(jsonb_build_object(
          'workPackageId',proof.work_package_id,'verifiedAt',proof.verified_at
        ) order by proof.verified_at desc)
        from (
          select h.work_package_id,max(h.verified_at) as verified_at
          from vaos_private.agent_handoffs h
          where h.to_agent_id=e.id and h.status='COMPLETED'
            and h.mission_id not like 'VAOS-QUAL-%'
            and h.verified_at is not null
            and h.verified_at <= now()
            and h.verified_at >= now()-interval '90 days'
            and h.verified_by_agent_id is not null
            and h.verified_by_agent_id <> h.to_agent_id
            and exists (
              select 1 from vaos_private.handoff_work_evidence v
              where v.handoff_id=h.id
                and v.author_agent_id=h.to_agent_id
                and v.action_type=h.requested_job
                and v.report_sha256 is not null
                and v.created_at<=h.verified_at
            )
          group by h.work_package_id
          order by max(h.verified_at) desc
          limit 201 -- excess history fails schema bounds; never truncate silently
        ) proof
      ),'[]'::jsonb)
    ) order by e.id),'[]'::jsonb)
  ) into v_payload
  from vaos_private.digital_employees e
  left join vaos_private.digital_employee_activity_monitor am on am.employee_id=e.id;
  return v_payload;
end;
$$;
revoke all on function public.vaos_founder_workforce_overview(text,text)
 from public,anon,authenticated,service_role;
grant execute on function public.vaos_founder_workforce_overview(text,text) to service_role;
