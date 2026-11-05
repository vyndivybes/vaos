-- This is intentionally independent of the live VAOS database.
\i scripts/qualification/ontology-receipt-postgres.sql
\i supabase/migrations/20261105083000_ontology_source_health_v1.sql
\i supabase/migrations/20261105100000_ontology_source_health_projection_drift_v2.sql

do $$
declare r jsonb;
begin
 r:=public.vaos_ontology_source_health_v1('test-only-server-key');
 if r->>'status'<>'HOLD' or jsonb_array_length(r->'sources')<>3 then raise exception 'ONTOLOGY_HEALTH_NOT_HOLD: %',r; end if;
 if r->'sources'->1->>'reason'<>'NO_SIGNED_RECEIPT' or r->'sources'->1->>'observedCount' is not null then raise exception 'FABRICATED_ZERO_STOCK: %',r; end if;
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
