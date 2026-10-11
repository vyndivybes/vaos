-- Stage 5 candidate, NOT production commissioned.
-- A single immutable, founder-owned thread per agent and existing mission.
create table if not exists vaos_private.founder_conversation_threads (
 thread_id uuid primary key,
 founder_email text not null check(founder_email='shyamsundhar1982@gmail.com'),
 recipient_agent_id text not null references vaos_private.digital_employees(id),
 mission_id text not null check(mission_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$'),
 created_at timestamptz not null default now(),
 unique(founder_email,recipient_agent_id,mission_id),
 constraint founder_conversation_agents check(recipient_agent_id in ('project','orchestrator'))
);
alter table vaos_private.founder_conversation_threads enable row level security;
revoke all on vaos_private.founder_conversation_threads from public,anon,authenticated;
drop trigger if exists founder_conversation_thread_immutable on vaos_private.founder_conversation_threads;
create trigger founder_conversation_thread_immutable before update or delete
 on vaos_private.founder_conversation_threads for each row
 execute function vaos_private.reject_founder_inbox_mutation();

create table if not exists vaos_private.founder_conversation_turns (
 message_id uuid primary key references vaos_private.founder_inbox_messages(id),
 thread_id uuid not null references vaos_private.founder_conversation_threads(thread_id),
 sequence_no int not null check(sequence_no between 1 and 12),
 created_at timestamptz not null default now(),
 unique(thread_id,sequence_no)
);
alter table vaos_private.founder_conversation_turns enable row level security;
revoke all on vaos_private.founder_conversation_turns from public,anon,authenticated;
create index if not exists founder_conversation_turns_thread_idx
 on vaos_private.founder_conversation_turns(thread_id,sequence_no);
drop trigger if exists founder_conversation_turn_immutable on vaos_private.founder_conversation_turns;
create trigger founder_conversation_turn_immutable before update or delete
 on vaos_private.founder_conversation_turns for each row
 execute function vaos_private.reject_founder_inbox_mutation();

create or replace function public.vaos_founder_conversation_history(
 p_server_key text,p_actor_email text,p_agent_id text,p_mission_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_thread vaos_private.founder_conversation_threads%rowtype;
 v_turns jsonb;
begin
 perform vaos_private.assert_server_key(p_server_key);
 if p_actor_email <> 'shyamsundhar1982@gmail.com'
    or p_agent_id not in ('project','orchestrator')
    or p_mission_id is null or p_mission_id !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$'
 then raise exception 'FOUNDER_CONVERSATION_INVALID'; end if;
 select * into v_thread from vaos_private.founder_conversation_threads
  where founder_email=p_actor_email and recipient_agent_id=p_agent_id and mission_id=p_mission_id;
 if not found then return jsonb_build_object('threadId',null,'agentId',p_agent_id,
  'missionId',p_mission_id,'turns','[]'::jsonb,'actionAuthorized',false); end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'messageId',m.id,'sequence',t.sequence_no,'instruction',m.instruction,
  'requestStatus',m.status,'createdAt',t.created_at,
  'reply',case when d.request_message_id is null then null else jsonb_build_object(
    'status',d.status,'content',d.content,'evidenceRefs',d.evidence_refs,
    'sourceHash',d.source_hash,'model',d.model,'createdAt',d.created_at)
   end) order by t.sequence_no asc),'[]'::jsonb)
 into v_turns from vaos_private.founder_conversation_turns t
 join vaos_private.founder_inbox_messages m on m.id=t.message_id
 left join vaos_private.founder_agent_drafts d on d.request_message_id=t.message_id
 where t.thread_id=v_thread.thread_id and m.sender_email=p_actor_email
   and m.recipient_agent_id=p_agent_id;
 return jsonb_build_object('threadId',v_thread.thread_id,'agentId',p_agent_id,
  'missionId',p_mission_id,'turns',v_turns,'actionAuthorized',false);
end; $$;

create or replace function public.vaos_founder_conversation_link(
 p_server_key text,p_actor_email text,p_agent_id text,p_mission_id text,
 p_thread_id uuid,p_message_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_thread vaos_private.founder_conversation_threads%rowtype;
 v_message vaos_private.founder_inbox_messages%rowtype;
 v_link vaos_private.founder_conversation_turns%rowtype;
 v_last uuid; v_count int; v_rate int;
begin
 perform vaos_private.assert_server_key(p_server_key);
 if p_actor_email <> 'shyamsundhar1982@gmail.com' or p_agent_id not in ('project','orchestrator')
  or p_mission_id is null or p_mission_id !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$'
  or p_thread_id is null or p_message_id is null
 then raise exception 'FOUNDER_CONVERSATION_INVALID'; end if;
 -- The founder's prior immutable REPORT_REQUEST is the source; cannot promote
 -- an instruction or override into a conversation turn.
 select * into v_message from vaos_private.founder_inbox_messages
 where id=p_message_id and sender_email=p_actor_email and recipient_agent_id=p_agent_id
 and kind='REPORT_REQUEST' and status='RECORDED_NOT_ROUTED'
 and left(instruction,char_length('Mission '||p_mission_id||'. '))='Mission '||p_mission_id||'. ';
 if not found then raise exception 'FOUNDER_CONVERSATION_SOURCE_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtext('VAOS_CONVERSATION:'||p_actor_email||':'||p_agent_id||':'||p_mission_id));
 select * into v_thread from vaos_private.founder_conversation_threads
 where founder_email=p_actor_email and recipient_agent_id=p_agent_id and mission_id=p_mission_id;
 if found then
  if v_thread.thread_id<>p_thread_id then
   return jsonb_build_object('outcome','THREAD_CONFLICT'); end if;
 else
  insert into vaos_private.founder_conversation_threads(thread_id,founder_email,recipient_agent_id,mission_id)
   values(p_thread_id,p_actor_email,p_agent_id,p_mission_id);
 end if;
 select * into v_link from vaos_private.founder_conversation_turns where message_id=p_message_id;
 if found then
  if v_link.thread_id=p_thread_id then
   return jsonb_build_object('outcome','REPLAY','threadId',p_thread_id,'messageId',p_message_id); end if;
  return jsonb_build_object('outcome','IDEMPOTENCY_CONFLICT');
 end if;
 select count(*) into v_count from vaos_private.founder_conversation_turns
  where thread_id=p_thread_id;
 select message_id into v_last from vaos_private.founder_conversation_turns
  where thread_id=p_thread_id order by sequence_no desc limit 1;
 if v_count>=12 then return jsonb_build_object('outcome','THREAD_LIMIT'); end if;
 if v_last is not null and not exists(
  select 1 from vaos_private.founder_agent_drafts where request_message_id=v_last
 ) then return jsonb_build_object('outcome','PREVIOUS_REPLY_PENDING'); end if;
 select count(*) into v_rate from vaos_private.founder_conversation_turns
 where thread_id=p_thread_id and created_at>now()-interval '1 minute';
 if v_rate>=2 then return jsonb_build_object('outcome','RATE_LIMITED'); end if;
 insert into vaos_private.founder_conversation_turns(message_id,thread_id,sequence_no)
 values (p_message_id,p_thread_id,v_count+1);
 return jsonb_build_object('outcome','LINKED','threadId',p_thread_id,
  'messageId',p_message_id,'sequence',v_count+1,'actionAuthorized',false);
end; $$;

revoke all on function public.vaos_founder_conversation_history(text,text,text,text) from public,anon,authenticated;
revoke all on function public.vaos_founder_conversation_link(text,text,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.vaos_founder_conversation_history(text,text,text,text) to service_role;
grant execute on function public.vaos_founder_conversation_link(text,text,text,text,uuid,uuid) to service_role;
