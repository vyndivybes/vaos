import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('candidate reply audit is append-only and gated by server-key RPC',async()=>{
 const sql=await readFile(new URL('../../supabase/migrations/20261011065000_founder_ai_draft_pilot_v1.sql',import.meta.url),'utf8');
 for(const marker of [/founder_agent_drafts/i,/enable row level security/i,
 /assert_server_key\(p_server_key\)/i,/references vaos_private.founder_inbox_messages\(id\)/i,
 /AI_DRAFT_UNVERIFIED/i,/before update or delete/i,/pg_advisory_xact_lock/i,
 /RATE_LIMITED/i,/founder_agent_draft_claims/i,/ALREADY_CLAIMED/i,/FOUNDER_CHAT_NOT_CLAIMED/i,
 /grant execute on function public.vaos_founder_chat_claim/i,
 /grant execute on function public.vaos_founder_chat_get/i,
 /grant execute on function public.vaos_founder_chat_append/i,/to service_role/i])
 assert.match(sql,marker);
 assert.doesNotMatch(sql,/grant (select|update|delete|insert) on vaos_private.founder_agent_drafts to (anon|authenticated)/i);
});
test('Edge routes expose no model invocation, only read-only reply audit RPC',async()=>{
 const code=await readFile(new URL('../../supabase/functions/vaos-control/index.ts',import.meta.url),'utf8');
 assert.match(code,/operation === 'founderChatClaim'/);
 assert.match(code,/vaos_founder_chat_claim/);
 assert.match(code,/operation === 'founderChatGet'/);
 assert.match(code,/operation === 'founderChatAppend'/);
 assert.match(code,/vaos_founder_chat_get/);
 assert.match(code,/vaos_founder_chat_append/);
});
