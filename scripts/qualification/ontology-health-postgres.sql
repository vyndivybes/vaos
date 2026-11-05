-- This is intentionally independent of the live VAOS database.
\i supabase/migrations/20261105060000_ontology_receipt_persistence_v1.sql
\i supabase/migrations/20261105083000_ontology_source_health_v1.sql

do $$
declare r jsonb;
begin
 r:=public.vaos_ontology_source_health_v1('test-only-server-key');
 if r->>'status'<>'HOLD' or jsonb_array_length(r->'sources')<>3 then raise exception 'ONTOLOGY_HEALTH_NOT_HOLD: %',r; end if;
 if r->'sources'->0->>'reason'<>'NO_SIGNED_RECEIPT' or r->'sources'->0->>'observedCount' is not null then raise exception 'FABRICATED_ZERO_STOCK: %',r; end if;
 if has_function_privilege('anon','public.vaos_ontology_source_health_v1(text)','EXECUTE') or has_function_privilege('authenticated','public.vaos_ontology_source_health_v1(text)','EXECUTE') then raise exception 'ONTOLOGY_HEALTH_RPC_LEAK'; end if;
 begin
  perform public.vaos_ontology_source_health_v1('invalid-key');
  raise exception 'BAD_SERVER_KEY_ACCEPTED';
 exception when sqlstate 'P0001' then
  if SQLERRM='BAD_SERVER_KEY_ACCEPTED' then raise; end if;
 end;
 raise notice 'Ontology source health and access acceptance PASS';
end $$;
