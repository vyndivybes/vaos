import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../../supabase/migrations/20261008072000_project_q2_project_controls_v1.sql',
  import.meta.url,
);
const edgeUrl = new URL(
  '../../supabase/functions/vaos-control/index.ts',
  import.meta.url,
);

test('Project Controls Q2 migration aligns authority and defines project-risk assessor', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /where id='project'/i);
  assert.match(sql, /PROJECT\.ESCALATE_RISK/);
  assert.match(sql, /PROJECT_Q2_PROJECT_CONTROLS_V1/);
  assert.match(sql, /PROJECT_RISK_CONTROL/);
  assert.match(sql, /verified_project_risk_effects/);
  assert.match(sql, /distinct_project_risk_resources/);
  assert.match(sql, /human_approved_project_actions/);
  assert.match(sql, /fail_closed_project_denial/);
  assert.match(sql, /vaos_assess_project_q2_qualification/);
});

test('Project Controls Q2 assessment is explicitly routed to its dedicated RPC', async () => {
  const edge = await readFile(edgeUrl, 'utf8');
  assert.match(edge, /PROJECT_Q2_PROJECT_CONTROLS_V1/);
  assert.match(edge, /vaos_assess_project_q2_qualification/);
});
