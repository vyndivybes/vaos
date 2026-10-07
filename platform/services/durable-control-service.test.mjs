import test from 'node:test';
import assert from 'node:assert/strict';
import { createDurableControlService } from './durable-control-service.mjs';

function makeStore() {
  const calls = { intents: [], decisions: [], workforceReads: [] };
  let workforceState = { status: 'ACTIVE', qualificationLevel: 2 };
  return {
    calls,
    setWorkforceState(value) { workforceState = value; },
    async getDigitalEmployee(employeeId) {
      calls.workforceReads.push(employeeId);
      return workforceState ? { id: employeeId, ...workforceState } : null;
    },
    async submitIntent(input) {
      calls.intents.push(input);
      return {
        outcome: 'CREATED',
        intent: { status: input.result.status },
        approvalId: input.result.status === 'AWAIT_APPROVAL' ? 'apr-1' : null,
      };
    },
    async decideApproval(id, input) {
      calls.decisions.push({ id, ...input });
      return { outcome: 'DECIDED', approval: { id, status: input.decision } };
    },
    async snapshot() {
      return {
        mode: 'DURABLE_POSTGRES',
        approvals: [{ id: 'apr-1', status: 'PENDING', agentId: 'qa', actionType: 'QA.OPEN_CAPA', risk: 'medium', authority: 4, reason: 'Recurring NCR' }],
        events: [{ id: 'evt-1', sequence: 1, type: 'GOVERNANCE.APPROVAL_REQUIRED', source: 'qa', payload: { actionType: 'QA.OPEN_CAPA' } }],
        metrics: { pendingApprovals: 1, eventCount: 1, intentCount: 1 },
      };
    },
  };
}

test('durable service persists L4 intent as approval-gated', async () => {
  const store = makeStore();
  const service = createDurableControlService({ store });

  const result = await service.proposeIntent({
    idempotencyKey: 'qa:capa:024',
    agentId: 'qa',
    actionType: 'QA.OPEN_CAPA',
    risk: 'medium',
    reason: 'Recurring NCR',
    payload: { capaId: 'CAPA-024' },
  });

  assert.equal(result.status, 'AWAIT_APPROVAL');
  assert.equal(result.approvalId, 'apr-1');
  assert.equal(store.calls.intents[0].authority, 4);
  assert.equal(store.calls.intents[0].eventType, 'GOVERNANCE.APPROVAL_REQUIRED');
});

test('eligible L5 intent persists authorization without executing the effect', async () => {
  const store = makeStore();
  const service = createDurableControlService({ store });

  const result = await service.proposeIntent({
    idempotencyKey: 'risk:013',
    agentId: 'orchestrator',
    actionType: 'PROJECT.ESCALATE_RISK',
    risk: 'medium',
    reason: 'Schedule tolerance exceeded',
    payload: { riskId: 'RSK-013' },
  });

  assert.equal(result.status, 'AUTHORIZED');
  assert.equal(result.effectExecuted, false);
  assert.equal(store.calls.intents[0].eventType, 'GOVERNANCE.ACTION_AUTHORIZED');
});

test('same intent contract produces stable request hash and replays store response', async () => {
  const store = makeStore();
  store.submitIntent = async (input) => {
    store.calls.intents.push(input);
    return { outcome: 'REPLAY', intent: { status: input.result.status }, approvalId: 'apr-1' };
  };
  const service = createDurableControlService({ store });
  const input = {
    idempotencyKey: 'qa:capa:024',
    agentId: 'qa',
    actionType: 'QA.OPEN_CAPA',
    risk: 'medium',
    reason: 'Recurring NCR',
    payload: { capaId: 'CAPA-024' },
  };

  await service.proposeIntent(input);
  await service.proposeIntent(input);

  assert.equal(store.calls.intents[0].requestHash, store.calls.intents[1].requestHash);
});

test('control snapshot combines durable state with the capability-scoped agent fleet', async () => {
  const service = createDurableControlService({ store: makeStore() });
  const snapshot = await service.snapshot();

  assert.equal(snapshot.mode, 'DURABLE_POSTGRES');
  assert.ok(snapshot.agents.length >= 8);
  assert.equal(snapshot.approvals[0].id, 'apr-1');
});

test('approval decisions are delegated with authenticated actor identity', async () => {
  const store = makeStore();
  const service = createDurableControlService({ store });
  const result = await service.decideApproval('apr-1', {
    decision: 'APPROVED',
    decidedBy: 'founder@example.com',
  });

  assert.equal(result.approval.status, 'APPROVED');
  assert.deepEqual(store.calls.decisions[0], {
    id: 'apr-1',
    decision: 'APPROVED',
    decidedBy: 'founder@example.com',
  });
});


test('normal agent work is denied until its Digital Employee is ACTIVE and qualified', async () => {
  const store = makeStore();
  store.setWorkforceState({ status: 'PROPOSED', qualificationLevel: 0 });
  const service = createDurableControlService({ store });

  const result = await service.proposeIntent({
    idempotencyKey: 'qa:capa:blocked',
    agentId: 'qa',
    actionType: 'QA.OPEN_CAPA',
    risk: 'medium',
    reason: 'Attempt before qualification',
    payload: { capaId: 'CAPA-BLOCKED' },
  });

  assert.equal(result.status, 'DENIED');
  assert.equal(result.reason, 'DIGITAL_EMPLOYEE_NOT_ACTIVE');
  assert.equal(store.calls.workforceReads[0], 'qa');
  assert.equal(store.calls.intents[0].result.reason, 'DIGITAL_EMPLOYEE_NOT_ACTIVE');
});

test('human-gated workforce lifecycle intents remain available for bootstrap qualification', async () => {
  const store = makeStore();
  store.setWorkforceState({ status: 'PROPOSED', qualificationLevel: 0 });
  const service = createDurableControlService({ store });

  const result = await service.proposeIntent({
    idempotencyKey: 'workforce:orchestrator:training',
    agentId: 'orchestrator',
    actionType: 'WORKFORCE.START_TRAINING',
    risk: 'medium',
    reason: 'Begin orchestrator qualification',
    payload: { employeeId: 'orchestrator' },
  });

  assert.equal(result.status, 'AWAIT_APPROVAL');
  assert.equal(result.authority, 4);
  assert.equal(store.calls.workforceReads.length, 0);
});


test('qualification assessment requires the Orchestrator Digital Employee to be ACTIVE and qualified', async () => {
  const store = makeStore();
  const service = createDurableControlService({ store });

  store.setWorkforceState({ status: 'PROPOSED', qualificationLevel: 0 });
  const blocked = await service.proposeIntent({
    idempotencyKey: 'workforce:vibpe:q3:assessment:blocked',
    agentId: 'orchestrator',
    actionType: 'WORKFORCE.ASSESS_QUALIFICATION',
    risk: 'high',
    reason: 'Run VIBPE Q3 assessment',
    payload: {
      employeeId: 'vibpe',
      targetLevel: 3,
      profileId: 'VIBPE_Q3_ENGINEERING_BASELINE_GOVERNANCE_V1',
    },
  });
  assert.equal(blocked.status, 'DENIED');
  assert.equal(blocked.reason, 'DIGITAL_EMPLOYEE_NOT_ACTIVE');

  store.setWorkforceState({ status: 'ACTIVE', qualificationLevel: 2 });
  const allowed = await service.proposeIntent({
    idempotencyKey: 'workforce:vibpe:q3:assessment:allowed',
    agentId: 'orchestrator',
    actionType: 'WORKFORCE.ASSESS_QUALIFICATION',
    risk: 'high',
    reason: 'Run VIBPE Q3 assessment',
    payload: {
      employeeId: 'vibpe',
      targetLevel: 3,
      profileId: 'VIBPE_Q3_ENGINEERING_BASELINE_GOVERNANCE_V1',
    },
  });
  assert.equal(allowed.status, 'AWAIT_APPROVAL');
  assert.equal(allowed.authority, 4);
});
