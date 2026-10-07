import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTION_POLICIES,
  POLICY_DECISION,
  evaluateActionPolicy,
} from './policy-engine.mjs';

test('unknown and prohibited actions fail closed', () => {
  assert.equal(evaluateActionPolicy({ actionType: 'UNKNOWN.ACTION', authority: 5 }).decision, POLICY_DECISION.DENY);
  assert.equal(evaluateActionPolicy({ actionType: 'EVIDENCE.DELETE', authority: 5 }).reason, 'ACTION_PROHIBITED');
});

test('authority below the action minimum is denied', () => {
  const result = evaluateActionPolicy({
    actionType: 'QA.OPEN_CAPA',
    authority: 3,
    risk: 'medium',
  });
  assert.equal(result.decision, POLICY_DECISION.DENY);
  assert.equal(result.reason, 'INSUFFICIENT_AUTHORITY');
});

test('L4 execution requires approval and L5 can autonomously authorize low/medium policy actions', () => {
  const l4 = evaluateActionPolicy({
    actionType: 'PROJECT.ESCALATE_RISK',
    authority: 4,
    risk: 'medium',
  });
  const l5 = evaluateActionPolicy({
    actionType: 'PROJECT.ESCALATE_RISK',
    authority: 5,
    risk: 'medium',
  });

  assert.equal(l4.decision, POLICY_DECISION.AWAIT_APPROVAL);
  assert.equal(l5.decision, POLICY_DECISION.ALLOW);
});

test('high-risk or explicitly human-gated effects require approval even at L5', () => {
  const baseline = evaluateActionPolicy({
    actionType: 'ENGINEERING.BASELINE_CHANGE',
    authority: 5,
    risk: 'high',
  });
  assert.equal(baseline.decision, POLICY_DECISION.AWAIT_APPROVAL);
  assert.equal(ACTION_POLICIES['ENGINEERING.BASELINE_CHANGE'].requiresApproval, true);
});


test('digital-thread relationship creation is human-gated at both L4 and L5', () => {
  const l4 = evaluateActionPolicy({
    actionType: 'DIGITAL_THREAD.CREATE_LINK',
    authority: 4,
    risk: 'medium',
  });
  const l5 = evaluateActionPolicy({
    actionType: 'DIGITAL_THREAD.CREATE_LINK',
    authority: 5,
    risk: 'low',
  });

  assert.equal(l4.decision, POLICY_DECISION.AWAIT_APPROVAL);
  assert.equal(l5.decision, POLICY_DECISION.AWAIT_APPROVAL);
  assert.equal(ACTION_POLICIES['DIGITAL_THREAD.CREATE_LINK'].requiresApproval, true);
});


test('every Digital Workforce lifecycle mutation is human-gated', () => {
  for (const actionType of [
    'WORKFORCE.START_TRAINING',
    'WORKFORCE.QUALIFY',
    'WORKFORCE.ACTIVATE',
    'WORKFORCE.RESTRICT',
    'WORKFORCE.START_RETRAINING',
    'WORKFORCE.RETIRE',
  ]) {
    const result = evaluateActionPolicy({ actionType, authority: 4, risk: 'medium' });
    assert.equal(result.decision, POLICY_DECISION.AWAIT_APPROVAL, actionType);
    assert.equal(ACTION_POLICIES[actionType].requiresApproval, true, actionType);
  }
});
