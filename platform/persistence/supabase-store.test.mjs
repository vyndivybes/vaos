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


test('governed domain link writes and readback are bound to the execution lease', async () => {
  const fake = fakeFetch([
    { body: { outcome: 'CREATED', link: { id: 'link-1', relationType: 'DRIVES_CHANGE', executionJobId: 'job-link-1', intentId: 'intent-link-1' } } },
    { body: { id: 'link-1', relationType: 'DRIVES_CHANGE', executionJobId: 'job-link-1', intentId: 'intent-link-1' } },
  ]);
  const store = createSupabaseControlStore({ url: 'https://example.supabase.co', serverSecret: 'server-secret', fetchImpl: fake.fetchImpl });
  const job = { id: 'job-link-1', intentId: 'intent-link-1', leaseToken: 'lease-link-1' };
  const input = {
    sourceDomain: 'QA_CAPA',
    sourceRecordId: '6ee7b7d0-8694-47fb-a00c-b3540bb380db',
    relationType: 'DRIVES_CHANGE',
    targetDomain: 'ENGINEERING_BASELINE',
    targetRecordId: 'b51465ef-2777-4e48-90f8-92ad7943317e',
    createdBy: 'founder@example.com',
    context: { reason: 'CAPA requires baseline update' },
  };

  const created = await store.linkDomainRecords(job, input);
  const record = await store.getDomainLink(job, input);

  assert.equal(created.outcome, 'CREATED');
  assert.equal(record.executionJobId, 'job-link-1');
  assert.equal(fake.calls[0].body.operation, 'linkDomainRecords');
  assert.deepEqual(fake.calls[0].body.payload, {
    jobId: 'job-link-1',
    leaseToken: 'lease-link-1',
    sourceDomain: 'QA_CAPA',
    sourceRecordId: '6ee7b7d0-8694-47fb-a00c-b3540bb380db',
    relationType: 'DRIVES_CHANGE',
    targetDomain: 'ENGINEERING_BASELINE',
    targetRecordId: 'b51465ef-2777-4e48-90f8-92ad7943317e',
    proposedBy: 'founder@example.com',
    context: { reason: 'CAPA requires baseline update' },
  });
  assert.equal(fake.calls[1].body.operation, 'getDomainLink');
});


test('Digital Workforce reads and lifecycle transitions use typed Edge bridge operations', async () => {
  const fake = fakeFetch([
    { body: { id: 'vibpe', status: 'TRAINING', qualificationLevel: 0 } },
    { body: { outcome: 'CREATED', employee: { id: 'vibpe', status: 'QUALIFIED', qualificationLevel: 3 } } },
  ]);
  const store = createSupabaseControlStore({
    url: 'https://example.supabase.co',
    serverSecret: 'server-secret',
    fetchImpl: fake.fetchImpl,
  });

  const employee = await store.getDigitalEmployee('vibpe');
  const transitioned = await store.transitionDigitalEmployee(
    { id: 'job-wf-1', leaseToken: 'lease-wf-1', actionType: 'WORKFORCE.QUALIFY' },
    { employeeId: 'vibpe', qualificationLevel: 3, evidenceRefs: ['evidence:benchmark:1'] },
  );

  assert.equal(employee.status, 'TRAINING');
  assert.equal(transitioned.employee.status, 'QUALIFIED');
  assert.equal(fake.calls[0].body.operation, 'getDigitalEmployee');
  assert.deepEqual(fake.calls[0].body.payload, { employeeId: 'vibpe' });
  assert.equal(fake.calls[1].body.operation, 'transitionDigitalEmployee');
  assert.deepEqual(fake.calls[1].body.payload, {
    jobId: 'job-wf-1',
    leaseToken: 'lease-wf-1',
    employeeId: 'vibpe',
    actionType: 'WORKFORCE.QUALIFY',
    qualificationLevel: 3,
    evidenceRefs: ['evidence:benchmark:1'],
  });
});


test('Digital Workforce qualification assessment uses typed Edge bridge operations', async () => {
  const fake = fakeFetch([
    { body: { outcome: 'CREATED', assessment: { id: 'assessment-1', employeeId: 'vibpe', targetLevel: 3, status: 'PASS' } } },
    { body: { id: 'assessment-1', employeeId: 'vibpe', targetLevel: 3, status: 'PASS' } },
  ]);
  const store = createSupabaseControlStore({
    url: 'https://example.supabase.co',
    serverSecret: 'server-secret',
    fetchImpl: fake.fetchImpl,
  });
  const job = { id: 'job-assess-1', leaseToken: 'lease-assess-1', actionType: 'WORKFORCE.ASSESS_QUALIFICATION' };

  const assessed = await store.assessDigitalEmployeeQualification(job, {
    employeeId: 'vibpe',
    targetLevel: 3,
    profileId: 'VIBPE_Q3_ENGINEERING_BASELINE_GOVERNANCE_V1',
  });
  const record = await store.getQualificationAssessment(job, 'vibpe');

  assert.equal(assessed.assessment.status, 'PASS');
  assert.equal(record.id, 'assessment-1');
  assert.equal(fake.calls[0].body.operation, 'assessDigitalEmployeeQualification');
  assert.deepEqual(fake.calls[0].body.payload, {
    jobId: 'job-assess-1',
    leaseToken: 'lease-assess-1',
    employeeId: 'vibpe',
    targetLevel: 3,
    profileId: 'VIBPE_Q3_ENGINEERING_BASELINE_GOVERNANCE_V1',
  });
  assert.equal(fake.calls[1].body.operation, 'getQualificationAssessment');
});

test('Risk Q3 recovery and trace operations use typed Edge bridge calls', async () => {
  const fake = fakeFetch([
    { body: { id: 'job-risk-q3', attemptCount: 2, leaseToken: 'lease-2', actionType: 'PROJECT.ESCALATE_RISK', payload: { riskId: 'RSK-015' } } },
    { body: { outcome: 'CREATED', link: { id: 'link-risk-q3', executionJobId: 'job-risk-q3' } } },
  ]);
  const store = createSupabaseControlStore({
    url: 'https://example.supabase.co',
    serverSecret: 'server-secret',
    fetchImpl: fake.fetchImpl,
  });
  const job = { id: 'job-risk-q3', leaseToken: 'lease-1' };

  const recovered = await store.claimQualificationRecovery(job, { workerId: 'worker-q3' });
  const linked = await store.linkRiskQualificationTrace(
    { ...job, leaseToken: 'lease-2' },
    {
      targetDomain: 'ENGINEERING_BASELINE',
      targetResourceId: '5.3.9',
      relationType: 'MITIGATES_RISK',
    },
  );

  assert.equal(recovered.attemptCount, 2);
  assert.equal(linked.link.executionJobId, 'job-risk-q3');
  assert.equal(fake.calls[0].body.operation, 'claimQualificationRecovery');
  assert.deepEqual(fake.calls[0].body.payload, { jobId: 'job-risk-q3', workerId: 'worker-q3' });
  assert.equal(fake.calls[1].body.operation, 'linkRiskQualificationTrace');
  assert.deepEqual(fake.calls[1].body.payload, {
    jobId: 'job-risk-q3',
    leaseToken: 'lease-2',
    targetDomain: 'ENGINEERING_BASELINE',
    targetResourceId: '5.3.9',
    relationType: 'MITIGATES_RISK',
  });
});

test('Security identity observation writes and readback use dedicated Edge operations bound to the execution lease', async () => {
  const fake = fakeFetch([
    { body: { outcome: 'CREATED', record: { observationId: 'SEC-Q4-001', status: 'OBSERVED', executionJobId: 'job-sec-1', intentId: 'intent-sec-1' } } },
    { body: { observationId: 'SEC-Q4-001', status: 'OBSERVED', executionJobId: 'job-sec-1', intentId: 'intent-sec-1' } },
  ]);
  const store = createSupabaseControlStore({ url: 'https://example.supabase.co', serverSecret: 'server-secret', fetchImpl: fake.fetchImpl });
  const job = { id: 'job-sec-1', intentId: 'intent-sec-1', leaseToken: 'lease-sec-1' };

  const observed = await store.observeIdentity(job, { observationId: 'SEC-Q4-001' });
  const record = await store.getIdentityObservation(job, 'SEC-Q4-001');

  assert.equal(observed.outcome, 'CREATED');
  assert.equal(record.status, 'OBSERVED');
  assert.equal(fake.calls[0].body.operation, 'observeIdentity');
  assert.deepEqual(fake.calls[0].body.payload, {
    jobId: 'job-sec-1',
    leaseToken: 'lease-sec-1',
    observationId: 'SEC-Q4-001',
  });
  assert.equal(fake.calls[1].body.operation, 'getIdentityObservation');
});

test('Security qualification trace uses a dedicated lease-bound Edge operation', async () => {
  const fake = fakeFetch([
    { body: { outcome: 'CREATED', link: { id: 'link-sec-1', executionJobId: 'job-sec-1', intentId: 'intent-sec-1' } } },
  ]);
  const store = createSupabaseControlStore({ url: 'https://example.supabase.co', serverSecret: 'server-secret', fetchImpl: fake.fetchImpl });
  const job = { id: 'job-sec-1', intentId: 'intent-sec-1', leaseToken: 'lease-sec-1' };

  const result = await store.linkSecurityQualificationTrace(job, {
    sourceRiskId: 'RSK-015',
    targetBaseline: '5.3.9',
    relationType: 'RELATED_TO',
  });

  assert.equal(result.link.executionJobId, 'job-sec-1');
  assert.equal(fake.calls[0].body.operation, 'linkSecurityQualificationTrace');
  assert.deepEqual(fake.calls[0].body.payload, {
    jobId: 'job-sec-1',
    leaseToken: 'lease-sec-1',
    sourceRiskId: 'RSK-015',
    targetBaseline: '5.3.9',
    relationType: 'RELATED_TO',
  });
});

test('Knowledge Q2 links use dedicated typed Edge operations with business resource IDs', async () => {
  const fake = fakeFetch([
    { body: { outcome: 'CREATED', link: { id: 'knowledge-link-1', executionJobId: 'job-k1', intentId: 'intent-k1' } } },
    { body: { id: 'knowledge-link-1', sourceRiskId: 'PC-Q2-001', targetBaseline: '5.3.9', relationType: 'RELATED_TO', executionJobId: 'job-k1', intentId: 'intent-k1' } },
  ]);
  const store = createSupabaseControlStore({ url: 'https://example.supabase.co', serverSecret: 'server-secret', fetchImpl: fake.fetchImpl });
  const job = { id: 'job-k1', intentId: 'intent-k1', leaseToken: 'lease-k1' };
  const input = { sourceRiskId: 'PC-Q2-001', targetBaseline: '5.3.9', relationType: 'RELATED_TO' };

  const created = await store.linkKnowledgeQualification(job, input);
  const record = await store.getKnowledgeQualificationLink(job, input);

  assert.equal(created.outcome, 'CREATED');
  assert.equal(record.id, 'knowledge-link-1');
  assert.equal(fake.calls[0].body.operation, 'linkKnowledgeQualification');
  assert.equal(fake.calls[1].body.operation, 'getKnowledgeQualificationLink');
});

test('operational commissioning snapshot uses the dedicated Edge operation', async () => {
  const fake = fakeFetch([
    { body: { schemaVersion: 'vaos.operational-commissioning.v1', state: 'COMMISSIONED', externalProviderState: 'READY_LOCKED' } },
  ]);
  const store = createSupabaseControlStore({
    url: 'https://example.supabase.co',
    serverSecret: 'server-secret',
    fetchImpl: fake.fetchImpl,
  });

  const result = await store.operationalCommissioningSnapshot();

  assert.equal(result.state, 'COMMISSIONED');
  assert.equal(fake.calls[0].body.operation, 'operationalCommissioningSnapshot');
});

