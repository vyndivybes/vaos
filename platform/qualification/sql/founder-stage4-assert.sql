-- Runs only against disposable PostgreSQL 17 service with the Stage 4 migration applied.
do $qual$
declare v jsonb; v_reply jsonb; v_rows int;
begin
 if (select relrowsecurity from pg_class where oid='vaos_private.founder_agent_drafts'::regclass) is distinct from true then
  raise exception 'RLS_DRAFT_MISSING'; end if;
 if (select relrowsecurity from pg_class where oid='vaos_private.founder_agent_draft_claims'::regclass) is distinct from true then
  raise exception 'RLS_CLAIM_MISSING'; end if;
 if has_table_privilege('anon','vaos_private.founder_agent_drafts','SELECT')
    or has_table_privilege('authenticated','vaos_private.founder_agent_draft_claims','SELECT') then
   raise exception 'PRIVATE_TABLE_GRANT_BROKEN'; end if;
 if has_function_privilege('anon','public.vaos_founder_chat_claim(text,uuid,text,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.vaos_founder_chat_append(text,uuid,text,text,text,text,text,text[])','EXECUTE')
    or not has_function_privilege('service_role','public.vaos_founder_chat_claim(text,uuid,text,text,text)','EXECUTE') then
    raise exception 'RPC_ACL_BROKEN'; end if;
 begin
  perform public.vaos_founder_chat_claim('invalid-server-key','00000000-0000-4000-8000-000000000001',
   'shyamsundhar1982@gmail.com','project','MISSION-0001');
  raise exception 'INVALID_KEY_ACCEPTED';
 exception when others then
  if SQLERRM='INVALID_KEY_ACCEPTED' then raise; end if;
  if SQLSTATE <> '28000' then raise; end if;
 end;
 begin
  perform public.vaos_founder_chat_claim('synthetic-test-server-key','00000000-0000-4000-8000-000000000005',
   'shyamsundhar1982@gmail.com','project','MISSION-0001');
  raise exception 'WRONG_KIND_ACCEPTED';
 exception when others then
  if SQLERRM in ('WRONG_KIND_ACCEPTED','MISSION_MISMATCH_ACCEPTED','UNCLAIMED_APPEND_ACCEPTED','DRAFT_IMMUTABILITY_BROKEN','CLAIM_IMMUTABILITY_BROKEN') then raise; end if;
  if SQLSTATE <> 'P0001' then raise; end if;
 end;
 begin
  perform public.vaos_founder_chat_claim('synthetic-test-server-key','00000000-0000-4000-8000-000000000001',
   'shyamsundhar1982@gmail.com','project','MISSION-9999');
  raise exception 'MISSION_MISMATCH_ACCEPTED';
 exception when others then
  if SQLERRM in ('WRONG_KIND_ACCEPTED','MISSION_MISMATCH_ACCEPTED','UNCLAIMED_APPEND_ACCEPTED','DRAFT_IMMUTABILITY_BROKEN','CLAIM_IMMUTABILITY_BROKEN') then raise; end if;
  if SQLSTATE <> 'P0001' then raise; end if;
 end;
 begin
  perform public.vaos_founder_chat_append('synthetic-test-server-key',
   '00000000-0000-4000-8000-000000000002','shyamsundhar1982@gmail.com',
   'project','MISSION-0001','A test draft with independent evidence only.',
   repeat('a',64),array['synthetic-evidence-1']);
  raise exception 'UNCLAIMED_APPEND_ACCEPTED';
 exception when others then
  if SQLERRM in ('WRONG_KIND_ACCEPTED','MISSION_MISMATCH_ACCEPTED','UNCLAIMED_APPEND_ACCEPTED','DRAFT_IMMUTABILITY_BROKEN','CLAIM_IMMUTABILITY_BROKEN') then raise; end if;
  if SQLSTATE <> 'P0001' then raise; end if;
 end;
 v := public.vaos_founder_chat_claim('synthetic-test-server-key','00000000-0000-4000-8000-000000000001',
  'shyamsundhar1982@gmail.com','project','MISSION-0001');
 if v->>'outcome' <> 'CLAIMED' then raise exception 'CLAIM_FAILED: %',v; end if;
 v := public.vaos_founder_chat_claim('synthetic-test-server-key','00000000-0000-4000-8000-000000000001',
  'shyamsundhar1982@gmail.com','project','MISSION-0001');
 if v->>'outcome' <> 'ALREADY_CLAIMED' then raise exception 'DOUBLE_INFERENCE_CLAIMED: %',v; end if;
 v := public.vaos_founder_chat_append('synthetic-test-server-key','00000000-0000-4000-8000-000000000001',
  'shyamsundhar1982@gmail.com','project','MISSION-0001',
  'A test draft with independent evidence only.',repeat('a',64),array['synthetic-evidence-1']);
 if v->>'outcome'<>'RECORDED' or v->'reply'->>'status'<>'AI_DRAFT_UNVERIFIED'
    or v->'reply'->>'model'<>'@cf/zai-org/glm-4.7-flash' then
  raise exception 'APPEND_FAILED: %',v; end if;
 v := public.vaos_founder_chat_append('synthetic-test-server-key','00000000-0000-4000-8000-000000000001',
  'shyamsundhar1982@gmail.com','project','MISSION-0001',
  'A test draft with independent evidence only.',repeat('a',64),array['synthetic-evidence-1']);
 if v->>'outcome'<>'REPLAY' then raise exception 'IDEMPOTENT_REPLAY_FAILED: %',v; end if;
 v := public.vaos_founder_chat_claim('synthetic-test-server-key','00000000-0000-4000-8000-000000000002',
  'shyamsundhar1982@gmail.com','project','MISSION-0001');
 if v->>'outcome'<>'CLAIMED' then raise exception 'SECOND_CLAIM_FAILED: %',v; end if;
 v := public.vaos_founder_chat_claim('synthetic-test-server-key','00000000-0000-4000-8000-000000000003',
  'shyamsundhar1982@gmail.com','project','MISSION-0001');
 if v->>'outcome'<>'CLAIMED' then raise exception 'THIRD_CLAIM_FAILED: %',v; end if;
 v := public.vaos_founder_chat_claim('synthetic-test-server-key','00000000-0000-4000-8000-000000000004',
  'shyamsundhar1982@gmail.com','project','MISSION-0001');
 if v->>'outcome'<>'RATE_LIMITED' then raise exception 'FOURTH_CLAIM_NOT_RATE_LIMITED: %',v; end if;
 begin
  update vaos_private.founder_agent_drafts set content='illegal mutation' where true;
  raise exception 'DRAFT_IMMUTABILITY_BROKEN';
 exception when others then
  if SQLERRM in ('WRONG_KIND_ACCEPTED','MISSION_MISMATCH_ACCEPTED','UNCLAIMED_APPEND_ACCEPTED','DRAFT_IMMUTABILITY_BROKEN','CLAIM_IMMUTABILITY_BROKEN') then raise; end if;
  if SQLSTATE <> 'P0001' then raise; end if;
 end;
 begin
  delete from vaos_private.founder_agent_draft_claims where true;
  raise exception 'CLAIM_IMMUTABILITY_BROKEN';
 exception when others then
  if SQLERRM in ('WRONG_KIND_ACCEPTED','MISSION_MISMATCH_ACCEPTED','UNCLAIMED_APPEND_ACCEPTED','DRAFT_IMMUTABILITY_BROKEN','CLAIM_IMMUTABILITY_BROKEN') then raise; end if;
  if SQLSTATE <> 'P0001' then raise; end if;
 end;
 select count(*) into v_rows from vaos_private.founder_agent_drafts;
 if v_rows <> 1 then raise exception 'UNEXPECTED_DRAFT_ROWS: %',v_rows; end if;
end $qual$;
select 'POSTGRES_STAGE4_SQL_QUALIFICATION_PASS' as status;
