import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../../supabase/migrations/20261008080000_remaining_q2_agents_v1.sql',
  import.meta.url,
);
const edgeUrl = new URL(
  '../../supabase/functions/vaos-control/index.ts',
  import.meta.url,
);
const workspaceUrl = new URL(
  '../../apps/web/lib/workspace-model.mjs',
  import.meta.url,
);

test('remaining Q2 migration defines Release recommendation evidence and Knowledge governed links', async () => {
  const [sql, edge, workspace] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(edgeUrl, 'utf8'),
    readFile(workspaceUrl, 'utf8'),
  ]);

  assert.match(sql, /RELEASE_Q2_RELEASE_ASSURANCE_V1/);
  assert.match(sql, /RELEASE_ASSURANCE/);
  assert.match(sql, /prepared_release_gate_observations/);
  assert.match(sql, /distinct_release_gate_resources/);
  assert.match(sql, /fail_closed_release_denial/);
  assert.match(sql, /KNOWLEDGE_Q2_TRACEABILITY_GOVERNANCE_V1/);
  assert.match(sql, /KNOWLEDGE_TRACEABILITY_GOVERNANCE/);
  assert.match(sql, /verified_knowledge_links/);
  assert.match(sql, /distinct_knowledge_link_resources/);
  assert.match(sql, /human_approved_knowledge_links/);
  assert.match(sql, /fail_closed_knowledge_denial/);
  assert.match(sql, /vaos_link_knowledge_qualification/);
  assert.match(sql, /vaos_get_knowledge_qualification_link/);
  assert.match(edge, /vaos_assess_release_q2_qualification/);
  assert.match(edge, /vaos_assess_knowledge_q2_qualification/);
  assert.match(workspace, /RELEASE_Q2_RELEASE_ASSURANCE_V1/);
  assert.match(workspace, /KNOWLEDGE_Q2_TRACEABILITY_GOVERNANCE_V1/);
});
