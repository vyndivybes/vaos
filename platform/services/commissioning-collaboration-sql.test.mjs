import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

async function collaborationMigration() {
  const migrationsDir = new URL('../../supabase/migrations/', import.meta.url);
  const names = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('_operational_collaboration_handoff_gate_v1.sql'));
  assert.equal(names.length, 1, 'exactly one collaboration handoff migration must exist');
  return readFile(new URL(names[0], migrationsDir), 'utf8');
}

test('operational commissioning explicitly requires 8-of-8 agent handoff coverage', async () => {
  const sql = await collaborationMigration();
  assert.match(sql, /create or replace function public\.vaos_operational_commissioning_snapshot/i);
  assert.match(sql, /'schemaVersion','vaos\.operational-commissioning\.v3'/);
  assert.match(sql, /agent_handoff_coverage/);
  assert.match(sql, /v_collaboration_coverage\s*=\s*8/);
  assert.match(sql, /v_thread_handoff_agents\s*=\s*6/);
  assert.match(sql, /v_orchestrator_handoff_targets\s*=\s*7/);
  assert.match(sql, /v_release_prepared\s*>=\s*2/);
});

test('handoff coverage is derived from execution-bound digital thread lineage and verified orchestrator activations', async () => {
  const sql = await collaborationMigration();
  assert.match(sql, /l\.execution_job_id is not null/);
  assert.match(sql, /WORKFORCE\.ACTIVATE/);
  assert.match(sql, /recovered_evidence|execution_evidence/);
  for (const agent of ['knowledge','project','qa','risk','security','vibpe']) {
    assert.match(sql, new RegExp(agent));
  }
  assert.match(sql, /'threadHandoffAgents'/);
  assert.match(sql, /'orchestratorActivatedPeers'/);
});
