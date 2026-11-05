-- Isolated PostgreSQL qualification; never run this in live VAOS.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema if not exists vaos_private;
create or replace function vaos_private.assert_server_key(p_key text)
returns void language plpgsql as $$
begin
 if p_key is distinct from 'test-only-server-key' then raise exception 'BAD_SERVER_KEY'; end if;
end;
$$;
\i supabase/migrations/20261105060000_ontology_receipt_persistence_v1.sql

do $$
declare
 r jsonb;
 input jsonb;
 at_time text;
 previous text;
begin
 at_time:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 input:=jsonb_build_object(
  'schemaVersion','VYNDI_ONTOLOGY_READ_RECEIPT_V1',
  'sourceKind','inventory','sourceScope','vyndi_inventory_balance:all',
  'sourceRevision',repeat('a',64),'sourceRevisionAuthority','CONTENT_DIGEST_ONLY',
  'sourceCompletenessVerified',false,'asOf',at_time,
  'asOfAuthority','EXTRACT_TIME_NOT_SOURCE_CHANGE_TIME',
  'complete',true,'hasMore',false,'readOnly',true,
  'actionAuthorized',false,'productionWriteAuthorized',false,
  'sourceCount',1,'records',jsonb_build_array(jsonb_build_object('sku','F-1','unit','ea','quantity_balance',3))
 );
 begin
  perform public.vaos_ontology_ingest_read_receipt_v1('wrong-server-key',input);
  raise exception 'INVALID_CREDENTIAL_ACCEPTED';
 exception when sqlstate 'P0001' then
  if SQLERRM='INVALID_CREDENTIAL_ACCEPTED' then raise; end if;
 end;
 r:=public.vaos_ontology_ingest_read_receipt_v1('test-only-server-key',input);
 if r->>'status'<>'SOURCE_UNVERIFIED' or r->>'agentUsable'<>'false' or
    r->>'durableReceiptStored'<>'true' or r->>'productionWriteAuthorized'<>'false'
 then raise exception 'VALID_RECEIPT_NOT_HELD: %',r; end if;
 if (select count(*) from vaos_private.ontology_source_receipts)<>1
    or (select count(*) from vaos_private.ontology_projection_objects where present_in_latest_receipt)<>1
 then raise exception 'RECEIPT_OR_OBJECT_NOT_DURABLE'; end if;
 r:=public.vaos_ontology_ingest_read_receipt_v1('test-only-server-key',input);
 if r->>'status'<>'SOURCE_UNVERIFIED' or r->>'replay'<>'true' or
    (select count(*) from vaos_private.ontology_source_receipts)<>1
 then raise exception 'EXACT_REPLAY_NOT_IDEMPOTENT'; end if;

 r:=public.vaos_ontology_ingest_read_receipt_v1('test-only-server-key',
    input || jsonb_build_object('sourceRevision',repeat('b',64)));
 if r->>'status'<>'HOLD' or r->>'reason'<>'OUT_OF_ORDER_OR_CONFLICTING_RECEIPT'
 then raise exception 'CONFLICTING_SNAPSHOT_ACCEPTED: %',r; end if;
 r:=public.vaos_ontology_ingest_read_receipt_v1('test-only-server-key',
    input || jsonb_build_object('asOf',
     to_char(clock_timestamp() at time zone 'UTC'-interval '1 day',
       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
 if r->>'status'<>'HOLD' then raise exception 'OUT_OF_ORDER_ACCEPTED'; end if;
 r:=public.vaos_ontology_ingest_read_receipt_v1('test-only-server-key',
    input - 'schemaVersion');
 if r->>'status'<>'HOLD' then raise exception 'MISSING_SCHEMA_ACCEPTED'; end if;
 r:=public.vaos_ontology_ingest_read_receipt_v1('test-only-server-key',
    input || jsonb_build_object('sourceCompletenessVerified',true));
 if r->>'status'<>'HOLD' then raise exception 'SELF_CERTIFICATION_ACCEPTED'; end if;
 r:=public.vaos_ontology_ingest_read_receipt_v1('test-only-server-key',
    input || jsonb_build_object('sourceCount',2,'complete',false,'hasMore',true));
 if r->>'status'<>'HOLD' then raise exception 'PARTIAL_PAGE_ACCEPTED'; end if;
 r:=public.vaos_ontology_ingest_read_receipt_v1('test-only-server-key',
    input || jsonb_build_object('records',jsonb_build_array(jsonb_build_object('unit','ea'))));
 if r->>'status'<>'HOLD' then raise exception 'MISSING_ID_ACCEPTED'; end if;
 if (select count(*) from vaos_private.ontology_source_receipts)<>1
 then raise exception 'REJECTED_RECEIPT_LEFT_PARTIAL_WRITE'; end if;

 -- A newer zero-row read hides old objects; the historical evidence stays append-only.
 previous:=to_char((clock_timestamp()+interval '2 seconds') at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 r:=public.vaos_ontology_ingest_read_receipt_v1('test-only-server-key',
    input || jsonb_build_object('asOf',previous,'sourceRevision',repeat('c',64),
        'sourceCount',0,'records','[]'::jsonb));
 if r->>'status'<>'SOURCE_UNVERIFIED' then raise exception 'NEWER_EMPTY_PAGE_NOT_ACCEPTED: %',r; end if;
 if (select count(*) from vaos_private.ontology_source_receipts)<>2
    or (select count(*) from vaos_private.ontology_projection_objects where present_in_latest_receipt)<>0
    or (select count(*) from vaos_private.ontology_projection_objects)<>1
 then raise exception 'HISTORICAL_OBJECT_OR_TOMBSTONE_INVALID'; end if;
 if has_function_privilege('anon',
    'public.vaos_ontology_ingest_read_receipt_v1(text,jsonb)','EXECUTE') or
    has_function_privilege('authenticated',
    'public.vaos_ontology_ingest_read_receipt_v1(text,jsonb)','EXECUTE')
 then raise exception 'CLIENT_RPC_PERMISSION_LEAK'; end if;
 raise notice 'P0.1 durable receipt PostgreSQL acceptance PASS';
end;
$$;
