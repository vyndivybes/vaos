import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

test('risk screen is allowlisted in all DB gates with service-key and immutable evidence requirements', async () => {
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  const names = (await readdir(dir)).filter(p => p.endsWith('_risk_mission_blocker_screen_v1.sql'));
  assert.equal(names.length, 1);
  const sql = await readFile(new URL(names[0], dir), 'utf8');
  for (const name of [
    'vaos_record_handoff_work_evidence',
    'vaos_list_runnable_missions',
    'vaos_prepare_operating_mission_closure',
  ]) assert.ok(sql.includes('create or replace function public.' + name));
  assert.equal(sql.split("'RISK.IDENTIFY'").length - 1, 3);
  assert.ok(sql.includes('assert_server_key(p_server_key)'));
  assert.ok(sql.includes('report_sha256'));
  assert.ok(sql.includes('verified_by_agent_id'));
  assert.ok(sql.includes('revoke all on function public.vaos_record_handoff_work_evidence'));
  assert.ok(sql.includes('grant execute on function public.vaos_record_handoff_work_evidence'));
  assert.ok(sql.includes('to service_role'));
  assert.equal(sql.includes('grant execute on function public.vaos_record_handoff_work_evidence(text,text,integer,text,jsonb)\n  to anon'), false);
});
