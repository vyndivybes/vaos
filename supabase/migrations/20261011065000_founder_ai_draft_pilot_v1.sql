-- Stage 4 pilot candidate. DO NOT APPLY until model and cost qualification.
-- One append-only unverified AI draft per existing immutable founder message.
create table if not exists vaos_private.founder_agent_drafts (
 request_message_id uuid primary key references vaos_private.founder_inbox_messages(id),
 founder_email text not null check (founder_email='shyamsundhar1982@gmail.com'),
 recipient_agent_id text not null references vaos_private.digital_employees(id),
 mission_id text not null,
 content text not null check (char_length(content) between 10 and 1200),
 source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
 evidence_refs text[] not null default '{}'::text[],
 provider text not null default 'cloudflare-workers-ai' check (provider='cloudflare-workers-ai'),
 model text not null default '@cf/zai-org/glm-4.7-flash' check (model='@cf/zai-org/glm-4.7-flash'),
 status text not null default 'AI_DRAFT_UNVERIFIED' check(status='AI_DRAFT_UNVERIFIED'),
 created_at timestamptz not null default now(),
 constraint founder_agent_draft_source_count check (cardinality(evidence_refs) <= 20)
);
alter table vaos_private.founder_agent_drafts enable row level security;
revoke all on vaos_private.founder_agent_drafts from public,anon,authenticated;
drop trigger if exists founder_agent_draft_immutable on vaos_private.founder_agent_drafts;
create trigger founder_agent_draft_immutable before update or delete
 on vaos_private.founder_agent_drafts for each row
 execute function vaos_private.reject_founder_inbox_mutation();


-- One immutable claim per recorded founder request. Claim is consumed even on AI failure:
-- fail closed on retries to eliminate concurrent/repeated billable inference.
create table if not exists vaos_private.founder_agent_draft_claims (
 request_message_id uuid primary key references vaos_private.founder_inbox_messages(id),
 founder_email text not null check(founder_email='shyamsundhar1982@gmail.com'),
 recipient_agent_id text not null references vaos_private.digital_employees(id),
 mission_id text not null,
 claimed_at timestamptz not null default now()
);
alter table vaos_private.founder_agent_draft_claims enable row level security;
revoke all on vaos_private.founder_agent_draft_claims from public,anon,authenticated;
drop trigger if exists founder_agent_draft_claim_immutable on vaos_private.founder_agent_draft_claims;
create trigger founder_agent_draft_claim_immutable before update or delete
 on vaos_private.founder_agent_draft_claims for each row
 execute function vaos_private.reject_founder_inbox_mutation();

create or replace function public.vaos_founder_chat_claim(
 p_server_key text,p_message_id uuid,p_actor_email text,p_agent_id text,p_mission_id text)
returns jsonb language plpgsql security definer set search_path='' as $
declare v_source vaos_private.founder_inbox_messages%rowtype;
 v_exists boolean; v_count integer;
begin
 perform vaos_private.assert_server_key(p_server_key);
 if p_actor_email <> 'shyamsundhar1982@gmail.com'
    or p_message_id is null or p_agent_id not in ('project','orchestrator')
    or p_mission_id !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}
 p_server_key text,p_message_id uuid,p_actor_email text,p_agent_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_record vaos_private.founder_agent_drafts%rowtype;
begin
 perform vaos_private.assert_server_key(p_server_key);
 if p_actor_email <> 'shyamsundhar1982@gmail.com' or p_message_id is null
   or p_agent_id not in ('project','orchestrator') then
   raise exception 'FOUNDER_CHAT_INVALID'; end if;
 select * into v_record from vaos_private.founder_agent_drafts
  where request_message_id=p_message_id and founder_email=p_actor_email
    and recipient_agent_id=p_agent_id;
 if not found then return jsonb_build_object('reply',null); end if;
 return jsonb_build_object('reply',jsonb_build_object(
   'messageId',v_record.request_message_id,'agentId',v_record.recipient_agent_id,
   'missionId',v_record.mission_id,'content',v_record.content,
   'model',v_record.model,'provider',v_record.provider,'status',v_record.status,
   'evidenceRefs',v_record.evidence_refs,'sourceHash',v_record.source_hash,
   'createdAt',v_record.created_at));
end; $$;

create or replace function public.vaos_founder_chat_append(
 p_server_key text,p_message_id uuid,p_actor_email text,p_agent_id text,
 p_mission_id text,p_content text,p_source_hash text,p_evidence_refs text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_existing vaos_private.founder_agent_drafts%rowtype;
 v_source vaos_private.founder_inbox_messages%rowtype;
 v_claim vaos_private.founder_agent_draft_claims%rowtype;
 v_count integer;
begin
 perform vaos_private.assert_server_key(p_server_key);
 if p_actor_email <> 'shyamsundhar1982@gmail.com'
   or p_message_id is null or p_agent_id not in ('project','orchestrator')
   or p_mission_id !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$'
   or char_length(p_content) not between 10 and 1200
   or p_content ~ '[[:cntrl:]]'
   or p_source_hash !~ '^[a-f0-9]{64}$'
   or p_evidence_refs is null or cardinality(p_evidence_refs)>20
 then raise exception 'FOUNDER_CHAT_INVALID'; end if;
 select * into v_source from vaos_private.founder_inbox_messages
  where id=p_message_id and sender_email=p_actor_email
    and recipient_agent_id=p_agent_id and kind='REPORT_REQUEST'
    and status='RECORDED_NOT_ROUTED';
 if not found then raise exception 'FOUNDER_CHAT_SOURCE_UNVERIFIED'; end if;
 select * into v_claim from vaos_private.founder_agent_draft_claims
   where request_message_id=p_message_id and founder_email=p_actor_email
   and recipient_agent_id=p_agent_id and mission_id=p_mission_id;
 if not found then raise exception 'FOUNDER_CHAT_NOT_CLAIMED'; end if;
 perform pg_advisory_xact_lock(hashtext('FOUNDER_CHAT:'||p_message_id::text));
 select * into v_existing from vaos_private.founder_agent_drafts where request_message_id=p_message_id;
 if found then
  if v_existing.founder_email<>p_actor_email or v_existing.recipient_agent_id<>p_agent_id
     or v_existing.mission_id<>p_mission_id
  then return jsonb_build_object('outcome','IDEMPOTENCY_CONFLICT'); end if;
  return jsonb_build_object('outcome','REPLAY','reply',(
    public.vaos_founder_chat_get(p_server_key,p_message_id,p_actor_email,p_agent_id)->'reply'));
 end if;
 select count(*) into v_count from vaos_private.founder_agent_drafts
  where founder_email=p_actor_email and created_at>now()-interval '1 minute';
 if v_count>=3 then return jsonb_build_object('outcome','RATE_LIMITED'); end if;
 insert into vaos_private.founder_agent_drafts(
  request_message_id,founder_email,recipient_agent_id,mission_id,content,source_hash,evidence_refs)
 values(p_message_id,p_actor_email,p_agent_id,p_mission_id,p_content,p_source_hash,p_evidence_refs);
 return jsonb_build_object('outcome','RECORDED','reply',(
   public.vaos_founder_chat_get(p_server_key,p_message_id,p_actor_email,p_agent_id)->'reply'));
end; $$;

revoke all on function public.vaos_founder_chat_claim(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.vaos_founder_chat_claim(text,uuid,text,text,text) to service_role;
revoke all on function public.vaos_founder_chat_get(text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.vaos_founder_chat_append(text,uuid,text,text,text,text,text,text[]) from public,anon,authenticated;
grant execute on function public.vaos_founder_chat_get(text,uuid,text,text) to service_role;
grant execute on function public.vaos_founder_chat_append(text,uuid,text,text,text,text,text,text,text[]) to service_role;

 then raise exception 'FOUNDER_CHAT_CLAIM_INVALID'; end if;
 select * into v_source from vaos_private.founder_inbox_messages
  where id=p_message_id and sender_email=p_actor_email and recipient_agent_id=p_agent_id
   and kind='REPORT_REQUEST' and status='RECORDED_NOT_ROUTED'
   and position(p_mission_id in instruction)>0;
 if not found then raise exception 'FOUNDER_CHAT_SOURCE_UNVERIFIED'; end if;
 perform pg_advisory_xact_lock(hashtext('FOUNDER_CHAT_CLAIM:'||p_actor_email));
 select exists(select 1 from vaos_private.founder_agent_draft_claims
   where request_message_id=p_message_id) into v_exists;
 if v_exists then return jsonb_build_object('outcome','ALREADY_CLAIMED'); end if;
 select count(*) into v_count from vaos_private.founder_agent_draft_claims
  where founder_email=p_actor_email and claimed_at>now()-interval '1 minute';
 if v_count>=3 then return jsonb_build_object('outcome','RATE_LIMITED'); end if;
 insert into vaos_private.founder_agent_draft_claims
   (request_message_id,founder_email,recipient_agent_id,mission_id)
 values (p_message_id,p_actor_email,p_agent_id,p_mission_id);
 return jsonb_build_object('outcome','CLAIMED');
end; $;

create or replace function public.vaos_founder_chat_get(
 p_server_key text,p_message_id uuid,p_actor_email text,p_agent_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_record vaos_private.founder_agent_drafts%rowtype;
begin
 perform vaos_private.assert_server_key(p_server_key);
 if p_actor_email <> 'shyamsundhar1982@gmail.com' or p_message_id is null
   or p_agent_id not in ('project','orchestrator') then
   raise exception 'FOUNDER_CHAT_INVALID'; end if;
 select * into v_record from vaos_private.founder_agent_drafts
  where request_message_id=p_message_id and founder_email=p_actor_email
    and recipient_agent_id=p_agent_id;
 if not found then return jsonb_build_object('reply',null); end if;
 return jsonb_build_object('reply',jsonb_build_object(
   'messageId',v_record.request_message_id,'agentId',v_record.recipient_agent_id,
   'missionId',v_record.mission_id,'content',v_record.content,
   'model',v_record.model,'provider',v_record.provider,'status',v_record.status,
   'evidenceRefs',v_record.evidence_refs,'sourceHash',v_record.source_hash,
   'createdAt',v_record.created_at));
end; $$;

create or replace function public.vaos_founder_chat_append(
 p_server_key text,p_message_id uuid,p_actor_email text,p_agent_id text,
 p_mission_id text,p_content text,p_source_hash text,p_evidence_refs text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_existing vaos_private.founder_agent_drafts%rowtype;
 v_source vaos_private.founder_inbox_messages%rowtype;
 v_count integer;
begin
 perform vaos_private.assert_server_key(p_server_key);
 if p_actor_email <> 'shyamsundhar1982@gmail.com'
   or p_message_id is null or p_agent_id not in ('project','orchestrator')
   or p_mission_id !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$'
   or char_length(p_content) not between 10 and 1200
   or p_content ~ '[[:cntrl:]]'
   or p_source_hash !~ '^[a-f0-9]{64}$'
   or p_evidence_refs is null or cardinality(p_evidence_refs)>20
 then raise exception 'FOUNDER_CHAT_INVALID'; end if;
 select * into v_source from vaos_private.founder_inbox_messages
  where id=p_message_id and sender_email=p_actor_email
    and recipient_agent_id=p_agent_id and kind='REPORT_REQUEST'
    and status='RECORDED_NOT_ROUTED';
 if not found then raise exception 'FOUNDER_CHAT_SOURCE_UNVERIFIED'; end if;
 perform pg_advisory_xact_lock(hashtext('FOUNDER_CHAT:'||p_message_id::text));
 select * into v_existing from vaos_private.founder_agent_drafts where request_message_id=p_message_id;
 if found then
  if v_existing.founder_email<>p_actor_email or v_existing.recipient_agent_id<>p_agent_id
     or v_existing.mission_id<>p_mission_id
  then return jsonb_build_object('outcome','IDEMPOTENCY_CONFLICT'); end if;
  return jsonb_build_object('outcome','REPLAY','reply',(
    public.vaos_founder_chat_get(p_server_key,p_message_id,p_actor_email,p_agent_id)->'reply'));
 end if;
 select count(*) into v_count from vaos_private.founder_agent_drafts
  where founder_email=p_actor_email and created_at>now()-interval '1 minute';
 if v_count>=3 then return jsonb_build_object('outcome','RATE_LIMITED'); end if;
 insert into vaos_private.founder_agent_drafts(
  request_message_id,founder_email,recipient_agent_id,mission_id,content,source_hash,evidence_refs)
 values(p_message_id,p_actor_email,p_agent_id,p_mission_id,p_content,p_source_hash,p_evidence_refs);
 return jsonb_build_object('outcome','RECORDED','reply',(
   public.vaos_founder_chat_get(p_server_key,p_message_id,p_actor_email,p_agent_id)->'reply'));
end; $$;

revoke all on function public.vaos_founder_chat_get(text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.vaos_founder_chat_append(text,uuid,text,text,text,text,text,text[]) from public,anon,authenticated;
grant execute on function public.vaos_founder_chat_get(text,uuid,text,text) to service_role;
grant execute on function public.vaos_founder_chat_append(text,uuid,text,text,text,text,text,text,text[]) to service_role;
