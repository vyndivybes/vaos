-- G4 departmental read execution (Step 3); no new tables, role bypass, or effectful jobs.
-- Preserve the server-key-gated mission evidence RPC and separate verifier.
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
     or (
       (v_work.action_type in ('COMMERCIAL.OBSERVE_PIPELINE','PROCUREMENT.OBSERVE_SHORTAGE','INVENTORY.OBSERVE_STOCK','PRODUCTION.OBSERVE_WIP','MAINTENANCE.OBSERVE_ASSET','FINANCE.OBSERVE_LEDGER','PEOPLE.OBSERVE_WORKFORCE','ENGINEERING.OBSERVE_CONFIGURATION')
        and (v_work.authority <> 5 or v_work.execution_mode <> 'ANALYSE'))
       or (v_work.action_type not in ('COMMERCIAL.OBSERVE_PIPELINE','PROCUREMENT.OBSERVE_SHORTAGE','INVENTORY.OBSERVE_STOCK','PRODUCTION.OBSERVE_WIP','MAINTENANCE.OBSERVE_ASSET','FINANCE.OBSERVE_LEDGER','PEOPLE.OBSERVE_WORKFORCE','ENGINEERING.OBSERVE_CONFIGURATION') and v_work.authority > 2)
     )
     or v_work.execution_mode = 'GOVERNED_EXECUTION'
     or v_work.action_type not in (
       'PROJECT.TRACK_DEPENDENCY','KNOWLEDGE.DETECT_GAP','RELEASE.CHECK_OPEN_ITEMS','RISK.IDENTIFY','PROJECT.DETECT_DELAY','ORCHESTRATOR.INTAKE_MISSION',
                      'ORCHESTRATOR.MONITOR_MISSION','ORCHESTRATOR.CONSOLIDATE_RESULT',
       'ENGINEERING.ASSESS_REQUIREMENT','QA.AUDIT_EVIDENCE','SECURITY.ASSESS_ACCESS','COMMERCIAL.OBSERVE_PIPELINE','PROCUREMENT.OBSERVE_SHORTAGE','INVENTORY.OBSERVE_STOCK','PRODUCTION.OBSERVE_WIP','MAINTENANCE.OBSERVE_ASSET','FINANCE.OBSERVE_LEDGER','PEOPLE.OBSERVE_WORKFORCE','ENGINEERING.OBSERVE_CONFIGURATION'
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


  -- A high numeric catalog authority never grants a write: the eight
  -- named actions are independently gated signed VYNDI READ contracts.
  if v_work.action_type in ('COMMERCIAL.OBSERVE_PIPELINE','PROCUREMENT.OBSERVE_SHORTAGE','INVENTORY.OBSERVE_STOCK','PRODUCTION.OBSERVE_WIP','MAINTENANCE.OBSERVE_ASSET','FINANCE.OBSERVE_LEDGER','PEOPLE.OBSERVE_WORKFORCE','ENGINEERING.OBSERVE_CONFIGURATION') then
    if p_report->>'scope' <> 'BOUNDED_VYNDI_READ_RECEIPT_ONLY'
       or p_report->>'sourceSystem' <> 'VYNDI_OS'
       or p_report->>'sourceAuthority' <> case v_work.action_type
       when 'COMMERCIAL.OBSERVE_PIPELINE' then 'listSalesOrders'
       when 'PROCUREMENT.OBSERVE_SHORTAGE' then 'getConfiguredDemandShortages'
       when 'INVENTORY.OBSERVE_STOCK' then 'getAuthoritativeInventory'
       when 'PRODUCTION.OBSERVE_WIP' then 'getProductionJobCards'
       when 'MAINTENANCE.OBSERVE_ASSET' then 'getAssetMaintenanceState'
       when 'FINANCE.OBSERVE_LEDGER' then 'getAccountingWorkbench'
       when 'PEOPLE.OBSERVE_WORKFORCE' then 'listPeopleOfficeAuthority'
       when 'ENGINEERING.OBSERVE_CONFIGURATION' then 'getEngineeringChangeControlState'
       end
       or p_report->>'businessEffectsExecuted' <> 'false'
       or p_report->>'engineeringReleaseGranted' <> 'false'
       or p_report->>'sourceRevisionVerified' <> 'false'
       or p_report->>'sourceCompletenessVerified' <> 'false'
       or jsonb_typeof(p_report->'recordsObserved') <> 'number'
       or (p_report->>'recordsObserved') !~ '^[0-9]{1,3}
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

       or (p_report->>'recordsObserved')::integer not between 0 and 100
       or p_report->>'requestNonce' !~ '^[a-f0-9]{32}
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

       or p_report->>'requestBodySha256' !~ '^[a-f0-9]{64}
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

       or p_report->>'gatewayReceivedAt' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z
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

       or jsonb_array_length(p_report->'findings') <> 1
       or p_report->'findings'->>0 <> 'BOUNDED_SELECTED_RECORDS:' || (p_report->>'recordsObserved')
       or (p_report - array[
         'schemaVersion','kind','actionType','workPackageId','scope','findings',
         'sourceSystem','sourceAuthority','recordsObserved','gatewayReceivedAt',
         'requestNonce','requestBodySha256','sourceRevisionVerified',
         'sourceCompletenessVerified','businessEffectsExecuted','engineeringReleaseGranted'
       ]) <> '{}'::jsonb then
      raise exception 'HANDOFF_EVIDENCE_REPORT_INVALID';
    end if;
  elsif v_work.action_type in ('ENGINEERING.ASSESS_REQUIREMENT','QA.AUDIT_EVIDENCE','SECURITY.ASSESS_ACCESS') then
    if p_report->>'scope' <> 'PERSISTED_MISSION_RECORDS_ONLY'
      or p_report->>'businessEffectsExecuted' <> 'false'
      or p_report->>'engineeringReleaseGranted' <> 'false' then
      raise exception 'HANDOFF_EVIDENCE_REPORT_INVALID';
    end if;
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
                'RELEASE.CHECK_OPEN_ITEMS','RISK.IDENTIFY','PROJECT.DETECT_DELAY','ORCHESTRATOR.INTAKE_MISSION',
                      'ORCHESTRATOR.MONITOR_MISSION','ORCHESTRATOR.CONSOLIDATE_RESULT',
                      'ENGINEERING.ASSESS_REQUIREMENT','QA.AUDIT_EVIDENCE','SECURITY.ASSESS_ACCESS','COMMERCIAL.OBSERVE_PIPELINE','PROCUREMENT.OBSERVE_SHORTAGE','INVENTORY.OBSERVE_STOCK','PRODUCTION.OBSERVE_WIP','MAINTENANCE.OBSERVE_ASSET','FINANCE.OBSERVE_LEDGER','PEOPLE.OBSERVE_WORKFORCE','ENGINEERING.OBSERVE_CONFIGURATION'
              )
              and wp.human_approval_required=false
              and (
                wp.authority<=2
                or (wp.action_type in ('COMMERCIAL.OBSERVE_PIPELINE','PROCUREMENT.OBSERVE_SHORTAGE','INVENTORY.OBSERVE_STOCK','PRODUCTION.OBSERVE_WIP','MAINTENANCE.OBSERVE_ASSET','FINANCE.OBSERVE_LEDGER','PEOPLE.OBSERVE_WORKFORCE','ENGINEERING.OBSERVE_CONFIGURATION')
                    and wp.authority=5 and wp.execution_mode='ANALYSE')
              )
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
                      'RELEASE.CHECK_OPEN_ITEMS','RISK.IDENTIFY','PROJECT.DETECT_DELAY','ORCHESTRATOR.INTAKE_MISSION',
                      'ORCHESTRATOR.MONITOR_MISSION','ORCHESTRATOR.CONSOLIDATE_RESULT',
                      'ENGINEERING.ASSESS_REQUIREMENT','QA.AUDIT_EVIDENCE','SECURITY.ASSESS_ACCESS','COMMERCIAL.OBSERVE_PIPELINE','PROCUREMENT.OBSERVE_SHORTAGE','INVENTORY.OBSERVE_STOCK','PRODUCTION.OBSERVE_WIP','MAINTENANCE.OBSERVE_ASSET','FINANCE.OBSERVE_LEDGER','PEOPLE.OBSERVE_WORKFORCE','ENGINEERING.OBSERVE_CONFIGURATION'
                    )
                    or remaining.human_approval_required=true
                    or (remaining.authority>2
                        and not (remaining.action_type in ('COMMERCIAL.OBSERVE_PIPELINE','PROCUREMENT.OBSERVE_SHORTAGE','INVENTORY.OBSERVE_STOCK','PRODUCTION.OBSERVE_WIP','MAINTENANCE.OBSERVE_ASSET','FINANCE.OBSERVE_LEDGER','PEOPLE.OBSERVE_WORKFORCE','ENGINEERING.OBSERVE_CONFIGURATION')
                                 and remaining.authority=5 and remaining.execution_mode='ANALYSE'))
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

-- The existing actor trigger previously had ELSE 99 for operational employees.
-- Extend only the eight registered qualification floors, preserving maker/checker.
CREATE OR REPLACE FUNCTION vaos_private.assert_current_handoff_actor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    when 'commercial' then 2
    when 'procurement' then 3
    when 'inventory' then 3
    when 'production' then 3
    when 'maintenance' then 3
    when 'finance' then 4
    when 'people' then 3
    when 'engineering-configuration' then 4
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
$function$
;

revoke all on function public.vaos_record_handoff_work_evidence(text,text,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.vaos_record_handoff_work_evidence(text,text,integer,text,jsonb) to service_role;
revoke all on function public.vaos_list_runnable_missions(text,integer) from public,anon,authenticated;
grant execute on function public.vaos_list_runnable_missions(text,integer) to service_role;
