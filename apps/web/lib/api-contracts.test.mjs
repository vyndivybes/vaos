import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIntentRequest, validateApprovalDecision } from './api-contracts.mjs';

test('intent API requires client-stable idempotency key and valid intent body', () => {
  assert.equal(validateIntentRequest({
    idempotencyKey: '',
    body: { agentId: 'qa', actionType: 'QA.OPEN_CAPA', risk: 'medium', reason: 'x', payload: {} },
  }).ok, false);

  assert.equal(validateIntentRequest({
    idempotencyKey: 'qa:capa:024',
    body: { agentId: 'qa', actionType: 'QA.OPEN_CAPA', risk: 'medium', reason: 'Recurring NCR', payload: {} },
  }).ok, true);
});

test('approval API accepts only APPROVED or REJECTED', () => {
  assert.equal(validateApprovalDecision({ approvalId: 'apr-1', decision: 'APPROVED' }).ok, true);
  assert.equal(validateApprovalDecision({ approvalId: 'apr-1', decision: 'maybe' }).ok, false);
});
