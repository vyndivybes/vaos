-- Dashboard definitions only; no copied business results or new execution authority.
create table vaos_private.dashboard_definitions(
 id uuid primary key,
 owner_email text not null,
 visibility text not null check(visibility in ('private','authorized')),
 definition jsonb not null check(jsonb_typeof(definition)='object' and octet_length(definition::text)<=8192),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now()
);
alter table vaos_private.dashboard_definitions enable row level security;
revoke all on vaos_private.dashboard_definitions from public,anon,authenticated;
create index on vaos_private.dashboard_definitions(owner_email,updated_at desc);

-- Narrow server RPC, matching the existing founder reporting authority.
create function public.vaos_dashboard_definitions(
 p_server_key text,p_actor_email text,p_action text,p_id uuid default null,
 p_revision integer default 0,p_visibility text default 'private',p_definition jsonb default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_agents text[];
begin
 perform vaos_private.assert_server_key(p_server_key);
 if lower(trim(coalesce(p_actor_email,'')))<>'shyamsundhar1982@gmail.com' then raise exception 'FOUNDER_ONLY'; end if;
 if p_action='list' then
  select coalesce(jsonb_agg(r),'[]'::jsonb) into v_result from (
   select id,definition->>'title' as title from vaos_private.dashboard_definitions
   where owner_email=p_actor_email order by updated_at desc limit 100
  ) r;
 elsif p_action='open' then
  select jsonb_build_object('id',id,'definition',definition,'revision',revision,'visibility',visibility)
  into v_result from vaos_private.dashboard_definitions where id=p_id and owner_email=p_actor_email;
  if v_result is null then raise exception 'DASHBOARD_ACCESS_DENIED'; end if;
 elsif p_action='save' then
  if p_id is null or p_revision<0 or p_visibility not in ('private','authorized') or p_definition is null
   or (p_definition->>'version') is distinct from '1'
   or coalesce(p_definition->>'metric','') not in ('activity','backlog','statuses','agents','crm')
   or coalesce(p_definition->>'chart','') not in ('bar','table')
   or coalesce(length(trim(p_definition->>'title')),0) not between 1 and 120
   or jsonb_typeof(p_definition->'agents') is distinct from 'array'
   or jsonb_array_length(p_definition->'agents') not between 1 and 16
   or not coalesce(pg_input_is_valid(p_definition->>'from','date'),false)
   or not coalesce(pg_input_is_valid(p_definition->>'to','date'),false)
   or (p_definition->>'to')::date < (p_definition->>'from')::date
   or (p_definition->>'to')::date > (now() at time zone 'Asia/Kolkata')::date
   or (p_definition->>'to')::date-(p_definition->>'from')::date>366
  then raise exception 'DASHBOARD_DEFINITION_INVALID'; end if;
  select array_agg(x) into v_agents from jsonb_array_elements_text(p_definition->'agents') x;
  if exists(select 1 from unnest(v_agents) a where a not in ('orchestrator','project','vibpe','risk','knowledge','release','qa','commercial','procurement','inventory','production','maintenance','finance','people','engineering-configuration','security'))
   or cardinality(v_agents)<>(select count(distinct a) from unnest(v_agents) a)
  then raise exception 'DASHBOARD_AGENT_INVALID'; end if;
  insert into vaos_private.dashboard_definitions as d(id,owner_email,visibility,definition)
  values(p_id,p_actor_email,p_visibility,p_definition)
  on conflict(id) do update set definition=excluded.definition,visibility=excluded.visibility,
   revision=d.revision+1,updated_at=now()
  where d.owner_email=p_actor_email and d.revision=p_revision
  returning jsonb_build_object('id',id,'revision',revision) into v_result;
  if v_result is null then raise exception 'DASHBOARD_REVISION_CONFLICT'; end if;
 else raise exception 'DASHBOARD_ACTION_INVALID'; end if;
 return v_result;
end $$;
revoke all on function public.vaos_dashboard_definitions(text,text,text,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.vaos_dashboard_definitions(text,text,text,uuid,integer,text,jsonb) to service_role;
