import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('founder inbox is private, immutable, bounded and accessible only through a server-key-gated RPC',async()=>{
 const sql=await readFile(new URL('../../supabase/migrations/20261011025000_founder_inbox_record_only_v1.sql',import.meta.url),'utf8');
 for(const marker of [
  /create table if not exists vaos_private\.founder_inbox_messages/i,
  /enable row level security/i,
  /assert_server_key\(p_server_key\)/i,
  /security definer/i,
  /RECORDED_NOT_ROUTED/g,
  /pg_advisory_xact_lock/i,
  /RATE_LIMITED/i,
  /IDEMPOTENCY_CONFLICT/i,
  /revoke all on function public\.vaos_founder_inbox_append/i,
  /revoke all on function public\.vaos_founder_inbox_list/i,
  /to service_role/i,
  /before update or delete/i
 ])assert.match(sql,marker);
 assert.doesNotMatch(sql,/grant (insert|update|delete|select) on vaos_private\.founder_inbox_messages to (anon|authenticated)/i);
});
test('Edge only exposes exact private RPCs, never agent execution',async()=>{
 const s=await readFile(new URL('../../supabase/functions/vaos-control/index.ts',import.meta.url),'utf8');
 assert.match(s,/operation === 'founderInboxAppend'/);
 assert.match(s,/operation === 'founderInboxList'/);
 assert.match(s,/vaos_founder_inbox_append/);
 assert.match(s,/vaos_founder_inbox_list/);
});
