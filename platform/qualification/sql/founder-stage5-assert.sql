-- Real disposable PostgreSQL 17 qualification; never run against production.
insert into vaos_private.founder_inbox_messages
(id,sender_email,recipient_agent_id,kind,instruction,status) values
('00000000-0000-4000-8000-000000000101','shyamsundhar1982@gmail.com','project','REPORT_REQUEST','Mission MISSION-0001. Check evidence','RECORDED_NOT_ROUTED'),
('00000000-0000-4000-8000-000000000102','shyamsundhar1982@gmail.com','project','REPORT_REQUEST','Mission MISSION-0001. Check blockers','RECORDED_NOT_ROUTED'),
('00000000-0000-4000-8000-000000000103','shyamsundhar1982@gmail.com','finance','INSTRUCTION','Mission MISSION-0001. Execute writes','RECORDED_NOT_ROUTED');
do $test$
declare v jsonb; v_history jsonb;
begin
 if not (select relrowsecurity from pg_class where oid='vaos_private.founder_conversation_threads'::regclass)
  or not (select relrowsecurity from pg_class where oid='vaos_private.founder_conversation_turns'::regclass)
 then raise exception 'STAGE5_RLS_DISABLED';end if;
 if has_table_privilege('anon','vaos_private.founder_conversation_threads','SELECT')
 or has_table_privilege('authenticated','vaos_private.founder_conversation_turns','SELECT')
 or has_function_privilege('anon','public.vaos_founder_conversation_link(text,text,text,text,uuid,uuid)','EXECUTE')
 or not has_function_privilege('service_role','public.vaos_founder_conversation_history(text,text,text,text)','EXECUTE')
 then raise exception 'STAGE5_ACL_BROKEN';end if;
 begin
  perform public.vaos_founder_conversation_history('bad-key','shyamsundhar1982@gmail.com','project','MISSION-0001');
  raise exception 'INVALID_KEY_ACCEPTED';
 exception when sqlstate '28000' then null;end;
 v_history:=public.vaos_founder_conversation_history('synthetic-test-server-key','shyamsundhar1982@gmail.com','project','MISSION-0001');
 if v_history->'turns' <> '[]'::jsonb or v_history->>'threadId' is not null then raise exception 'UNINITIALIZED_THREAD_DISCLOSED';end if;
 v:=public.vaos_founder_conversation_link('synthetic-test-server-key','shyamsundhar1982@gmail.com','project','MISSION-0001',
 '00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101');
 if v->>'outcome'<>'LINKED' then raise exception 'FIRST_TURN_FAILED: %',v;end if;
 v:=public.vaos_founder_conversation_link('synthetic-test-server-key','shyamsundhar1982@gmail.com','project','MISSION-0001',
 '00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101');
 if v->>'outcome'<>'REPLAY' then raise exception 'REPLAY_FAILED: %',v;end if;
 v:=public.vaos_founder_conversation_link('synthetic-test-server-key','shyamsundhar1982@gmail.com','project','MISSION-0001',
 '00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000102');
 if v->>'outcome'<>'PREVIOUS_REPLY_PENDING' then raise exception 'PENDING_TURN_ADMITTED: %',v;end if;
 v:=public.vaos_founder_conversation_link('synthetic-test-server-key','shyamsundhar1982@gmail.com','project','MISSION-0001',
 '00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000102');
 if v->>'outcome'<>'THREAD_CONFLICT' then raise exception 'CROSS_THREAD_ADMITTED';end if;
 begin
  perform public.vaos_founder_conversation_link('synthetic-test-server-key','shyamsundhar1982@gmail.com','finance','MISSION-0001',
  '00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000103');
  raise exception 'FORBIDDEN_AGENT_ADMITTED';
 exception when others then
  if sqlerrm='FORBIDDEN_AGENT_ADMITTED' then raise;end if;
 end;
 v:=public.vaos_founder_chat_claim('synthetic-test-server-key','00000000-0000-4000-8000-000000000101',
  'shyamsundhar1982@gmail.com','project','MISSION-0001');
 if v->>'outcome'<>'CLAIMED' then raise exception 'STAGE5_MODEL_CLAIM_INVALID';end if;
 v:=public.vaos_founder_chat_append('synthetic-test-server-key','00000000-0000-4000-8000-000000000101',
 'shyamsundhar1982@gmail.com','project','MISSION-0001','Synthetic read-only evidence draft with no execution approval.',
 repeat('a',64),array['synthetic-evidence-1']);
 if v->>'outcome'<>'RECORDED' then raise exception 'STAGE5_MODEL_REPLY_INVALID';end if;
 v:=public.vaos_founder_conversation_link('synthetic-test-server-key','shyamsundhar1982@gmail.com','project','MISSION-0001',
 '00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000102');
 if v->>'outcome'<>'LINKED' or (v->>'sequence')::int<>2 then raise exception 'SECOND_TURN_FAILED: %',v;end if;
 v_history:=public.vaos_founder_conversation_history('synthetic-test-server-key','shyamsundhar1982@gmail.com','project','MISSION-0001');
 if jsonb_array_length(v_history->'turns')<>2 or v_history->'turns'->0->'reply'->>'status'<>'AI_DRAFT_UNVERIFIED'
 or v_history->'turns'->1->'reply'<>'null'::jsonb
 or v_history->'turns'->0->'reply'->>'sourceHash'<>repeat('a',64)
 then raise exception 'HISTORY_INTEGRITY_FAILED: %',v_history;end if;
 if exists(select 1 from vaos_private.founder_conversation_turns where sequence_no>2) then raise exception 'UNEXPECTED_TURNS';end if;
 begin
  update vaos_private.founder_conversation_threads set mission_id='OTHER' where true;
  raise exception 'THREAD_MUTABLE';
 exception when others then
  if sqlerrm='THREAD_MUTABLE' then raise;end if;
 end;
 begin
  delete from vaos_private.founder_conversation_turns;
  raise exception 'TURN_MUTABLE';
 exception when others then
  if sqlerrm='TURN_MUTABLE' then raise;end if;
 end;
end $test$;
select 'STAGE5_IMMUTABLE_MULTITURN_QUALIFICATION_PASS' as status;
