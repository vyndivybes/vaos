import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

async function evidenceMigration() {
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  const found = (await readdir(dir)).filter((name) => name.endsWith('_mission_work_evidence_v1.sql'));
  assert.equal(found.length, 1);
  return readFile(new URL(found[0], dir), 'utf8');
}

test('mission findings are durable private and immutable with unique version replay', async () => {
  const sql = await evidenceMigration();
  assert.match(sql,/create table if not exists vaos_private\.handoff_work_evidence/i);
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/unique\s*\(handoff_id, handoff_version\)/i);
  assert.match(sql,/report jsonb not null/i);
  assert.match(sql,/report_sha256 text not null/i);
  assert.match(sql,/revoke all on table vaos_private\.handoff_work_evidence/i);
  assert.match(sql,/MISSION_EVIDENCE_IDEMPOTENCY_CONFLICT/i);
});

test('evidence writer enforces active accepted ownership, safe job allowlist and no external table grants', async () => {
  const sql = await evidenceMigration();
  for (const fn of ['vaos_record_handoff_work_evidence','vaos_get_handoff_work_evidence','vaos_list_runnable_missions']) {
    assert.match(sql,new RegExp('create or replace function public\\.'+fn));
    assert.match(sql,new RegExp('revoke all on function public\\.'+fn));
    assert.match(sql,new RegExp('grant execute on function public\\.'+fn));
  }
  assert.match(sql,/perform vaos_private\.assert_server_key\(p_server_key\)/i);
  assert.match(sql,/HANDOFF_EVIDENCE_OWNER_MISMATCH/i);
  assert.match(sql,/HANDOFF_EVIDENCE_STATUS_INVALID/i);
  assert.match(sql,/PROJECT\.TRACK_DEPENDENCY/i);
  assert.match(sql,/KNOWLEDGE\.DETECT_GAP/i);
  assert.match(sql,/RELEASE\.CHECK_OPEN_ITEMS/i);
  assert.match(sql,/HANDOFF_EVIDENCE_ACTION_NOT_PERMITTED/i);
  assert.match(sql,/to service_role/i);
});

test('Edge control routes evidence and runnable mission operations to service-key RPCs', async () => {
  const edge = await readFile(new URL('../../supabase/functions/vaos-control/index.ts', import.meta.url),'utf8');
  for (const [op,fn] of [
    ['recordOperatingWorkEvidence','vaos_record_handoff_work_evidence'],
    ['getOperatingWorkEvidence','vaos_get_handoff_work_evidence'],
    ['listRunnableMissions','vaos_list_runnable_missions'],
  ]) {
    assert.match(edge, new RegExp('operation === '+String.raw`'`+op+String.raw`'`));
    assert.match(edge, new RegExp('rpcName = '+String.raw`'`+fn+String.raw`'`));
  }
});


test('handoff execution and verification require currently qualified active actors', async () => {
  const sql = await evidenceMigration();
  assert.match(sql,/create or replace function vaos_private\.assert_current_handoff_actor/i);
  assert.match(sql,/create trigger handoff_actor_requalification_guard/i);
  assert.match(sql,/HANDOFF_ACTOR_REQUALIFICATION_REQUIRED/i);
  assert.match(sql,/VERIFY','REJECT_VERIFICATION/i);
  assert.match(sql,/qualification_level/i);
  assert.match(sql,/responsibility_contracts/i);
});


test('G4 departmental read migration retains exact action allowlists, Q floors and private signed evidence',async()=>{
 const sql=await readFile(new URL('../../supabase/migrations/20261015110000_g4_departmental_read_handoffs_v1.sql',import.meta.url),'utf8');
 for(const action of [
  'COMMERCIAL.OBSERVE_PIPELINE','PROCUREMENT.OBSERVE_SHORTAGE','INVENTORY.OBSERVE_STOCK',
  'PRODUCTION.OBSERVE_WIP','MAINTENANCE.OBSERVE_ASSET','FINANCE.OBSERVE_LEDGER',
  'PEOPLE.OBSERVE_WORKFORCE','ENGINEERING.OBSERVE_CONFIGURATION',
  'ENGINEERING.ASSESS_REQUIREMENT','QA.AUDIT_EVIDENCE','SECURITY.ASSESS_ACCESS']){
  assert.ok(sql.includes("'"+action+"'"),action);
 }
 assert.match(sql,/requestBodySha256/);
 assert.match(sql,/HANDOFF_EVIDENCE_REPORT_INVALID/);
 assert.match(sql,/v_work\.authority <> 5/);
 assert.match(sql,/v_work\.human_approval_required/);
 assert.match(sql,/v_work\.execution_mode <> 'ANALYSE'/);
 assert.match(sql,/create or replace function vaos_private\.assert_current_handoff_actor/i);
 assert.match(sql,/when 'finance' then 4/);
 assert.match(sql,/when 'engineering-configuration' then 4/);
 assert.match(sql,/else 99/);
 assert.match(sql,/from public,anon,authenticated/);
 assert.match(sql,/to service_role/);
 assert.doesNotMatch(sql,/grant execute .* to (anon|authenticated)/i);
});
