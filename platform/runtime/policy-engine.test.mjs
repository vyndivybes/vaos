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
