alter table vaos_private.digital_thread_links
  add column if not exists intent_id uuid references vaos_private.intents(id),
  add column if not exists execution_job_id uuid references vaos_private.execution_jobs(id);

create unique index if not exists vaos_digital_thread_links_intent_unique
  on vaos_private.digital_thread_links (intent_id)
  where intent_id is not null;

create unique index if not exists vaos_digital_thread_links_job_unique
  on vaos_private.digital_thread_links (execution_job_id)
  where execution_job_id is not null;

revoke execute on function public.vaos_link_domain_records(text,text,uuid,text,text,uuid,text,jsonb)
  from service_role;

create or replace function public.vaos_link_domain_records(
  p_server_key text,
  p_job_id text,
  p_lease_token text,
  p_source_domain text,
  p_source_record_id uuid,
  p_relation_type text,
  p_target_domain text,
  p_target_record_id uuid,
  p_created_by text,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_job vaos_private.execution_jobs%rowtype;
  v_source_exists boolean := false;
  v_target_exists boolean := false;
  v_link vaos_private.digital_thread_links%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);

  select * into v_job
  from vaos_private.execution_jobs
  where id::text=p_job_id
  for update;

  if v_job.id is null then
    return jsonb_build_object('outcome','NOT_FOUND');
  end if;

  if v_job.status <> 'LEASED'
     or v_job.lease_token::text <> p_lease_token
     or v_job.action_type <> 'DIGITAL_THREAD.CREATE_LINK' then
    return jsonb_build_object('outcome','CONFLICT');
  end if;

  if coalesce(v_job.payload->>'sourceDomain','') <> p_source_domain
     or coalesce(v_job.payload->>'sourceRecordId','') <> p_source_record_id::text
     or coalesce(v_job.payload->>'relationType','') <> p_relation_type
     or coalesce(v_job.payload->>'targetDomain','') <> p_target_domain
     or coalesce(v_job.payload->>'targetRecordId','') <> p_target_record_id::text
     or coalesce(v_job.payload->>'proposedBy','') <> p_created_by
     or coalesce(v_job.payload->'context','{}'::jsonb) <> coalesce(p_context,'{}'::jsonb) then
    return jsonb_build_object('outcome','PAYLOAD_MISMATCH');
  end if;

  if p_source_domain not in ('QA_CAPA','ENGINEERING_BASELINE','PROJECT_RISK')
     or p_target_domain not in ('QA_CAPA','ENGINEERING_BASELINE','PROJECT_RISK') then
    return jsonb_build_object('outcome','INVALID_DOMAIN');
  end if;

  if p_relation_type not in ('DRIVES_CHANGE','MITIGATES_RISK','TRIGGERS_CAPA','RELATED_TO') then
    return jsonb_build_object('outcome','INVALID_RELATION');
  end if;

  if nullif(trim(coalesce(p_created_by,'')), '') is null then
    return jsonb_build_object('outcome','CREATOR_REQUIRED');
  end if;

  if p_source_domain = p_target_domain and p_source_record_id = p_target_record_id then
    return jsonb_build_object('outcome','SELF_LINK_DENIED');
  end if;

  if p_source_domain='QA_CAPA' then
    select exists(select 1 from vaos_private.capa_records where id=p_source_record_id) into v_source_exists;
  elsif p_source_domain='ENGINEERING_BASELINE' then
    select exists(select 1 from vaos_private.engineering_baseline_changes where id=p_source_record_id) into v_source_exists;
  else
    select exists(select 1 from vaos_private.project_risk_escalations where id=p_source_record_id) into v_source_exists;
  end if;

  if p_target_domain='QA_CAPA' then
    select exists(select 1 from vaos_private.capa_records where id=p_target_record_id) into v_target_exists;
  elsif p_target_domain='ENGINEERING_BASELINE' then
    select exists(select 1 from vaos_private.engineering_baseline_changes where id=p_target_record_id) into v_target_exists;
  else
    select exists(select 1 from vaos_private.project_risk_escalations where id=p_target_record_id) into v_target_exists;
  end if;

  if not v_source_exists or not v_target_exists then
    return jsonb_build_object(
      'outcome','ENDPOINT_NOT_FOUND',
      'sourceExists',v_source_exists,
      'targetExists',v_target_exists
    );
  end if;

  select * into v_link
  from vaos_private.digital_thread_links
  where execution_job_id=v_job.id;

  if v_link.id is not null then
    if v_link.source_domain=p_source_domain
       and v_link.source_record_id=p_source_record_id
       and v_link.relation_type=p_relation_type
       and v_link.target_domain=p_target_domain
       and v_link.target_record_id=p_target_record_id
       and v_link.intent_id=v_job.intent_id then
      return jsonb_build_object(
        'outcome','REPLAY',
        'link',jsonb_build_object(
          'id',v_link.id,
          'sourceDomain',v_link.source_domain,
          'sourceRecordId',v_link.source_record_id,
          'relationType',v_link.relation_type,
          'targetDomain',v_link.target_domain,
          'targetRecordId',v_link.target_record_id,
          'createdBy',v_link.created_by,
          'context',v_link.context,
          'intentId',v_link.intent_id,
          'executionJobId',v_link.execution_job_id,
          'createdAt',v_link.created_at
        )
      );
    end if;
    return jsonb_build_object('outcome','CONFLICT');
  end if;

  if exists (
    select 1 from vaos_private.digital_thread_links
    where source_domain=p_source_domain
      and source_record_id=p_source_record_id
      and relation_type=p_relation_type
      and target_domain=p_target_domain
      and target_record_id=p_target_record_id
  ) then
    return jsonb_build_object('outcome','LINK_ALREADY_EXISTS');
  end if;

  insert into vaos_private.digital_thread_links(
    source_domain,source_record_id,relation_type,target_domain,target_record_id,
    created_by,context,intent_id,execution_job_id
  )
  values(
    p_source_domain,p_source_record_id,p_relation_type,p_target_domain,p_target_record_id,
    p_created_by,coalesce(p_context,'{}'::jsonb),v_job.intent_id,v_job.id
  )
  returning * into v_link;

  insert into vaos_private.events(type,source,payload)
  values(
    'DIGITAL_THREAD.LINK_CREATED',
    p_created_by,
    jsonb_build_object(
      'linkId',v_link.id,
      'intentId',v_link.intent_id,
      'executionJobId',v_link.execution_job_id,
      'sourceDomain',v_link.source_domain,
      'sourceRecordId',v_link.source_record_id,
      'relationType',v_link.relation_type,
      'targetDomain',v_link.target_domain,
      'targetRecordId',v_link.target_record_id,
      'createdBy',v_link.created_by
    )
  );

  return jsonb_build_object(
    'outcome','CREATED',
    'link',jsonb_build_object(
      'id',v_link.id,
      'sourceDomain',v_link.source_domain,
      'sourceRecordId',v_link.source_record_id,
      'relationType',v_link.relation_type,
      'targetDomain',v_link.target_domain,
      'targetRecordId',v_link.target_record_id,
      'createdBy',v_link.created_by,
      'context',v_link.context,
      'intentId',v_link.intent_id,
      'executionJobId',v_link.execution_job_id,
      'createdAt',v_link.created_at
    )
  );
end;
$$;

create or replace function public.vaos_get_domain_link(
  p_server_key text,
  p_job_id text,
  p_source_domain text,
  p_source_record_id uuid,
  p_relation_type text,
  p_target_domain text,
  p_target_record_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
declare
  v_link vaos_private.digital_thread_links%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);

  select * into v_link
  from vaos_private.digital_thread_links
  where execution_job_id::text=p_job_id
    and source_domain=p_source_domain
    and source_record_id=p_source_record_id
    and relation_type=p_relation_type
    and target_domain=p_target_domain
    and target_record_id=p_target_record_id;

  if v_link.id is null then return null; end if;

  return jsonb_build_object(
    'id',v_link.id,
    'sourceDomain',v_link.source_domain,
    'sourceRecordId',v_link.source_record_id,
    'relationType',v_link.relation_type,
    'targetDomain',v_link.target_domain,
    'targetRecordId',v_link.target_record_id,
    'createdBy',v_link.created_by,
    'context',v_link.context,
    'intentId',v_link.intent_id,
    'executionJobId',v_link.execution_job_id,
    'createdAt',v_link.created_at
  );
end;
$$;

create or replace function public.vaos_trace_links_snapshot(p_server_key text)
returns jsonb
language plpgsql
security definer
set search_path = vaos_private, public, pg_temp
as $$
begin
  perform vaos_private.assert_server_key(p_server_key);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',l.id,
      'sourceDomain',l.source_domain,
      'sourceRecordId',l.source_record_id,
      'relationType',l.relation_type,
      'targetDomain',l.target_domain,
      'targetRecordId',l.target_record_id,
      'createdBy',l.created_by,
      'context',l.context,
      'intentId',l.intent_id,
      'executionJobId',l.execution_job_id,
      'governed',(l.execution_job_id is not null),
      'createdAt',l.created_at
    ) order by l.created_at asc, l.id asc)
    from (
      select *
      from vaos_private.digital_thread_links
      order by created_at asc, id asc
      limit 500
    ) l
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.vaos_link_domain_records(text,text,text,text,uuid,text,text,uuid,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.vaos_get_domain_link(text,text,text,uuid,text,text,uuid)
  from public, anon, authenticated;
revoke all on function public.vaos_trace_links_snapshot(text)
  from public, anon, authenticated;

grant execute on function public.vaos_link_domain_records(text,text,text,text,uuid,text,text,uuid,text,jsonb)
  to service_role;
grant execute on function public.vaos_get_domain_link(text,text,text,uuid,text,text,uuid)
  to service_role;
grant execute on function public.vaos_trace_links_snapshot(text)
  to service_role;
