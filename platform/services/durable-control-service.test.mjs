import test from 'node:test';
import assert from 'node:assert/strict';
import { createDurableControlService } from './durable-control-service.mjs';

function makeStore() {
  const calls = { intents: [], decisions: [], workforceReads: [] };
  let workforceState = { status: 'ACTIVE', qualificationLevel: 2, responsibilityContractId: 'risk-contract' };
  let responsibilityContracts = [{
    id: 'risk-contract',
    approvalRequiredActions: ['PROJECT.ESCALATE_RISK'],
    autonomousActions: [],
    prohibitedActions: [],
  }];
  return {
    calls,
    setWorkforceState(value) { workforceState = value; },
    setResponsibilityContracts(value) { responsibilityContracts = value; },
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
        workforce: { responsibilityContracts },
        responsibilityContracts,
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
  assert.equal(snapshot.agents.length, 16);
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

test('TRAINING employee may produce qualification evidence only when explicitly flagged and contract-declared', async () => {
  const store = makeStore();
  store.setWorkforceState({
    status: 'TRAINING',
    qualificationLevel: 0,
    responsibilityContractId: 'risk-contract',
  });
  const service = createDurableControlService({ store });

  const result = await service.proposeIntent({
    idempotencyKey: 'risk:q3:evidence:014',
    agentId: 'risk',
    actionType: 'PROJECT.ESCALATE_RISK',
    risk: 'medium',
    reason: 'Q3 qualification evidence: second governed risk escalation',
    payload: {
      riskId: 'RSK-014',
      qualificationMode: true,
    },
  });

  assert.equal(result.status, 'AWAIT_APPROVAL');
  assert.equal(result.reason, 'QUALIFICATION_EVIDENCE_APPROVAL_REQUIRED');
  assert.equal(result.authority, 4);
  assert.equal(store.calls.intents[0].eventType, 'GOVERNANCE.APPROVAL_REQUIRED');
});

test('TRAINING employee remains blocked for ordinary domain work when qualification mode is absent', async () => {
  const store = makeStore();
  store.setWorkforceState({
    status: 'TRAINING',
    qualificationLevel: 0,
    responsibilityContractId: 'risk-contract',
  });
  const service = createDurableControlService({ store });

  const result = await service.proposeIntent({
    idempotencyKey: 'risk:ordinary:blocked',
    agentId: 'risk',
    actionType: 'PROJECT.ESCALATE_RISK',
    risk: 'medium',
    reason: 'Ordinary work must remain blocked while training',
    payload: { riskId: 'RSK-BLOCKED' },
  });

  assert.equal(result.status, 'DENIED');
  assert.equal(result.reason, 'DIGITAL_EMPLOYEE_NOT_ACTIVE');
});

test('qualification mode fails closed when the training action is outside the responsibility contract', async () => {
  const store = makeStore();
  store.setWorkforceState({
    status: 'TRAINING',
    qualificationLevel: 0,
    responsibilityContractId: 'risk-contract',
  });
  store.setResponsibilityContracts([{
    id: 'risk-contract',
    approvalRequiredActions: [],
    autonomousActions: [],
    prohibitedActions: [],
  }]);
  const service = createDurableControlService({ store });

  const result = await service.proposeIntent({
    idempotencyKey: 'risk:q3:undeclared',
    agentId: 'risk',
    actionType: 'PROJECT.ESCALATE_RISK',
    risk: 'medium',
    reason: 'Undeclared qualification action',
    payload: {
      riskId: 'RSK-UNDECLARED',
      qualificationMode: true,
    },
  });

  assert.equal(result.status, 'DENIED');
  assert.equal(result.reason, 'RESPONSIBILITY_ACTION_UNDECLARED');
});



test('VYNDI operational read intent is authorized through the default durable control registry', async () => {
  const store = makeStore();
  const service = createDurableControlService({ store });

  const result = await service.proposeIntent({
    idempotencyKey: 'inventory:observe:canary',
    agentId: 'inventory',
    actionType: 'INVENTORY.OBSERVE_STOCK',
    risk: 'low',
    reason: 'Commissioned VYNDI inventory read canary',
    payload: { limit: 1 },
  });

  assert.equal(result.status, 'AUTHORIZED');
  assert.equal(result.authority, 5);
  assert.equal(store.calls.intents[0].eventType, 'GOVERNANCE.ACTION_AUTHORIZED');
});

test('VYNDI operational mutation intent remains preparation-only through the default durable control registry', async () => {
  const store = makeStore();
  const service = createDurableControlService({ store });

  const result = await service.proposeIntent({
    idempotencyKey: 'inventory:reserve:guard',
    agentId: 'inventory',
    actionType: 'INVENTORY.RESERVE_MATERIAL',
    risk: 'medium',
    reason: 'Verify mutation remains fail-closed before write commissioning',
    payload: { materialId: 'MAT-CANARY-001' },
  });

  assert.equal(result.status, 'PREPARED');
  assert.equal(result.reason, 'WORKFORCE_BRIDGE_PREPARE_ONLY');
  assert.equal(result.authority, 4);
  assert.equal(store.calls.intents[0].eventType, 'AGENT.ACTION_PREPARED');
});

test('Stage-3 commercial write qualification is approval-gated while ordinary writes remain prepare-only', async () => {
  const store = makeStore();
  const service = createDurableControlService({ store });

  const qualified = await service.proposeIntent({
    idempotencyKey: 'stage3:commercial:write-canary:001',
    agentId: 'commercial',
    actionType: 'COMMERCIAL.COMMIT_ORDER',
    risk: 'low',
    reason: 'Stage-3 controlled write qualification canary',
    payload: {
      writeQualification: true,
      qualificationProfile: 'COMMERCIAL_WRITE_CANARY_V1',
      requestedBy: 'maker@example.com',
    },
  });

  assert.equal(qualified.status, 'AWAIT_APPROVAL');
  assert.equal(qualified.reason, 'WRITE_QUALIFICATION_APPROVAL_REQUIRED');
  assert.equal(qualified.authority, 4);
  assert.equal(store.calls.intents[0].eventType, 'GOVERNANCE.APPROVAL_REQUIRED');

  const ordinary = await service.proposeIntent({
    idempotencyKey: 'stage3:commercial:ordinary:guard',
    agentId: 'commercial',
    actionType: 'COMMERCIAL.COMMIT_ORDER',
    risk: 'low',
    reason: 'Ordinary write remains fail-closed',
    payload: {},
  });

  assert.equal(ordinary.status, 'PREPARED');
  assert.equal(ordinary.reason, 'WORKFORCE_BRIDGE_PREPARE_ONLY');
});
