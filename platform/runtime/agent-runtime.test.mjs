import test from 'node:test';
import assert from 'node:assert/strict';

import { AUTHORITY, createAgentDefinition } from '../../packages/contracts/agent.mjs';
import { createAgentRuntime } from './agent-runtime.mjs';

function createRuntime() {
  let eventId = 0;
  let approvalId = 0;
  return createAgentRuntime({
    now: () => '2026-10-07T00:00:00.000Z',
    eventIdFactory: () => `evt-${++eventId}`,
    approvalIdFactory: () => `apr-${++approvalId}`,
  });
}

test('runtime registers capability-scoped agents and exposes a control snapshot', () => {
  const runtime = createRuntime();
  runtime.registerAgent(createAgentDefinition({
    id: 'qa-agent',
    name: 'QA / CAPA Agent',
    domain: 'quality',
    capabilities: {
      'QA.OPEN_CAPA': AUTHORITY.APPROVED_EXECUTION,
    },
  }));

  const snapshot = runtime.snapshot();
  assert.equal(snapshot.agents.length, 1);
  assert.equal(snapshot.agents[0].id, 'qa-agent');
  assert.equal(snapshot.events[0].type, 'AGENT.REGISTERED');
});

test('L4 intent creates exactly one approval and emits governance evidence', () => {
  const runtime = createRuntime();
  runtime.registerAgent(createAgentDefinition({
    id: 'qa-agent',
    name: 'QA / CAPA Agent',
    domain: 'quality',
    capabilities: {
      'QA.OPEN_CAPA': AUTHORITY.APPROVED_EXECUTION,
    },
  }));

  const intent = {
    idempotencyKey: 'qa:capa:024',
    agentId: 'qa-agent',
    actionType: 'QA.OPEN_CAPA',
    risk: 'medium',
    reason: 'Recurring NCR pattern',
    payload: { capaId: 'CAPA-024' },
  };

  const first = runtime.proposeIntent(intent);
  const retry = runtime.proposeIntent(intent);

  assert.equal(first.status, 'AWAIT_APPROVAL');
  assert.equal(first.approvalId, 'apr-1');
  assert.equal(retry.approvalId, 'apr-1');
  assert.equal(runtime.snapshot().approvals.length, 1);
  assert.ok(runtime.snapshot().events.some((event) => event.type === 'GOVERNANCE.APPROVAL_REQUIRED'));
});

test('L5 low-risk eligible intent is authorized but not executed by the reasoning layer', () => {
  const runtime = createRuntime();
  runtime.registerAgent(createAgentDefinition({
    id: 'orchestrator',
    name: 'VAOS Orchestrator',
    domain: 'enterprise',
    capabilities: {
      'PROJECT.ESCALATE_RISK': AUTHORITY.AUTONOMOUS_EXECUTION,
    },
  }));

  const result = runtime.proposeIntent({
    idempotencyKey: 'project:risk:013',
    agentId: 'orchestrator',
    actionType: 'PROJECT.ESCALATE_RISK',
    risk: 'medium',
    reason: 'Schedule tolerance exceeded',
    payload: { riskId: 'RSK-013' },
  });

  assert.equal(result.status, 'AUTHORIZED');
  assert.equal(result.effectExecuted, false);
  assert.ok(runtime.snapshot().events.some((event) => event.type === 'GOVERNANCE.ACTION_AUTHORIZED'));
});

test('high-risk L5 intent remains human gated and unknown agents fail closed', () => {
  const runtime = createRuntime();
  runtime.registerAgent(createAgentDefinition({
    id: 'vibpe',
    name: 'VIBPE Engineering',
    domain: 'engineering',
    capabilities: {
      'ENGINEERING.BASELINE_CHANGE': AUTHORITY.AUTONOMOUS_EXECUTION,
    },
  }));

  const gated = runtime.proposeIntent({
    idempotencyKey: 'engineering:baseline:539',
    agentId: 'vibpe',
    actionType: 'ENGINEERING.BASELINE_CHANGE',
    risk: 'high',
    reason: 'Verification baseline impact',
    payload: { baseline: '5.3.9' },
  });

  const missing = runtime.proposeIntent({
    idempotencyKey: 'missing:1',
    agentId: 'missing-agent',
    actionType: 'PROJECT.ESCALATE_RISK',
    risk: 'low',
    reason: 'Test',
    payload: {},
  });

  assert.equal(gated.status, 'AWAIT_APPROVAL');
  assert.equal(missing.status, 'DENIED');
  assert.equal(missing.reason, 'AGENT_NOT_FOUND');
});

test('same idempotency key with a different intent is rejected', () => {
  const runtime = createRuntime();
  runtime.registerAgent(createAgentDefinition({
    id: 'orchestrator',
    name: 'VAOS Orchestrator',
    domain: 'enterprise',
    capabilities: {
      'PROJECT.ESCALATE_RISK': AUTHORITY.AUTONOMOUS_EXECUTION,
    },
  }));

  runtime.proposeIntent({
    idempotencyKey: 'risk:1',
    agentId: 'orchestrator',
    actionType: 'PROJECT.ESCALATE_RISK',
    risk: 'medium',
    reason: 'First intent',
    payload: { riskId: 'R1' },
  });

  assert.throws(() => runtime.proposeIntent({
    idempotencyKey: 'risk:1',
    agentId: 'orchestrator',
    actionType: 'PROJECT.ESCALATE_RISK',
    risk: 'medium',
    reason: 'Different intent',
    payload: { riskId: 'R2' },
  }), /IDEMPOTENCY_CONFLICT/);
});
