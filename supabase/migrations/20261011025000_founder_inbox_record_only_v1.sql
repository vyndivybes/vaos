-- Stage 2: Founder-only immutable inbox, recording without agent routing or business writes.
-- Run only after review of the separate migration and qualified Edge deployment.
create table if not exists vaos_private.founder_inbox_messages (
  id uuid primary key,
  sender_email text not null,
  recipient_agent_id text not null references vaos_private.digital_employees(id),
  kind text not null check (kind in ('INSTRUCTION','REPORT_REQUEST','OVERRIDE_PROPOSAL')),
  instruction text not null check (char_length(instruction) between 5 and 2000),
  status text not null default 'RECORDED_NOT_ROUTED'
    check (status='RECORDED_NOT_ROUTED'),
  created_at timestamptz not null default now(),
  constraint founder_inbox_sender check (sender_email='shyamsundhar1982@gmail.com')
);
alter table vaos_private.founder_inbox_messages enable row level security;
revoke all on vaos_private.founder_inbox_messages from public, anon, authenticated;
create index if not exists founder_inbox_agent_created_idx
  on vaos_private.founder_inbox_messages(sender_email,recipient_agent_id,created_at desc,id desc);

create or replace function vaos_private.reject_founder_inbox_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 raise exception 'FOUNDER_INBOX_IMMUTABLE';
end; $$;
revoke all on function vaos_private.reject_founder_inbox_mutation() from public,anon,authenticated;
drop trigger if exists founder_inbox_immutable on vaos_private.founder_inbox_messages;
create trigger founder_inbox_immutable before update or delete
 on vaos_private.founder_inbox_messages
 for each row execute function vaos_private.reject_founder_inbox_mutation();

create or replace function public.vaos_founder_inbox_append(
 p_server_key text,p_message_id uuid,p_actor_email text,
 p_agent_id text,p_kind text,p_instruction text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_existing vaos_private.founder_inbox_messages%rowtype;
 v_record vaos_private.founder_inbox_messages%rowtype;
 v_body text := trim(coalesce(p_instruction,''));
 v_count integer;
begin
 perform vaos_private.assert_server_key(p_server_key);
 if p_actor_email <> 'shyamsundhar1982@gmail.com'
    or p_message_id is null or p_agent_id is null
    or p_kind not in ('INSTRUCTION','REPORT_REQUEST','OVERRIDE_PROPOSAL')
    or char_length(v_body) not between 5 and 2000
    or p_instruction ~ '[[:cntrl:]]'
    or not exists (select 1 from vaos_private.digital_employees where id=p_agent_id)
 then raise exception 'FOUNDER_INBOX_INVALID'; end if;

 -- Serialize the single founder's sends so the limit is effective under concurrency.
 perform pg_advisory_xact_lock(hashtext('VAOS_FOUNDER_INBOX:'||p_actor_email));
 select * into v_existing from vaos_private.founder_inbox_messages where id=p_message_id;
 if found then
   if v_existing.sender_email=p_actor_email and v_existing.recipient_agent_id=p_agent_id
      and v_existing.kind=p_kind and v_existing.instruction=v_body then
      return jsonb_build_object('outcome','REPLAY','message',jsonb_build_object(
        'messageId',v_existing.id,'recipientAgentId',v_existing.recipient_agent_id,
        'kind',v_existing.kind,'instruction',v_existing.instruction,
        'status',v_existing.status,'createdAt',v_existing.created_at));
   end if;
   return jsonb_build_object('outcome','IDEMPOTENCY_CONFLICT');
 end if;

 select count(*) into v_count from vaos_private.founder_inbox_messages
 where sender_email=p_actor_email and created_at>now()-interval '1 minute';
 if v_count>=10 then return jsonb_build_object('outcome','RATE_LIMITED'); end if;

 insert into vaos_private.founder_inbox_messages(
 id,sender_email,recipient_agent_id,kind,instruction,status)
 values (p_message_id,p_actor_email,p_agent_id,p_kind,v_body,'RECORDED_NOT_ROUTED')
 returning * into v_record;
 return jsonb_build_object('outcome','RECORDED','message',jsonb_build_object(
  'messageId',v_record.id,'recipientAgentId',v_record.recipient_agent_id,
  'kind',v_record.kind,'instruction',v_record.instruction,'status',v_record.status,
  'createdAt',v_record.created_at));
end; $$;

create or replace function public.vaos_founder_inbox_list(
 p_server_key text,p_actor_email text,p_agent_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_messages jsonb;
begin
 perform vaos_private.assert_server_key(p_server_key);
 if p_actor_email <> 'shyamsundhar1982@gmail.com'
    or p_agent_id is null
    or not exists (select 1 from vaos_private.digital_employees where id=p_agent_id)
 then raise exception 'FOUNDER_INBOX_INVALID'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'messageId',m.id,'recipientAgentId',m.recipient_agent_id,'kind',m.kind,
  'instruction',m.instruction,'status',m.status,'createdAt',m.created_at)
 order by m.created_at desc,m.id desc),'[]'::jsonb)
 into v_messages
 from (select * from vaos_private.founder_inbox_messages
       where sender_email=p_actor_email and recipient_agent_id=p_agent_id
       order by created_at desc,id desc limit 30) m;
 return jsonb_build_object('messages',v_messages,'routed',false);
end; $$;

revoke all on function public.vaos_founder_inbox_append(text,uuid,text,text,text,text)
 from public,anon,authenticated;
revoke all on function public.vaos_founder_inbox_list(text,text,text)
 from public,anon,authenticated;
grant execute on function public.vaos_founder_inbox_append(text,uuid,text,text,text,text) to service_role;
grant execute on function public.vaos_founder_inbox_list(text,text,text) to service_role;
