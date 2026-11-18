import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SAFE_MISSION_JOBS} from '../execution/mission-consumer.mjs';
import {getVyndiBridgeRoute} from '../../packages/contracts/vyndi-write-bridge.mjs';

const sql=readFileSync(new URL('../../supabase/migrations/20261118214500_signed_read_closure_evidence_v1.sql',import.meta.url),'utf8');

test('mission closure requires immutable report for every commissioned signed departmental read',()=>{
  const guard=sql.split('wp.action_type not in (')[1]?.split(')')[0];
  assert.ok(guard,'allowlisted action classification present');
  const commissioned=SAFE_MISSION_JOBS.filter(a=>{
    const r=getVyndiBridgeRoute(a);
    return r?.effectClass==='read'&&r?.executionEnabled===true&&r?.state==='READ_READY';
  });
  assert.ok(commissioned.length>=8,'missing signed-read contracts');
  const missing=commissioned.filter(a=>!guard.includes("'"+a+"'"));
  assert.deepEqual(missing,[],'signed reads must never bypass immutable evidence check');
  assert.match(sql,/from vaos_private\.handoff_work_evidence we/);
  assert.match(sql,/we\.report_sha256\s*=\s*encode\(extensions\.digest\(convert_to\(we\.report::text,'UTF8'\),'sha256'\),'hex'\)/);
  assert.match(sql,/we\.author_agent_id=h\.to_agent_id/);
  assert.match(sql,/\('REVIEWED:'\|\|we\.evidence_id\)=any\(ve\.evidence_refs\)/);
});
test('mission closure remains separate from certification and effectful business release',()=>{
  assert.match(sql,/vaos_private\.assert_server_key\(p_server_key\)/);
  assert.match(sql,/security definer/i);
  assert.match(sql,/set search_path\s*(?:to|=)\s*''/i);
  assert.match(sql,/MISSION_CLOSURE_NOT_READY/);
  assert.match(sql,/status='READY_FOR_CLOSURE'/);
  assert.match(sql,/'requiresHumanApproval',true/);
  assert.match(sql,/revoke all on function public\.vaos_prepare_operating_mission_closure\(text,text\)/i);
  assert.match(sql,/grant execute on function public\.vaos_prepare_operating_mission_closure\(text,text\) to service_role/i);
  assert.doesNotMatch(sql,/productionWriteAuthorized.?=.?(?:true)|sourceCompletenessVerified.?=.?(?:true)|PROCUREMENT\.CREATE_PO|FINANCE\.POST_LEDGER/);
});
