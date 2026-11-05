-- P0.1: private, append-only evidence of signed VYNDI source observations.
-- SOURCE_UNVERIFIED is intentionally never agent-usable. No ERP writes.
create table if not exists vaos_private.ontology_source_receipts (
  receipt_id uuid primary key default gen_random_uuid(),
  source_kind text not null check (source_kind in ('inventory','shortages','purchaseOrders')),
  source_scope text not null,
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  extracted_at timestamptz not null,
  source_count integer not null check (source_count between 0 and 100),
  records jsonb not null check (jsonb_typeof(records) = 'array' and jsonb_array_length(records) <= 100),
  status text not null default 'SOURCE_UNVERIFIED'
    check (status = 'SOURCE_UNVERIFIED'),
  received_at timestamptz not null default now(),
  unique (source_kind, source_digest, extracted_at)
);
alter table vaos_private.ontology_source_receipts enable row level security;
create index if not exists ontology_source_receipts_latest_idx
  on vaos_private.ontology_source_receipts(source_kind, received_at desc);

create table if not exists vaos_private.ontology_projection_objects (
  source_kind text not null check (source_kind in ('inventory','shortages','purchaseOrders')),
  object_type text not null check (object_type in ('InventoryItem','Shortage','PurchaseOrder')),
  object_id text not null check (length(object_id) between 1 and 300),
  properties jsonb not null check (jsonb_typeof(properties) = 'object'),
  receipt_id uuid not null references vaos_private.ontology_source_receipts(receipt_id),
  present_in_latest_receipt boolean not null default false,
  authority_state text not null default 'HOLD'
    check (authority_state in ('SOURCE_UNVERIFIED','HOLD')),
  updated_at timestamptz not null default now(),
  primary key(source_kind, object_id)
);
alter table vaos_private.ontology_projection_objects enable row level security;
create index if not exists ontology_projection_receipt_idx
  on vaos_private.ontology_projection_objects(receipt_id);

create table if not exists vaos_private.ontology_source_watermarks (
  source_kind text primary key check (source_kind in ('inventory','shortages','purchaseOrders')),
  receipt_id uuid not null references vaos_private.ontology_source_receipts(receipt_id),
  last_extracted_at timestamptz not null,
  last_source_digest text not null check (last_source_digest ~ '^[a-f0-9]{64}$'),
  observed_count integer not null check (observed_count between 0 and 100),
  status text not null default 'SOURCE_UNVERIFIED'
    check (status = 'SOURCE_UNVERIFIED'),
  updated_at timestamptz not null default now()
);
alter table vaos_private.ontology_source_watermarks enable row level security;

comment on table vaos_private.ontology_source_receipts is
  'Private append-only VYNDI read evidence. Content digest is NOT independently certified source revision.';
comment on table vaos_private.ontology_projection_objects is
  'Unverified VAOS object projection; observations cannot authorize business actions.';
comment on table vaos_private.ontology_source_watermarks is
  'Receipt processing watermark; extraction time is NOT CDC source-change watermark.';

create or replace function public.vaos_ontology_ingest_read_receipt_v1(
  p_server_key text, p_receipt jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_scope text;
  v_expected_scope text;
  v_digest text;
  v_count integer;
  v_as_of timestamptz;
  v_old_as_of timestamptz;
  v_old_digest text;
  v_receipt_id uuid;
  v_record jsonb;
  v_record_id text;
  v_object_type text;
  v_ids text[] := '{}'::text[];
begin
  perform vaos_private.assert_server_key(p_server_key);
  if p_receipt is null or jsonb_typeof(p_receipt) <> 'object' then
    return jsonb_build_object('status','HOLD','reason','RECEIPT_INVALID');
  end if;
  v_kind := p_receipt->>'sourceKind';
  v_expected_scope := case v_kind
    when 'inventory' then 'vyndi_inventory_balance:all'
    when 'shortages' then 'vyndi_live_job_card_requirements:released_in_progress_positive_shortage'
    when 'purchaseOrders' then 'vyndi_purchase_orders:open_status_v1'
    else null end;
  v_scope := p_receipt->>'sourceScope';
  v_digest := p_receipt->>'sourceRevision';
  if v_expected_scope is null or v_scope is distinct from v_expected_scope
     or coalesce(v_digest,'') !~ '^[a-f0-9]{64}$'
     or p_receipt->>'schemaVersion' is distinct from 'VYNDI_ONTOLOGY_READ_RECEIPT_V1'
     or p_receipt->>'sourceRevisionAuthority' is distinct from 'CONTENT_DIGEST_ONLY'
     or p_receipt->>'asOfAuthority' is distinct from 'EXTRACT_TIME_NOT_SOURCE_CHANGE_TIME'
     or p_receipt->'sourceCompletenessVerified' is distinct from 'false'::jsonb
     or p_receipt->'readOnly' is distinct from 'true'::jsonb
     or p_receipt->'actionAuthorized' is distinct from 'false'::jsonb
     or p_receipt->'productionWriteAuthorized' is distinct from 'false'::jsonb
     or p_receipt->'complete' is distinct from 'true'::jsonb
     or p_receipt->'hasMore' is distinct from 'false'::jsonb
     or jsonb_typeof(p_receipt->'records') is distinct from 'array'
     or coalesce(p_receipt->>'asOf','') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
     or coalesce(p_receipt->>'sourceCount','') !~ '^[0-9]{1,3}$'
  then
    return jsonb_build_object('status','HOLD','reason','SOURCE_RECEIPT_NOT_ADMISSIBLE');
  end if;
  v_count := (p_receipt->>'sourceCount')::integer;
  if v_count > 100 or v_count <> jsonb_array_length(p_receipt->'records') then
    return jsonb_build_object('status','HOLD','reason','PAGE_NOT_COMPLETE');
  end if;
  v_as_of := (p_receipt->>'asOf')::timestamptz;
  if v_as_of > now() + interval '5 minutes' then
    return jsonb_build_object('status','HOLD','reason','EXTRACTION_TIME_INVALID');
  end if;

  -- Check the entire page before the first write. A bad row cannot partially hydrate.
  v_object_type := case v_kind
    when 'inventory' then 'InventoryItem'
    when 'shortages' then 'Shortage'
    else 'PurchaseOrder' end;
  for v_record in select value from jsonb_array_elements(p_receipt->'records') loop
    if jsonb_typeof(v_record) <> 'object' then
      return jsonb_build_object('status','HOLD','reason','SOURCE_ROW_INVALID');
    end if;
    v_record_id := case v_kind
      when 'inventory' then
        case when nullif(v_record->>'sku','') is not null
                  and nullif(v_record->>'unit','') is not null
             then jsonb_build_array(v_record->>'sku',v_record->>'unit')::text else null end
      when 'shortages' then nullif(v_record->>'job_card_line_id','')
      else nullif(v_record->>'id','') end;
    if v_record_id is null or length(v_record_id) > 300
       or v_record_id = any(v_ids) then
      return jsonb_build_object('status','HOLD','reason','SOURCE_OBJECT_ID_INVALID');
    end if;
    v_ids := array_append(v_ids,v_record_id);
  end loop;

  -- Concurrent cycles for a source serialize, including duplicate and out-of-order reads.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('vaos-ontology:' || v_kind));
  select last_extracted_at,last_source_digest
    into v_old_as_of,v_old_digest
    from vaos_private.ontology_source_watermarks
    where source_kind=v_kind for update;
  if v_old_as_of > v_as_of or
     (v_old_as_of = v_as_of and v_old_digest is distinct from v_digest) then
    return jsonb_build_object('status','HOLD','reason','OUT_OF_ORDER_OR_CONFLICTING_RECEIPT');
  end if;
  if v_old_as_of = v_as_of and v_old_digest = v_digest then
    return jsonb_build_object('status','SOURCE_UNVERIFIED','replay',true,
      'receiptId',(select receipt_id from vaos_private.ontology_source_watermarks where source_kind=v_kind),
      'sourceKind',v_kind,'durableReceiptStored',true,
      'sourceCompletenessVerified',false,'agentUsable',false,
      'actionAuthorized',false,'productionWriteAuthorized',false);
  end if;

  insert into vaos_private.ontology_source_receipts
    (source_kind,source_scope,source_digest,extracted_at,source_count,records)
  values (v_kind,v_scope,v_digest,v_as_of,v_count,p_receipt->'records')
  returning receipt_id into v_receipt_id;

  -- Preserve old evidence, but never expose an omitted object as current.
  update vaos_private.ontology_projection_objects
     set present_in_latest_receipt=false,authority_state='HOLD',updated_at=now()
    where source_kind=v_kind;

  for v_record in select value from jsonb_array_elements(p_receipt->'records') loop
    v_record_id := case v_kind
      when 'inventory' then jsonb_build_array(v_record->>'sku',v_record->>'unit')::text
      when 'shortages' then v_record->>'job_card_line_id'
      else v_record->>'id' end;
    insert into vaos_private.ontology_projection_objects
      (source_kind,object_type,object_id,properties,receipt_id,present_in_latest_receipt,authority_state)
    values (v_kind,v_object_type,v_record_id,v_record,v_receipt_id,true,'SOURCE_UNVERIFIED')
    on conflict (source_kind,object_id) do update
      set object_type=excluded.object_type,properties=excluded.properties,
          receipt_id=excluded.receipt_id,present_in_latest_receipt=true,
          authority_state='SOURCE_UNVERIFIED',updated_at=now();
  end loop;

  insert into vaos_private.ontology_source_watermarks
    (source_kind,receipt_id,last_extracted_at,last_source_digest,observed_count,status)
  values (v_kind,v_receipt_id,v_as_of,v_digest,v_count,'SOURCE_UNVERIFIED')
  on conflict (source_kind) do update
    set receipt_id=excluded.receipt_id,last_extracted_at=excluded.last_extracted_at,
        last_source_digest=excluded.last_source_digest,observed_count=excluded.observed_count,
        status='SOURCE_UNVERIFIED',updated_at=now();

  return jsonb_build_object('status','SOURCE_UNVERIFIED','receiptId',v_receipt_id,
    'sourceKind',v_kind,'storedObjectCount',v_count,'durableReceiptStored',true,
    'sourceCompletenessVerified',false,'agentUsable',false,
    'actionAuthorized',false,'productionWriteAuthorized',false);
end;
$$;

revoke all on function public.vaos_ontology_ingest_read_receipt_v1(text,jsonb)
  from public, anon, authenticated;
grant execute on function public.vaos_ontology_ingest_read_receipt_v1(text,jsonb)
  to service_role;
