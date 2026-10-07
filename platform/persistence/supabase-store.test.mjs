import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseControlStore } from './supabase-store.mjs';

function fakeFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    const next = responses.shift();
    return { ok: next.ok ?? true, status: next.status ?? 200, async json() { return next.body; } };
  };
  return { fetchImpl, calls };
}

test('submitIntent uses the service-role Edge bridge with only the VAOS server credential', async () => {
  const fake = fakeFetch([{ body: { outcome: 'CREATED', intent: { status: 'AWAIT_APPROVAL' }, approvalId: 'apr-1' } }]);
  const store = createSupabaseControlStore({ url: 'https://example.supabase.co', serverSecret: 'server-secret', fetchImpl: fake.fetchImpl });
  const result = await store.submitIntent({
    idempotencyKey: 'qa:capa:024', requestHash: 'hash-1', agentId: 'qa', actionType: 'QA.OPEN_CAPA',
    risk: 'medium', reason: 'Recurring NCR', payload: { capaId: 'CAPA-024' }, authority: 4,
    result: { status: 'AWAIT_APPROVAL', effectExecuted: false }, eventType: 'GOVERNANCE.APPROVAL_REQUIRED',
  });
  assert.equal(result.outcome, 'CREATED');
  assert.equal(fake.calls[0].url, 'https://example.supabase.co/functions/v1/vaos-control');
  assert.equal(fake.calls[0].options.headers['x-vaos-server-key'], 'server-secret');
  assert.equal(fake.calls[0].options.headers.apikey, undefined);
  assert.equal(fake.calls[0].body.operation, 'submitIntent');
});

test('snapshot merges explicit digital-thread links from the authenticated Edge bridge', async () => {
  const fake = fakeFetch([
    { body: { mode: 'DURABLE_POSTGRES', approvals: [], events: [], metrics: {} } },
    { body: [{ id: 'link-1', sourceDomain: 'QA_CAPA', sourceRecordId: 'qa-1', relationType: 'DRIVES_CHANGE', targetDomain: 'ENGINEERING_BASELINE', targetRecordId: 'eng-1' }] },
    { body: { outcome: 'DECIDED', approval: { id: 'apr-1', status: 'APPROVED' } } },
  ]);
  const store = createSupabaseControlStore({ url: 'https://example.supabase.co', serverSecret: 'server-secret', fetchImpl: fake.fetchImpl });
  const snapshot = await store.snapshot();
  assert.equal(snapshot.mode, 'DURABLE_POSTGRES');
  assert.equal(snapshot.digitalThreadLinks.length, 1);
  assert.equal(snapshot.digitalThreadLinks[0].relationType, 'DRIVES_CHANGE');
  assert.equal((await store.decideApproval('apr-1', { decision: 'APPROVED', decidedBy: 'founder@example.com' })).approval.status, 'APPROVED');
  assert.equal(fake.calls[0].body.operation, 'snapshot');
  assert.equal(fake.calls[1].body.operation, 'traceLinks');
  assert.equal(fake.calls[2].body.operation, 'decideApproval');
});

test('execution lifecycle is routed through typed Edge operations', async () => {
  const fake = fakeFetch([
    { body: { id: 'job-1', leaseToken: 'lease-1', actionType: 'QA.OPEN_CAPA', payload: { capaId: 'CAPA-024' } } },
    { body: { outcome: 'SUCCEEDED', jobId: 'job-1' } },
    { body: { outcome: 'RETRY_SCHEDULED', jobId: 'job-2' } },
  ]);
  const store = createSupabaseControlStore({ url: 'https://example.supabase.co', serverSecret: 'server-secret', fetchImpl: fake.fetchImpl });
  const job = await store.claimExecution({ workerId: 'worker-1' });
  await store.completeExecution(job, { adapterId: 'qa.v1', effect: {}, verification: { verified: true } });
  await store.failExecution({ id: 'job-2', leaseToken: 'lease-2' }, { code: 'TIMEOUT', retryable: true, message: 'timeout' });
  assert.equal(fake.calls[0].body.operation, 'claimExecution');
  assert.equal(fake.calls[1].body.operation, 'completeExecution');
  assert.equal(fake.calls[1].body.payload.leaseToken, 'lease-1');
  assert.equal(fake.calls[2].body.operation, 'failExecution');
});

test('QA/CAPA domain writes and readback use dedicated Edge operations bound to the execution lease', async () => {
  const fake = fakeFetch([
    { body: { outcome: 'CREATED', record: { capaId: 'CAPA-024', status: 'OPEN', executionJobId: 'job-1', intentId: 'intent-1' } } },
    { body: { capaId: 'CAPA-024', status: 'OPEN', executionJobId: 'job-1', intentId: 'intent-1' } },
  ]);
  const store = createSupabaseControlStore({ url: 'https://example.supabase.co', serverSecret: 'server-secret', fetchImpl: fake.fetchImpl });
  const job = { id: 'job-1', intentId: 'intent-1', leaseToken: 'lease-1' };

  const opened = await store.openCapa(job, { capaId: 'CAPA-024' });
  const record = await store.getCapa(job, 'CAPA-024');

  assert.equal(opened.outcome, 'CREATED');
  assert.equal(record.status, 'OPEN');
  assert.equal(fake.calls[0].body.operation, 'openCapa');
  assert.deepEqual(fake.calls[0].body.payload, {
    jobId: 'job-1',
    leaseToken: 'lease-1',
    capaId: 'CAPA-024',
  });
  assert.equal(fake.calls[1].body.operation, 'getCapa');
  assert.deepEqual(fake.calls[1].body.payload, {
    jobId: 'job-1',
    capaId: 'CAPA-024',
  });
});

test('Edge bridge failures are surfaced without leaking response internals', async () => {
  const fake = fakeFetch([{ ok: false, status: 401, body: { message: 'internal detail' } }]);
  const store = createSupabaseControlStore({ url: 'https://example.supabase.co', serverSecret: 'server-secret', fetchImpl: fake.fetchImpl });
  await assert.rejects(() => store.snapshot(), /SUPABASE_EDGE_FAILED:401/);
});


test('Engineering baseline domain writes and readback use dedicated Edge operations bound to the execution lease', async () => {
  const fake = fakeFetch([
    { body: { outcome: 'CREATED', record: { baseline: '5.3.9', status: 'CHANGE_RECORDED', executionJobId: 'job-eng-1', intentId: 'intent-eng-1' } } },
    { body: { baseline: '5.3.9', status: 'CHANGE_RECORDED', executionJobId: 'job-eng-1', intentId: 'intent-eng-1' } },
  ]);
  const store = createSupabaseControlStore({ url: 'https://example.supabase.co', serverSecret: 'server-secret', fetchImpl: fake.fetchImpl });
  const job = { id: 'job-eng-1', intentId: 'intent-eng-1', leaseToken: 'lease-eng-1' };

  const recorded = await store.recordBaselineChange(job, { baseline: '5.3.9' });
  const record = await store.getBaselineChange(job, '5.3.9');

  assert.equal(recorded.outcome, 'CREATED');
  assert.equal(record.status, 'CHANGE_RECORDED');
  assert.equal(fake.calls[0].body.operation, 'recordBaselineChange');
  assert.deepEqual(fake.calls[0].body.payload, {
    jobId: 'job-eng-1',
    leaseToken: 'lease-eng-1',
    baseline: '5.3.9',
  });
  assert.equal(fake.calls[1].body.operation, 'getBaselineChange');
  assert.deepEqual(fake.calls[1].body.payload, {
    jobId: 'job-eng-1',
    baseline: '5.3.9',
  });
});


test('Project/Risk domain escalation and readback use dedicated Edge operations bound to the execution lease', async () => {
  const fake = fakeFetch([
    { body: { outcome: 'CREATED', record: { riskId: 'RSK-013', status: 'ESCALATED', executionJobId: 'job-risk-1', intentId: 'intent-risk-1' } } },
    { body: { riskId: 'RSK-013', status: 'ESCALATED', executionJobId: 'job-risk-1', intentId: 'intent-risk-1' } },
  ]);
  const store = createSupabaseControlStore({ url: 'https://example.supabase.co', serverSecret: 'server-secret', fetchImpl: fake.fetchImpl });
  const job = { id: 'job-risk-1', intentId: 'intent-risk-1', leaseToken: 'lease-risk-1' };

  const escalated = await store.escalateRisk(job, { riskId: 'RSK-013' });
  const record = await store.getRiskEscalation(job, 'RSK-013');

  assert.equal(escalated.outcome, 'CREATED');
  assert.equal(record.status, 'ESCALATED');
  assert.equal(fake.calls[0].body.operation, 'escalateRisk');
  assert.deepEqual(fake.calls[0].body.payload, {
    jobId: 'job-risk-1',
    leaseToken: 'lease-risk-1',
    riskId: 'RSK-013',
  });
  assert.equal(fake.calls[1].body.operation, 'getRiskEscalation');
  assert.deepEqual(fake.calls[1].body.payload, {
    jobId: 'job-risk-1',
    riskId: 'RSK-013',
  });
});


test('explicit domain links use a typed authenticated Edge operation', async () => {
  const fake = fakeFetch([
    { body: { outcome: 'CREATED', link: { id: 'link-1', relationType: 'DRIVES_CHANGE' } } },
  ]);
  const store = createSupabaseControlStore({ url: 'https://example.supabase.co', serverSecret: 'server-secret', fetchImpl: fake.fetchImpl });

  const result = await store.linkDomainRecords({
    sourceDomain: 'QA_CAPA',
    sourceRecordId: 'qa-1',
    relationType: 'DRIVES_CHANGE',
    targetDomain: 'ENGINEERING_BASELINE',
    targetRecordId: 'eng-1',
    createdBy: 'qa-agent',
    context: { reason: 'CAPA requires baseline update' },
  });

  assert.equal(result.outcome, 'CREATED');
  assert.equal(fake.calls[0].body.operation, 'linkDomainRecords');
  assert.deepEqual(fake.calls[0].body.payload, {
    sourceDomain: 'QA_CAPA',
    sourceRecordId: 'qa-1',
    relationType: 'DRIVES_CHANGE',
    targetDomain: 'ENGINEERING_BASELINE',
    targetRecordId: 'eng-1',
    createdBy: 'qa-agent',
    context: { reason: 'CAPA requires baseline update' },
  });
});
