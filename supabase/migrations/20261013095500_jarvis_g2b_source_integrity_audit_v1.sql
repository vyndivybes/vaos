-- G2b controlled source-authority audit of the EXISTING graph ledger.
-- Counts only. No source data, UUIDs, names, timestamps per record or
-- event payloads are returned. Existing source domain tables remain owners.
create or replace function public.vaos_jarvis_source_audit(p_server_key text)
returns jsonb language plpgsql security definer
set search_path=vaos_private,public,pg_temp
as $$
declare v_result jsonb;
begin
  perform vaos_private.assert_server_key(p_server_key);
  with source_record as materialized (
    select l.created_at,l.intent_id,l.execution_job_id,
      j.status link_job_status,j.action_type link_action,
      coalesce(sc.id,se.id,sr.id) source_id,
      coalesce(tc.id,te.id,tr.id) target_id,
      coalesce(sc.updated_at,se.updated_at,sr.updated_at) source_updated,
      coalesce(tc.updated_at,te.updated_at,tr.updated_at) target_updated,
      sj.status source_job_status,tj.status target_job_status
    from vaos_private.digital_thread_links l
    left join vaos_private.execution_jobs j
      on j.id=l.execution_job_id and j.intent_id=l.intent_id
    left join vaos_private.capa_records sc
      on l.source_domain='QA_CAPA' and sc.id=l.source_record_id
    left join vaos_private.engineering_baseline_changes se
      on l.source_domain='ENGINEERING_BASELINE' and se.id=l.source_record_id
    left join vaos_private.project_risk_escalations sr
      on l.source_domain='PROJECT_RISK' and sr.id=l.source_record_id
    left join vaos_private.capa_records tc
      on l.target_domain='QA_CAPA' and tc.id=l.target_record_id
    left join vaos_private.engineering_baseline_changes te
      on l.target_domain='ENGINEERING_BASELINE' and te.id=l.target_record_id
    left join vaos_private.project_risk_escalations tr
      on l.target_domain='PROJECT_RISK' and tr.id=l.target_record_id
    left join vaos_private.execution_jobs sj
      on sj.id=coalesce(sc.execution_job_id,se.execution_job_id,sr.execution_job_id)
    left join vaos_private.execution_jobs tj
      on tj.id=coalesce(tc.execution_job_id,te.execution_job_id,tr.execution_job_id)
  )
  select jsonb_build_object(
    'schemaVersion','G2B_SOURCE_AUDIT_V1',
    'scope','GOVERNED_VAOS_DIGITAL_THREAD',
    'checkedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'totalLinkCount',count(*)::int,
    'qualifiedLinkCount',count(*) filter(where
       intent_id is not null and execution_job_id is not null
       and link_job_status='SUCCEEDED'
       and link_action='DIGITAL_THREAD.CREATE_LINK'
       and source_id is not null and target_id is not null)::int,
    'sourceEndpointJobsSucceeded',count(*) filter(where
       source_job_status='SUCCEEDED' and target_job_status='SUCCEEDED')::int,
    'changedAfterLinkCount',count(*) filter(where
       source_updated>created_at or target_updated>created_at)::int,
    'missingSourceTimestamps',count(*) filter(where
       source_updated is null or target_updated is null)::int,
    'futureSourceTimestamps',count(*) filter(where
       source_updated>now() or target_updated>now())::int,
    'legacyLinkCount',count(*) filter(where
       intent_id is null or execution_job_id is null)::int,
    'sourceVersionSignatureVerified',false,
    'sourceDocumentVersionsIndependentlyVerified',false,
    'fullDatabaseRecoveryQualified',false,
    'semanticContradictionsResolved',false
  ) into v_result
  from source_record;
  return v_result;
end;
$$;
revoke all on function public.vaos_jarvis_source_audit(text) from public,anon,authenticated;
grant execute on function public.vaos_jarvis_source_audit(text) to service_role;
comment on function public.vaos_jarvis_source_audit(text) is
  'Aggregate only G2b source authority audit; no business data, no signed versions, no restore or causal claims.';
