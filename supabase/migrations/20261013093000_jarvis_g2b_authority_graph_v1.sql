-- G2b: projection of existing governed durable links; NO new write path.
-- Only completed, intent-bound, lease-created links between existing VAOS
-- controlled domain records qualify. Legacy unleased links stay on HOLD.
-- This is authoritative provenance for a link creation, NOT proof of
-- underlying source record freshness, causation or cryptographic signature.
create or replace function public.vaos_jarvis_graph_snapshot(p_server_key text)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, extensions, pg_temp
as $$
declare
  v_graph jsonb;
begin
  perform vaos_private.assert_server_key(p_server_key);

  with eligible as materialized (
    select l.id,l.source_domain,l.source_record_id,l.relation_type,
           l.target_domain,l.target_record_id,l.created_at
    from vaos_private.digital_thread_links l
    join vaos_private.execution_jobs j
      on j.id=l.execution_job_id and j.intent_id=l.intent_id
    where l.intent_id is not null
      and l.execution_job_id is not null
      and j.status = 'SUCCEEDED'
      and j.action_type = 'DIGITAL_THREAD.CREATE_LINK'
      and (
        (l.source_domain='QA_CAPA' and exists(
          select 1 from vaos_private.capa_records c where c.id=l.source_record_id))
        or (l.source_domain='ENGINEERING_BASELINE' and exists(
          select 1 from vaos_private.engineering_baseline_changes e where e.id=l.source_record_id))
        or (l.source_domain='PROJECT_RISK' and exists(
          select 1 from vaos_private.project_risk_escalations r where r.id=l.source_record_id))
      )
      and (
        (l.target_domain='QA_CAPA' and exists(
          select 1 from vaos_private.capa_records c where c.id=l.target_record_id))
        or (l.target_domain='ENGINEERING_BASELINE' and exists(
          select 1 from vaos_private.engineering_baseline_changes e where e.id=l.target_record_id))
        or (l.target_domain='PROJECT_RISK' and exists(
          select 1 from vaos_private.project_risk_escalations r where r.id=l.target_record_id))
      )
    order by l.created_at desc,l.id desc
    limit 100
  )
  select jsonb_build_object(
    'schemaVersion','G2B_AUTHORITY_GRAPH_V1',
    'sourceSystem','VAOS_GOVERNED_DIGITAL_THREAD',
    'graphStorage','POSTGRES_EXISTING_GOVERNED_LINKS',
    'asOf',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'status',case when exists(select 1 from eligible) then 'OBSERVED' else 'HOLD' end,
    'sourceDataFreshnessCertified',false,
    'causalRelationshipsVerified',false,
    'cryptographicSignatureVerified',false,
    'sourceRecordVersionsVerified',false,
    'eligibleLinkCount',(select count(*)::int from eligible),
    'heldLegacyLinkCount',(select count(*)::int from vaos_private.digital_thread_links
      where execution_job_id is null or intent_id is null),
    'unprojectedLinkCount',(select count(*)::int from vaos_private.digital_thread_links)-
      (select count(*)::int from eligible),
    'links',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id','link:g2b:'||encode(extensions.digest(l.id::text::bytea,'sha256'),'hex'),
        'source','node:g2b:'||encode(extensions.digest(
          (l.source_domain||':'||l.source_record_id::text)::bytea,'sha256'),'hex'),
        'target','node:g2b:'||encode(extensions.digest(
          (l.target_domain||':'||l.target_record_id::text)::bytea,'sha256'),'hex'),
        'sourceDomain',l.source_domain,
        'targetDomain',l.target_domain,
        'relationType',l.relation_type,
        'provenance','LEASED_GOVERNED_SUCCESSFUL_JOB',
        'createdAt',to_char(l.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ) order by l.created_at asc,l.id asc)
      from eligible l
    ),'[]'::jsonb)
  ) into v_graph;
  return v_graph;
end;
$$;

-- No client access. Only the pre-existing service-role edge function may
-- invoke this RPC, and the function itself verifies the VAOS server key.
revoke all on function public.vaos_jarvis_graph_snapshot(text) from public, anon, authenticated;
grant execute on function public.vaos_jarvis_graph_snapshot(text) to service_role;

comment on function public.vaos_jarvis_graph_snapshot(text) is
  'G2b readonly bounded persistent-link graph snapshot, from existing governed
   links only. Pseudonymized IDs. No context/creator/PII. No source age or causal proof.';
