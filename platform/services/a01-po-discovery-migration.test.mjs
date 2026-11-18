import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../../supabase/migrations/20261118204000_a01_po_runnable_discovery_v1.sql',import.meta.url),'utf8');
const active=source.split('-- A01-only active observation admission')[1]?.split('-- Independent-closure rule')[0];
const closure=source.split('-- Independent-closure rule')[1];

test('A01 PO live read is reachable only through a named founder-mission and procurement guard',()=>{
  assert.ok(active,'A01 bounded active-read branch must exist');
  assert.match(active,/m\.id='JARVIS-A01-20261118'/);
  assert.match(active,/h\.requested_job='PROCUREMENT\.OBSERVE_OPEN_POS'/);
  assert.match(active,/h\.to_agent_id='procurement'/);
  assert.match(active,/wp\.action_type='PROCUREMENT\.OBSERVE_OPEN_POS'/);
  assert.match(active,/wp\.authority=5/);
  assert.match(active,/wp\.execution_mode='ANALYSE'/);
  assert.match(active,/wp\.human_approval_required=false/);
  assert.match(active,/d\.qualification_level>=wp\.minimum_qualification_level/);
  assert.match(active,/d\.status='ACTIVE'/);
});

test('a completed A01 PO observation must not enter automatic business-source closure',()=>{
  assert.ok(closure,'independent closure branch must be isolated');
  assert.doesNotMatch(closure,/['"]PROCUREMENT\.OBSERVE_OPEN_POS['"]/);
  assert.match(closure,/remaining\.status <> 'COMPLETED'/);
  assert.match(closure,/verified\.verified_by_agent_id <> verified\.to_agent_id/);
});

test('server-key, bounded discovery, RLS boundary and service-only RPC remain fail-closed',()=>{
  assert.match(source,/perform vaos_private\.assert_server_key\(p_server_key\)/);
  assert.match(source,/p_limit < 1 or p_limit > 8/);
  assert.match(source,/security definer/i);
  assert.match(source,/set search_path\s*(?:to|=)\s*''/i);
  assert.match(source,/revoke all on function public\.vaos_list_runnable_missions\(text,integer\) from public, anon, authenticated/i);
  assert.match(source,/grant execute on function public\.vaos_list_runnable_missions\(text,integer\) to service_role/i);
  assert.doesNotMatch(source,/insert into|update vaos_private|delete from vaos_private/i);
});
