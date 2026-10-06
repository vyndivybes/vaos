import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecutionAdapterRegistry } from './adapter-registry.mjs';

test('registry resolves only explicitly supported governed effects', () => {
  const registry = createExecutionAdapterRegistry();
  assert.equal(registry.has('QA.OPEN_CAPA'), true);
  assert.equal(registry.has('ENGINEERING.BASELINE_CHANGE'), true);
  assert.equal(registry.has('PROJECT.ESCALATE_RISK'), true);
  assert.equal(registry.has('FINANCE.PAY_INVOICE'), false);
});

test('QA adapter persists a durable CAPA record and verifies it from the domain store', async () => {
  const calls = [];
  const qaCapa = {
    async openCapa(job, input) {
      calls.push({ operation: 'open', job, input });
      return {
        outcome: 'CREATED',
        record: {
          capaId: input.capaId,
          status: 'OPEN',
          executionJobId: job.id,
          intentId: job.intentId,
        },
      };
    },
    async getCapa(job, capaId) {
      calls.push({ operation: 'read', job, capaId });
      return {
        capaId,
        status: 'OPEN',
        executionJobId: job.id,
        intentId: job.intentId,
      };
    },
  };

  const registry = createExecutionAdapterRegistry({ qaCapa });
  const adapter = registry.get('QA.OPEN_CAPA');
  const result = await adapter.execute({
    id: 'job-1',
    intentId: 'intent-1',
    actionType: 'QA.OPEN_CAPA',
    payload: { capaId: 'CAPA-024' },
  });

  assert.equal(result.adapterId, 'supabase.qa-capa.v1');
  assert.deepEqual(result.effect, {
    effectType: 'QUALITY.CAPA_OPENED',
    resourceType: 'CAPA',
    resourceId: 'CAPA-024',
    state: 'OPEN',
    domainOutcome: 'CREATED',
  });
  assert.deepEqual(result.verification, {
    verified: true,
    resourceType: 'CAPA',
    resourceId: 'CAPA-024',
    expectedState: 'OPEN',
    evidenceSource: 'vaos_private.capa_records',
  });
  assert.deepEqual(calls.map((call) => call.operation), ['open', 'read']);
});

test('QA adapter treats a replayed domain write as the same verified CAPA effect', async () => {
  const qaCapa = {
    async openCapa(job, input) {
      return {
        outcome: 'REPLAY',
        record: { capaId: input.capaId, status: 'OPEN', executionJobId: job.id, intentId: job.intentId },
      };
    },
    async getCapa(job, capaId) {
      return { capaId, status: 'OPEN', executionJobId: job.id, intentId: job.intentId };
    },
  };

  const result = await createExecutionAdapterRegistry({ qaCapa }).get('QA.OPEN_CAPA').execute({
    id: 'job-2',
    intentId: 'intent-2',
    actionType: 'QA.OPEN_CAPA',
    payload: { capaId: 'CAPA-025' },
  });

  assert.equal(result.effect.domainOutcome, 'REPLAY');
  assert.equal(result.verification.verified, true);
});

test('QA adapter fails closed when no durable QA/CAPA domain port is configured', async () => {
  const adapter = createExecutionAdapterRegistry().get('QA.OPEN_CAPA');
  await assert.rejects(
    () => adapter.execute({
      id: 'job-1',
      intentId: 'intent-1',
      actionType: 'QA.OPEN_CAPA',
      payload: { capaId: 'CAPA-024' },
    }),
    /DOMAIN_PORT_REQUIRED:qaCapa/,
  );
});

test('QA adapter rejects a mismatched durable readback instead of fabricating verification', async () => {
  const qaCapa = {
    async openCapa(job, input) {
      return {
        outcome: 'CREATED',
        record: { capaId: input.capaId, status: 'OPEN', executionJobId: job.id, intentId: job.intentId },
      };
    },
    async getCapa(job, capaId) {
      return { capaId, status: 'CLOSED', executionJobId: job.id, intentId: job.intentId };
    },
  };

  const adapter = createExecutionAdapterRegistry({ qaCapa }).get('QA.OPEN_CAPA');
  await assert.rejects(
    () => adapter.execute({
      id: 'job-3',
      intentId: 'intent-3',
      actionType: 'QA.OPEN_CAPA',
      payload: { capaId: 'CAPA-026' },
    }),
    /CAPA_VERIFICATION_MISMATCH/,
  );
});

test('QA adapter refuses malformed payload before touching the domain store', async () => {
  let touched = false;
  const qaCapa = {
    async openCapa() { touched = true; },
    async getCapa() { touched = true; },
  };
  const adapter = createExecutionAdapterRegistry({ qaCapa }).get('QA.OPEN_CAPA');
  await assert.rejects(
    () => adapter.execute({ id: 'job-1', intentId: 'intent-1', actionType: 'QA.OPEN_CAPA', payload: {} }),
    /ADAPTER_PAYLOAD_INVALID:capaId/,
  );
  assert.equal(touched, false);
});
