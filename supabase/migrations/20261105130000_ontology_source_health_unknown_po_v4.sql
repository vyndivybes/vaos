-- v4: absent or drifted PO evidence is unknown, never an observed zero.
-- Preserve all prior receipts; aggregate only coherent, signed-source projections.
-- v3: show only aggregate cancelled-origin draft counts in the founder source health.
-- Never promote a signed extract into procurement, finance, or JARVIS authority.
-- Additive replacement of the read-only v1 RPC; all prior migrations are unchanged.
-- Additive upgrade for already-installed Ontology health v1 RPC.
-- Keep SOURCE_UNVERIFIED non-authoritative; projected objects must match the active receipt.
-- Read-only Ontology lineage health over existing private source receipts.
-- A recent extraction is NOT a verified source revision or source-change watermark.
create or replace function public.vaos_ontology_source_health_v1(p_server_key text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  perform vaos_private.assert_server_key(p_server_key);
  select pg_catalog.jsonb_build_object(
    'status','HOLD',
    'readOnly',true,'sourceCompletenessVerified',false,
    'agentUsable',false,'actionAuthorized',false,'productionWriteAuthorized',false,
    'sources',pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'sourceKind',types.kind,
      'objectType',types.object_type,
      'status',case
        when w.source_kind is null or w.last_extracted_at > now()
          or w.last_extracted_at < now() - pg_catalog.make_interval(secs => types.slo_seconds)
          then 'HOLD'
        when w.observed_count is distinct from projections.current_count
          or projections.visible_count is distinct from projections.current_count
          then 'HOLD'
        else 'SOURCE_UNVERIFIED' end,
      'reason',case when w.source_kind is null then 'NO_SIGNED_RECEIPT'
        when w.last_extracted_at > now() then 'RECEIPT_CLOCK_AHEAD'
        when w.last_extracted_at < now() - pg_catalog.make_interval(secs => types.slo_seconds)
          then 'EXTRACTION_OVERDUE'
        when w.observed_count is distinct from projections.current_count
          or projections.visible_count is distinct from projections.current_count
          then 'PROJECTION_DRIFT'
        else 'SOURCE_REVISION_UNVERIFIED' end,
      'observedCount',w.observed_count,
      'projectionCount',projections.visible_count,
      'lastExtractedAt',case when w.last_extracted_at is null then null
        else pg_catalog.to_char(w.last_extracted_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
      'receiptAgeSeconds',case when w.last_extracted_at is null then null
        else GREATEST(0,pg_catalog.floor(
          EXTRACT(EPOCH FROM now()-w.last_extracted_at)))::bigint end,
      'sloSeconds',types.slo_seconds
    ) || case when types.kind='purchaseOrders'
      and w.source_kind is not null
      and w.observed_count = projections.current_count
      and projections.visible_count = projections.current_count then
      pg_catalog.jsonb_build_object(
        'cancelledOriginDraftCount',projections.cancelled_origin_drafts,
        'otherObservedOrderCount',projections.current_count-projections.cancelled_origin_drafts)
      else '{}'::jsonb end order by types.ordinal)
  ) into result
  from (values
     (1,'inventory','InventoryItem',900),
     (2,'shortages','Shortage',900),
     (3,'purchaseOrders','PurchaseOrder',3600)
  ) types(ordinal,kind,object_type,slo_seconds)
  left join vaos_private.ontology_source_watermarks w on w.source_kind=types.kind
  left join lateral (
    select count(*) filter (where p.present_in_latest_receipt)::integer as visible_count,
      count(*) filter (where p.present_in_latest_receipt
        and p.receipt_id=w.receipt_id)::integer as current_count,
      count(*) filter (where p.present_in_latest_receipt
        and p.receipt_id=w.receipt_id
        and p.properties->>'status'='draft'
        and p.properties->>'demand_lineage_state'='CANCELLED_UPSTREAM_DEMAND')::integer
        as cancelled_origin_drafts
    from vaos_private.ontology_projection_objects p
    where p.source_kind=types.kind
  ) projections on true;
  return result;
end;
$$;

revoke all on function public.vaos_ontology_source_health_v1(text) from public,anon,authenticated;
grant execute on function public.vaos_ontology_source_health_v1(text) to service_role;
comment on function public.vaos_ontology_source_health_v1(text) is
  'Read-only source evidence metadata, not a certified live Ontology or a grant to agents.';
