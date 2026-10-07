create table if not exists vaos_private.digital_thread_links (
  id uuid primary key default gen_random_uuid(),
  source_domain text not null check (source_domain in ('QA_CAPA','ENGINEERING_BASELINE','PROJECT_RISK')),
  source_record_id uuid not null,
  relation_type text not null check (relation_type in ('DRIVES_CHANGE','MITIGATES_RISK','TRIGGERS_CAPA','RELATED_TO')),
  target_domain text not null check (target_domain in ('QA_CAPA','ENGINEERING_BASELINE','PROJECT_RISK')),
  target_record_id uuid not null,
  created_by text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint vaos_digital_thread_links_not_self
    check (not (source_domain = target_domain and source_record_id = target_record_id)),
  constraint vaos_digital_thread_links_unique
    unique (source_domain, source_record_id, relation_type, target_domain, target_record_id)
);
alter table vaos_private.digital_thread_links enable row level security;

create index if not exists vaos_digital_thread_links_source_idx
  on vaos_private.digital_thread_links (source_domain, source_record_id, created_at desc);
create index if not exists vaos_digital_thread_links_target_idx
  on vaos_private.digital_thread_links (target_domain, target_record_id, created_at desc);
create index if not exists vaos_digital_thread_links_relation_idx
  on vaos_private.digital_thread_links (relation_type, created_at desc);

comment on table vaos_private.digital_thread_links is
  'Explicit durable cross-domain VAOS traceability links. RLS enabled; no client policies. No inferred relationships.';

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

create or replace function public.vaos_link_domain_records(
  p_server_key text,
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
  v_source_exists boolean := false;
  v_target_exists boolean := false;
  v_link vaos_private.digital_thread_links%rowtype;
begin
  perform vaos_private.assert_server_key(p_server_key);

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
  where source_domain=p_source_domain
    and source_record_id=p_source_record_id
    and relation_type=p_relation_type
    and target_domain=p_target_domain
    and target_record_id=p_target_record_id;

  if v_link.id is not null then
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
        'createdAt',v_link.created_at
      )
    );
  end if;

  begin
    insert into vaos_private.digital_thread_links(
      source_domain,source_record_id,relation_type,target_domain,target_record_id,created_by,context
    ) values(
      p_source_domain,p_source_record_id,p_relation_type,p_target_domain,p_target_record_id,p_created_by,coalesce(p_context,'{}'::jsonb)
    )
    returning * into v_link;
  exception when unique_violation then
    select * into v_link
    from vaos_private.digital_thread_links
    where source_domain=p_source_domain
      and source_record_id=p_source_record_id
      and relation_type=p_relation_type
      and target_domain=p_target_domain
      and target_record_id=p_target_record_id;

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
        'createdAt',v_link.created_at
      )
    );
  end;

  insert into vaos_private.events(type,source,payload)
  values(
    'DIGITAL_THREAD.LINK_CREATED',
    'vaos-digital-thread',
    jsonb_build_object(
      'linkId',v_link.id,
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
      'createdAt',v_link.created_at
    )
  );
end;
$$;

revoke all on function public.vaos_trace_links_snapshot(text) from public, anon, authenticated;
revoke all on function public.vaos_link_domain_records(text,text,uuid,text,text,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.vaos_trace_links_snapshot(text) to service_role;
grant execute on function public.vaos_link_domain_records(text,text,uuid,text,text,uuid,text,jsonb) to service_role;
