-- This is intentionally independent of the live VAOS database.
\i scripts/qualification/ontology-receipt-postgres.sql
\i supabase/migrations/20261105083000_ontology_source_health_v1.sql
\i supabase/migrations/20261105100000_ontology_source_health_projection_drift_v2.sql
\i supabase/migrations/20261105123500_ontology_source_health_demand_lineage_v3.sql
\i supabase/migrations/20261105130000_ontology_source_health_unknown_po_v4.sql

do $$
declare r jsonb;
begin
 r:=public.vaos_ontology_source_health_v1('test-only-server-key');
 if r->>'status'<>'HOLD' or jsonb_array_length(r->'sources')<>3 then raise exception 'ONTOLOGY_HEALTH_NOT_HOLD: %',r; end if;
 if r->'sources'->1->>'reason'<>'NO_SIGNED_RECEIPT' or r->'sources'->1->>'observedCount' is not null then raise exception 'FABRICATED_ZERO_STOCK: %',r; end if;
 if r->'sources'->2 ? 'cancelledOriginDraftCount'
    or r->'sources'->2 ? 'otherObservedOrderCount'
 then raise exception 'UNKNOWN_PO_EVIDENCE_FABRICATED_ZERO: %',r->'sources'->2; end if;
 if has_function_privilege('anon','public.vaos_ontology_source_health_v1(text)','EXECUTE') or has_function_privilege('authenticated','public.vaos_ontology_source_health_v1(text)','EXECUTE') then raise exception 'ONTOLOGY_HEALTH_RPC_LEAK'; end if;
 begin
  perform public.vaos_ontology_source_health_v1('invalid-key');
  raise exception 'BAD_SERVER_KEY_ACCEPTED';
 exception when sqlstate 'P0001' then
  if SQLERRM='BAD_SERVER_KEY_ACCEPTED' then raise; end if;
 end;
 raise notice 'Ontology source health and access acceptance PASS';
end $$;

-- Synthetic drift acceptance; isolated test transaction only. No live records.
begin;
update vaos_private.ontology_source_watermarks
 set last_extracted_at=now()-interval '30 seconds'
 where source_kind='inventory';

do $$
declare
 r jsonb;
 source jsonb;
begin
 r:=public.vaos_ontology_source_health_v1('test-only-server-key');
 source:=r->'sources'->0;
 if source->>'status'<>'SOURCE_UNVERIFIED'
    or source->>'reason'<>'SOURCE_REVISION_UNVERIFIED'
    or source->>'projectionCount'<>'0'
 then raise exception 'CONSISTENT_ZERO_PROJECTION_NOT_RECOGNIZED: %',source; end if;

 -- A recent source receipt cannot mask missing materialized objects.
 update vaos_private.ontology_source_watermarks
    set observed_count=1 where source_kind='inventory';
 r:=public.vaos_ontology_source_health_v1('test-only-server-key');
 source:=r->'sources'->0;
 if source->>'status'<>'HOLD' or source->>'reason'<>'PROJECTION_DRIFT'
 then raise exception 'MISSING_PROJECTION_NOT_HELD: %',source; end if;

 -- An extra visible object is also drift, not an authoritative snapshot.
 update vaos_private.ontology_source_watermarks
    set observed_count=0 where source_kind='inventory';
 update vaos_private.ontology_projection_objects
    set present_in_latest_receipt=true where source_kind='inventory';
 r:=public.vaos_ontology_source_health_v1('test-only-server-key');
 source:=r->'sources'->0;
 if source->>'status'<>'HOLD' or source->>'reason'<>'PROJECTION_DRIFT'
 then raise exception 'EXTRA_PROJECTION_NOT_HELD: %',source; end if;

 -- Equal row counts are insufficient if the object belongs to an old receipt.
 update vaos_private.ontology_source_watermarks
    set observed_count=1 where source_kind='inventory';
 r:=public.vaos_ontology_source_health_v1('test-only-server-key');
 source:=r->'sources'->0;
 if source->>'projectionCount'<>'1'
    or source->>'status'<>'HOLD' or source->>'reason'<>'PROJECTION_DRIFT'
 then raise exception 'STALE_RECEIPT_PROJECTION_NOT_HELD: %',source; end if;

 raise notice 'Ontology projection count and receipt-lineage drift acceptance PASS';
end $$;
rollback;

-- Synthetic PO rows only, rolled back. Cancelled draft lineage is visible as
-- aggregate metadata, never as a procurement commitment or business authority.
begin;
do $$
declare rid uuid;
        health jsonb;
        po jsonb;
begin
 insert into vaos_private.ontology_source_receipts
  (source_kind,source_scope,source_digest,extracted_at,source_count,records,status)
 values ('purchaseOrders','synthetic:source',repeat('b',64),now()-interval '20 seconds',2,
  '[{"id":"TEST-CANCELLED","status":"draft","demand_lineage_state":"CANCELLED_UPSTREAM_DEMAND"},{"id":"TEST-UNKNOWN","status":"draft","demand_lineage_state":"UPSTREAM_DEMAND_UNVERIFIED"}]'::jsonb,
  'SOURCE_UNVERIFIED')
 returning receipt_id into rid;
 insert into vaos_private.ontology_projection_objects
  (source_kind,object_type,object_id,properties,receipt_id,present_in_latest_receipt,authority_state)
 values
  ('purchaseOrders','PurchaseOrder','TEST-CANCELLED','{"id":"TEST-CANCELLED","status":"draft","demand_lineage_state":"CANCELLED_UPSTREAM_DEMAND"}',rid,true,'SOURCE_UNVERIFIED'),
  ('purchaseOrders','PurchaseOrder','TEST-UNKNOWN','{"id":"TEST-UNKNOWN","status":"draft","demand_lineage_state":"UPSTREAM_DEMAND_UNVERIFIED"}',rid,true,'SOURCE_UNVERIFIED');
 insert into vaos_private.ontology_source_watermarks
  (source_kind,receipt_id,last_extracted_at,last_source_digest,observed_count,status)
 values ('purchaseOrders',rid,now()-interval '20 seconds',repeat('b',64),2,'SOURCE_UNVERIFIED');
 health:=public.vaos_ontology_source_health_v1('test-only-server-key');
 po:=health->'sources'->2;
 if po->>'status'<>'SOURCE_UNVERIFIED'
    or po->>'cancelledOriginDraftCount'<>'1'
    or po->>'otherObservedOrderCount'<>'1'
    or health->>'agentUsable'<>'false'
    or health->>'productionWriteAuthorized'<>'false'
 then raise exception 'SOURCE_CANCELLED_DRAFT_SUMMARY_INCORRECT: %',po; end if;
 -- A corrupted PO projection cannot return apparently classified draft counts.
 update vaos_private.ontology_source_watermarks
    set observed_count=3 where source_kind='purchaseOrders';
 health:=public.vaos_ontology_source_health_v1('test-only-server-key');
 po:=health->'sources'->2;
 if po->>'status'<>'HOLD' or po->>'reason'<>'PROJECTION_DRIFT'
    or po ? 'cancelledOriginDraftCount' or po ? 'otherObservedOrderCount'
 then raise exception 'DRIFTED_PO_SUMMARY_FABRICATED: %',po; end if;
 raise notice 'Cancelled-origin draft aggregation, missing-receipt and drift HOLD PASS';
end $$;
rollback;
