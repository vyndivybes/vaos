import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('database handoff state machine refuses owner COMPLETE and records independent verification', async () => {
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  const names = (await readdir(dir)).filter((name) => name.endsWith('_handoff_independent_verification_v1.sql'));
  assert.equal(names.length, 1);
  const sql = await readFile(new URL(names[0], dir), 'utf8');
  assert.match(sql, /SUBMITTED/i);
  assert.match(sql, /p_outcome='SUBMIT'/);
  assert.match(sql, /p_outcome='VERIFY'/);
  assert.match(sql, /p_outcome='REJECT_VERIFICATION'/);
  assert.match(sql, /HANDOFF_VERIFIER_NOT_AUTHORIZED/i);
  assert.match(sql, /HANDOFF_SUBMISSION_EVIDENCE_REQUIRED/i);
  assert.match(sql, /HANDOFF_VERIFICATION_EVIDENCE_REQUIRED/i);
  assert.match(sql, /verified_by_agent_id/i);
  assert.doesNotMatch(sql, /status='ACCEPTED' and p_outcome='COMPLETE'/i);
  assert.match(sql, /perform vaos_private\.assert_server_key\(p_server_key\)/);
  assert.match(sql, /revoke all on function public\.vaos_transition_operating_handoff/i);
});
