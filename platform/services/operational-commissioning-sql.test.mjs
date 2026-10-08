import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../../supabase/migrations/20261008093000_operational_commissioning_v1.sql',
  import.meta.url,
);
const edgeUrl = new URL(
  '../../supabase/functions/vaos-control/index.ts',
  import.meta.url,
);
const workerUrl = new URL(
  '../../apps/web/cloudflare-worker.mjs',
  import.meta.url,
);
const storeUrl = new URL(
  '../persistence/supabase-store.mjs',
  import.meta.url,
);
const routerUrl = new URL(
  '../../apps/web/command-router.mjs',
  import.meta.url,
);
const workspaceUrl = new URL(
  '../../apps/web/workspace.mjs',
  import.meta.url,
);

test('operational commissioning migration backfills immutable Wave-1 live evidence without activating providers', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const provider of ['playwright','node-red','opentelemetry']) {
    assert.match(sql, new RegExp(provider));
  }
  assert.match(sql, /37751740838/);
  assert.match(sql, /8993c903dfd5d0e76c59268889e1e54964811a68/);
  assert.match(sql, /ephemeral-live/);
  assert.match(sql, /provider_qualification_evidence/);
  assert.doesNotMatch(sql, /set\s+enabled\s*=\s*true/i);
  assert.doesNotMatch(sql, /provider_state_put/i);
});

test('operational commissioning snapshot proves workforce, evidence, queues, traceability and locked automation fabric', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /create or replace function public\.vaos_operational_commissioning_snapshot/i);
  for (const criterion of [
    'workforce_active',
    'qualification_floor',
    'contracts_linked',
    'governed_activity',
    'verified_execution_evidence',
    'release_recommendation_evidence',
    'approval_queue_clear',
    'execution_queue_clear',
    'cross_domain_traceability',
    'provider_wave1_live_evidence',
    'provider_routing_locked',
    'reconciliation_queue_clear',
    'callback_queue_clear',
  ]) assert.match(sql, new RegExp(criterion));
  assert.match(sql, /COMMISSIONED/);
  assert.match(sql, /READY_LOCKED/);
  assert.match(sql, /perform vaos_private\.assert_server_key\(p_server_key\)/i);
  assert.match(sql, /revoke all on function public\.vaos_operational_commissioning_snapshot\(text\)/i);
  assert.match(sql, /grant execute on function public\.vaos_operational_commissioning_snapshot\(text\)\s+to service_role/i);
});

test('commissioning snapshot is routed through Edge, authenticated API, store and VAOS command surface', async () => {
  const [edge, worker, store, router, workspace] = await Promise.all([
    readFile(edgeUrl, 'utf8'),
    readFile(workerUrl, 'utf8'),
    readFile(storeUrl, 'utf8'),
    readFile(routerUrl, 'utf8'),
    readFile(workspaceUrl, 'utf8'),
  ]);
  assert.match(edge, /operation === 'operationalCommissioningSnapshot'/);
  assert.match(edge, /vaos_operational_commissioning_snapshot/);
  assert.match(worker, /'\/api\/commissioning'/);
  assert.match(store, /operationalCommissioningSnapshot\(\)/);
  assert.equal(router.includes('commissioning\\s+status'), true);
  assert.match(workspace, /resolved\.kind === 'commissioning'/);
  assert.match(workspace, /fetch\('\/api\/commissioning'/);
});
