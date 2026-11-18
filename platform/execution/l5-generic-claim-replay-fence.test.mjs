import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql=readFileSync(new URL('../../supabase/migrations/20261118213713_l5_generic_claim_replay_fence_v1.sql',import.meta.url),'utf8');
const scope=/and not \(action_type='PRODUCTION\.OBSERVE_WIP'\s*and payload->>'monitoringScope'='PRODUCTION_L5_READ_ONLY_V1'\)/gi;

test('generic claim excludes every scoped L5 job including pending, failed, and expired lease',()=>{
  const matches=[...sql.matchAll(scope)];
  assert.equal(matches.length,2,'both expired-lease cleanup and claim selection must be fenced');
  const expiry=sql.indexOf("where status='LEASED'");
  const claim=sql.indexOf("select * into v_job");
  assert.ok(expiry>0&&claim>expiry);
  assert.match(sql.slice(expiry,claim),new RegExp(scope.source,'i'));
  assert.match(sql.slice(claim),new RegExp(scope.source,'i'));
  assert.match(sql,/status in \('PENDING','FAILED'\)/);
  assert.match(sql,/attempt_count < max_attempts/);
  assert.match(sql,/for update skip locked/i);
});

test('dedicated production L5 claim remains distinct; no automatic retry or permission promotion',()=>{
  const existing=readFileSync(new URL('../../supabase/migrations/20261010180000_production_l5_scoped_claim.sql',import.meta.url),'utf8');
  assert.match(existing,/PRODUCTION\.OBSERVE_WIP/);
  assert.match(existing,/status='PENDING'/i);
  assert.match(sql,/assert_server_key\(p_server_key\)/);
  assert.match(sql,/security definer/i);
  assert.match(sql,/revoke all on function public\.vaos_claim_execution\(text,text,integer\)/i);
  assert.match(sql,/grant execute on function public\.vaos_claim_execution\(text,text,integer\) to service_role/i);
  assert.doesNotMatch(sql,/insert into vaos_private\.execution_jobs|update vaos_private\.intents|PRODUCTION\.CREATE_JOB|PROCUREMENT\.CREATE_PO/i);
});
