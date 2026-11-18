-- A01 scoped signed PO observation evidence admission. No source authority promotion or commercial write.
-- Exact live function from pg_get_functiondef, with only the A01-aware branch and authority fence added.
CREATE OR REPLACE FUNCTION public.vaos_record_handoff_work_evidence(p_server_key text, p_handoff_id text, p_expected_version integer, p_by_agent_id text, p_report jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_handoff vaos_private.agent_handoffs%rowtype;
  v_work vaos_private.work_packages%rowtype;
  v_agent vaos_private.digital_employees%rowtype;
  v_existing vaos_private.handoff_work_evidence%rowtype;
  v_hash text;
  v_a01_po boolean := false;
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
  -- A01-only read receipt, never generalized to procurement purchases or mission closure.
  v_a01_po := (
    v_handoff.mission_id='JARVIS-A01-20261118'
    and v_handoff.to_agent_id='procurement'
    and v_handoff.requested_job='PROCUREMENT.OBSERVE_OPEN_POS'
    and v_work.action_type='PROCUREMENT.OBSERVE_OPEN_POS'
    and v_work.authority=5
    and v_work.execution_mode='ANALYSE'
    and v_work.human_approval_required=false
  );
  if v_work.action_type <> v_handoff.requested_job
     or v_work.human_approval_required
     or ( (v_work.action_type in ('COMMERCIAL.OBSERVE_PIPELINE','PROCUREMENT.OBSERVE_SHORTAGE','INVENTORY.OBSERVE_STOCK','PRODUCTION.OBSERVE_WIP','MAINTENANCE.OBSERVE_ASSET','FINANCE.OBSERVE_LEDGER','PEOPLE.OBSERVE_WORKFORCE','ENGINEERING.OBSERVE_CONFIGURATION') and (v_work.authority <> 5 or v_work.execution_mode <> 'ANALYSE')) or (v_work.action_type not in ('COMMERCIAL.OBSERVE_PIPELINE','PROCUREMENT.OBSERVE_SHORTAGE','INVENTORY.OBSERVE_STOCK','PRODUCTION.OBSERVE_WIP','MAINTENANCE.OBSERVE_ASSET','FINANCE.OBSERVE_LEDGER','PEOPLE.OBSERVE_WORKFORCE','ENGINEERING.OBSERVE_CONFIGURATION') and v_work.authority > 2 and not v_a01_po) )
     or v_work.execution_mode = 'GOVERNED_EXECUTION'
     or v_work.action_type not in (
       'PROJECT.TRACK_DEPENDENCY','KNOWLEDGE.DETECT_GAP','RELEASE.CHECK_OPEN_ITEMS','RISK.IDENTIFY','PROJECT.DETECT_DELAY','ORCHESTRATOR.INTAKE_MISSION',
                      'ORCHESTRATOR.MONITOR_MISSION','ORCHESTRATOR.CONSOLIDATE_RESULT',
       'COMMERCIAL.OBSERVE_PIPELINE','PROCUREMENT.OBSERVE_SHORTAGE','INVENTORY.OBSERVE_STOCK','PRODUCTION.OBSERVE_WIP','MAINTENANCE.OBSERVE_ASSET','FINANCE.OBSERVE_LEDGER','PEOPLE.OBSERVE_WORKFORCE','ENGINEERING.OBSERVE_CONFIGURATION','ENGINEERING.ASSESS_REQUIREMENT','QA.AUDIT_EVIDENCE','SECURITY.ASSESS_ACCESS'
     ) and not v_a01_po then
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

  -- The signed read receipts are metadata only, not independently proven source revisions.
  if v_work.action_type in ('COMMERCIAL.OBSERVE_PIPELINE','PROCUREMENT.OBSERVE_SHORTAGE','INVENTORY.OBSERVE_STOCK','PRODUCTION.OBSERVE_WIP','MAINTENANCE.OBSERVE_ASSET','FINANCE.OBSERVE_LEDGER','PEOPLE.OBSERVE_WORKFORCE','ENGINEERING.OBSERVE_CONFIGURATION') or v_a01_po then
    if p_report->>'scope' <> 'BOUNDED_VYNDI_READ_RECEIPT_ONLY'
       or p_report->>'sourceSystem' <> 'VYNDI_OS'
       or p_report->>'businessEffectsExecuted' <> 'false'
       or p_report->>'engineeringReleaseGranted' <> 'false'
       or p_report->>'sourceRevisionVerified' <> 'false'
       or p_report->>'sourceCompletenessVerified' <> 'false'
       or jsonb_typeof(p_report->'recordsObserved') <> 'number'
       or (p_report->>'recordsObserved') !~ '^[0-9]{1,3}$'
       or (p_report->>'requestNonce') !~ '^[a-f0-9]{32}$'
       or (p_report->>'requestBodySha256') !~ '^[a-f0-9]{64}$'
       or (p_report->>'gatewayReceivedAt') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
       or jsonb_array_length(p_report->'findings') <> 1
       or (p_report->'findings'->>0) <> ('BOUNDED_SELECTED_RECORDS:' || (p_report->>'recordsObserved'))
       or (p_report - array[
         'schemaVersion','kind','actionType','workPackageId','scope','findings',
         'sourceSystem','sourceAuthority','recordsObserved','gatewayReceivedAt',
         'requestNonce','requestBodySha256','sourceRevisionVerified',
         'sourceCompletenessVerified','businessEffectsExecuted','engineeringReleaseGranted'
       ]) <> '{}'::jsonb then
      raise exception 'HANDOFF_EVIDENCE_REPORT_INVALID';
    end if;
    if v_work.action_type = 'COMMERCIAL.OBSERVE_PIPELINE' and p_report->>'sourceAuthority' <> 'listSalesOrders' then
      raise exception 'HANDOFF_EVIDENCE_REPORT_INVALID';
    end if;
    if v_work.action_type = 'PROCUREMENT.OBSERVE_SHORTAGE' and p_report->>'sourceAuthority' <> 'getConfiguredDemandShortages' then
      raise exception 'HANDOFF_EVIDENCE_REPORT_INVALID';
    end if;
    if v_work.action_type = 'INVENTORY.OBSERVE_STOCK' and p_report->>'sourceAuthority' <> 'getAuthoritativeInventory' then
      raise exception 'HANDOFF_EVIDENCE_REPORT_INVALID';
    end if;
    if v_work.action_type = 'PRODUCTION.OBSERVE_WIP' and p_report->>'sourceAuthority' <> 'getProductionJobCards' then
      raise exception 'HANDOFF_EVIDENCE_REPORT_INVALID';
    end if;
    if v_work.action_type = 'MAINTENANCE.OBSERVE_ASSET' and p_report->>'sourceAuthority' <> 'getAssetMaintenanceState' then
      raise exception 'HANDOFF_EVIDENCE_REPORT_INVALID';
    end if;
    if v_work.action_type = 'FINANCE.OBSERVE_LEDGER' and p_report->>'sourceAuthority' <> 'getAccountingWorkbench' then
      raise exception 'HANDOFF_EVIDENCE_REPORT_INVALID';
    end if;
    if v_work.action_type = 'PEOPLE.OBSERVE_WORKFORCE' and p_report->>'sourceAuthority' <> 'listPeopleOfficeAuthority' then
      raise exception 'HANDOFF_EVIDENCE_REPORT_INVALID';
    end if;
    if v_work.action_type = 'ENGINEERING.OBSERVE_CONFIGURATION' and p_report->>'sourceAuthority' <> 'getEngineeringChangeControlState' then
      raise exception 'HANDOFF_EVIDENCE_REPORT_INVALID';
    end if;
    if v_a01_po and p_report->>'sourceAuthority' <> 'listOpenPurchaseOrders' then
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
$function$;

revoke all on function public.vaos_record_handoff_work_evidence(text,text,integer,text,jsonb) from public, anon, authenticated;
grant execute on function public.vaos_record_handoff_work_evidence(text,text,integer,text,jsonb) to service_role;
