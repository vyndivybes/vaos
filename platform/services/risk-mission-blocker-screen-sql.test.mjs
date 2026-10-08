import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
test('risk mission screen is allowlisted consistently across evidence, discovery and closure', async () => {
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  const names = (await readdir(dir)).filter(p => p.endsWith('_risk_mission_blocker_screen_v1.sql'));
  assert.equal(names.length, 1);
  const sql = await readFile(new URL(names[0],dir),'utf8');
  for (const functionName of [
    'vaos_record_handoff_work_evidence',
    'vaos_list_runnable_missions',
    'vaos_prepare_operating_mission_closure',
  ]) assert.match(sql, new RegExp('create or replace function public\\.' + functionName));
  assert.ok((sql.match(/'RISK\\.IDENTIFY'/g)||[]).length >= 3);
  assert.match(sql, /assert_server_key\\(p_server_key\\)/);
  assert.match(sql, /report_sha256/);
  assert.match(sql, /verified_by_agent_id/);
  assert.match(sql, /revoke all on function public\\.vaos_record_handoff_work_evidence/);
  assert.match(sql, /grant execute on function public\\.vaos_record_handoff_work_evidence[\\s\\S]*to service_role/);
});
