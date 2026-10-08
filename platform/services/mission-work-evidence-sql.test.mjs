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
