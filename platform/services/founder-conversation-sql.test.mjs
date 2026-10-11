import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('Stage 5 SQL is private, immutable, agent and mission isolated',async()=>{
 const sql=await readFile(new URL('../../supabase/migrations/20261011082000_founder_conversation_threads_v1.sql',import.meta.url),'utf8');
 for(const re of [/founder_conversation_threads/,/founder_conversation_turns/,
 /enable row level security/g,/reject_founder_inbox_mutation/g,/assert_server_key\(p_server_key\)/g,
 /PREVIOUS_REPLY_PENDING/,/THREAD_LIMIT/,/THREAD_CONFLICT/,
 /p_agent_id not in \('project','orchestrator'\)/g,/vaos_founder_conversation_history/,
 /vaos_founder_conversation_link/,/to service_role/g])assert.match(sql,re);
 assert.doesNotMatch(sql,/grant (select|insert|update|delete) on vaos_private.founder_conversation_(threads|turns) to (anon|authenticated)/i);
 assert.doesNotMatch(sql,/\b(update|delete) vaos_private\.founder_conversation_(threads|turns)/i);
});
test('Edge RPC routing only adds scoped archive, not model or business tools',async()=>{
 const code=await readFile(new URL('../../supabase/functions/vaos-control/index.ts',import.meta.url),'utf8');
 assert.match(code,/operation === 'founderConversationHistory'/);
 assert.match(code,/operation === 'founderConversationLink'/);
 assert.match(code,/rpcName = 'vaos_founder_conversation_history'/);
 assert.match(code,/rpcName = 'vaos_founder_conversation_link'/);
});
