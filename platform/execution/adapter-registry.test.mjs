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


test('Engineering adapter persists a durable baseline-change record and verifies it from the domain store', async () => {
  const calls = [];
  const engineeringChange = {
    async recordBaselineChange(job, input) {
      calls.push({ operation: 'record', job, input });
      return {
        outcome: 'CREATED',
        record: {
          baseline: input.baseline,
          status: 'CHANGE_RECORDED',
          executionJobId: job.id,
          intentId: job.intentId,
        },
      };
    },
    async getBaselineChange(job, baseline) {
      calls.push({ operation: 'read', job, baseline });
      return {
        baseline,
        status: 'CHANGE_RECORDED',
        executionJobId: job.id,
        intentId: job.intentId,
      };
    },
  };

  const registry = createExecutionAdapterRegistry({ engineeringChange });
  const adapter = registry.get('ENGINEERING.BASELINE_CHANGE');
  const result = await adapter.execute({
    id: 'job-eng-1',
    intentId: 'intent-eng-1',
    actionType: 'ENGINEERING.BASELINE_CHANGE',
    payload: { baseline: '5.3.9' },
  });

  assert.equal(result.adapterId, 'supabase.engineering-baseline.v1');
  assert.deepEqual(result.effect, {
    effectType: 'ENGINEERING.BASELINE_CHANGE_APPLIED',
    resourceType: 'ENGINEERING_BASELINE',
    resourceId: '5.3.9',
    state: 'CHANGE_RECORDED',
    domainOutcome: 'CREATED',
  });
  assert.deepEqual(result.verification, {
    verified: true,
    resourceType: 'ENGINEERING_BASELINE',
    resourceId: '5.3.9',
    expectedState: 'CHANGE_RECORDED',
    evidenceSource: 'vaos_private.engineering_baseline_changes',
  });
  assert.deepEqual(calls.map((call) => call.operation), ['record', 'read']);
});

test('Engineering adapter treats a replayed domain write as the same verified baseline change', async () => {
  const engineeringChange = {
    async recordBaselineChange(job, input) {
      return {
        outcome: 'REPLAY',
        record: { baseline: input.baseline, status: 'CHANGE_RECORDED', executionJobId: job.id, intentId: job.intentId },
      };
    },
    async getBaselineChange(job, baseline) {
      return { baseline, status: 'CHANGE_RECORDED', executionJobId: job.id, intentId: job.intentId };
    },
  };

  const result = await createExecutionAdapterRegistry({ engineeringChange }).get('ENGINEERING.BASELINE_CHANGE').execute({
    id: 'job-eng-2',
    intentId: 'intent-eng-2',
    actionType: 'ENGINEERING.BASELINE_CHANGE',
    payload: { baseline: '5.4-FK75' },
  });

  assert.equal(result.effect.domainOutcome, 'REPLAY');
  assert.equal(result.verification.verified, true);
});

test('Engineering adapter fails closed when no durable engineering domain port is configured', async () => {
  const adapter = createExecutionAdapterRegistry().get('ENGINEERING.BASELINE_CHANGE');
  await assert.rejects(
    () => adapter.execute({
      id: 'job-eng-3',
      intentId: 'intent-eng-3',
      actionType: 'ENGINEERING.BASELINE_CHANGE',
      payload: { baseline: '5.3.9' },
    }),
    /DOMAIN_PORT_REQUIRED:engineeringChange/,
  );
});

test('Engineering adapter rejects mismatched durable readback', async () => {
  const engineeringChange = {
    async recordBaselineChange(job, input) {
      return {
        outcome: 'CREATED',
        record: { baseline: input.baseline, status: 'CHANGE_RECORDED', executionJobId: job.id, intentId: job.intentId },
      };
    },
    async getBaselineChange(job, baseline) {
      return { baseline, status: 'RELEASED', executionJobId: job.id, intentId: job.intentId };
    },
  };

  const adapter = createExecutionAdapterRegistry({ engineeringChange }).get('ENGINEERING.BASELINE_CHANGE');
  await assert.rejects(
    () => adapter.execute({
      id: 'job-eng-4',
      intentId: 'intent-eng-4',
      actionType: 'ENGINEERING.BASELINE_CHANGE',
      payload: { baseline: '5.3.9' },
    }),
    /ENGINEERING_BASELINE_VERIFICATION_MISMATCH/,
  );
});

test('Engineering adapter refuses malformed baseline before touching the domain store', async () => {
  let touched = false;
  const engineeringChange = {
    async recordBaselineChange() { touched = true; },
    async getBaselineChange() { touched = true; },
  };
  const adapter = createExecutionAdapterRegistry({ engineeringChange }).get('ENGINEERING.BASELINE_CHANGE');
  await assert.rejects(
    () => adapter.execute({
      id: 'job-eng-5',
      intentId: 'intent-eng-5',
      actionType: 'ENGINEERING.BASELINE_CHANGE',
      payload: {},
    }),
    /ADAPTER_PAYLOAD_INVALID:baseline/,
  );
  assert.equal(touched, false);
});
