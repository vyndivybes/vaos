import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_POLICIES, POLICY_DECISION, evaluateActionPolicy } from './policy-engine.mjs';

test('Release gate observation remains recommendation-only at L2', () => {
  const result = evaluateActionPolicy({
    actionType: 'RELEASE.OBSERVE_GATE',
    authority: 2,
    risk: 'low',
  });

  assert.equal(result.decision, POLICY_DECISION.PREPARE_ONLY);
  assert.equal(result.reason, 'PREPARE_ONLY');
  assert.equal(ACTION_POLICIES['RELEASE.OBSERVE_GATE'].minimumAuthority, 2);
});
