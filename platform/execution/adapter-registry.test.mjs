import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecutionAdapterRegistry } from './adapter-registry.mjs';

test('registry resolves only explicitly supported governed effects', async () => {
  const registry = createExecutionAdapterRegistry();
  assert.equal(registry.has('QA.OPEN_CAPA'), true);
  assert.equal(registry.has('ENGINEERING.BASELINE_CHANGE'), true);
  assert.equal(registry.has('PROJECT.ESCALATE_RISK'), true);
  assert.equal(registry.has('FINANCE.PAY_INVOICE'), false);
});

test('QA adapter produces deterministic effect and verification evidence', async () => {
  const registry = createExecutionAdapterRegistry();
  const adapter = registry.get('QA.OPEN_CAPA');
  const result = await adapter.execute({
    jobId: 'job-1',
    intentId: 'intent-1',
    actionType: 'QA.OPEN_CAPA',
    payload: { capaId: 'CAPA-024' },
  });

  assert.equal(result.adapterId, 'internal-ledger.qa-capa.v1');
  assert.deepEqual(result.effect, {
    effectType: 'QUALITY.CAPA_OPENED',
    resourceType: 'CAPA',
    resourceId: 'CAPA-024',
    state: 'OPEN',
  });
  assert.equal(result.verification.verified, true);
  assert.equal(result.verification.resourceId, 'CAPA-024');
});

test('adapter refuses malformed payload instead of inventing a resource id', async () => {
  const registry = createExecutionAdapterRegistry();
  const adapter = registry.get('QA.OPEN_CAPA');
  await assert.rejects(
    () => adapter.execute({ jobId: 'job-1', intentId: 'intent-1', actionType: 'QA.OPEN_CAPA', payload: {} }),
    /ADAPTER_PAYLOAD_INVALID/,
  );
});
