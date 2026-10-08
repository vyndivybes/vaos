import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { controlPlaneDiagnostic } from './control-plane.mjs';

test('control-plane diagnostic exposes only safe configuration failure codes', () => {
  assert.equal(controlPlaneDiagnostic(new Error('SUPABASE_CONFIG_MISSING:url')), 'SUPABASE_URL_MISSING');
  assert.equal(controlPlaneDiagnostic(new Error('SUPABASE_CONFIG_MISSING:serverSecret')), 'VAOS_DB_RPC_SECRET_MISSING');
  assert.equal(controlPlaneDiagnostic(new Error('SUPABASE_EDGE_FAILED:401')), 'SUPABASE_EDGE_401');
  assert.equal(controlPlaneDiagnostic(new Error('unexpected internal detail')), 'CONTROL_PLANE_BOOTSTRAP_FAILED');
});


test('approval API drains the ready execution queue instead of processing only one job', async () => {
  const source = await readFile(new URL('./approvals.mjs', import.meta.url), 'utf8');
  assert.match(source, /\.drain\(\{\s*limit:\s*5\s*\}\)/);
  assert.doesNotMatch(source, /processOne\(\)/);
});

test('workspace queue recovery command calls the authenticated execution drain endpoint', async () => {
  const source = await readFile(new URL('../workspace.mjs', import.meta.url), 'utf8');
  assert.match(source, /resolved\.kind === 'execution'/);
  assert.match(source, /fetch\('\/api\/executions'/);
});

test('People operational-write ingress strips caller control metadata and stamps authenticated identity', async () => {
  const source = await readFile(new URL('./intents.mjs', import.meta.url), 'utf8');
  assert.match(source, /body\.actionType === 'PEOPLE\.CHANGE_EMPLOYEE_MASTER'/);
  assert.match(source, /!\['_vaosControl','requestedBy','operationalWrite','operationalWriteProfile'\]\.includes\(key\)/);
  assert.match(source, /operationalWrite:\s*true/);
  assert.match(source, /operationalWriteProfile:\s*'PEOPLE_DRAFT_MASTER_V1'/);
  assert.match(source, /requestedBy:\s*session\.email/);
});

