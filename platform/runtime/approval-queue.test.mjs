import test from 'node:test';
import assert from 'node:assert/strict';

import { createApprovalQueue } from './approval-queue.mjs';

test('approval queue deduplicates the same intent using its idempotency key', () => {
  let id = 0;
  const queue = createApprovalQueue({ idFactory: () => `apr-${++id}` });
  const input = {
    idempotencyKey: 'intent-1',
    agentId: 'qa-agent',
    actionType: 'QA.OPEN_CAPA',
    risk: 'medium',
    reason: 'Recurring NCR pattern',
  };

  const first = queue.request(input);
  const retry = queue.request(input);

  assert.equal(first.id, retry.id);
  assert.equal(queue.pending().length, 1);
});

test('approval queue rejects idempotency-key reuse with different intent payload', () => {
  const queue = createApprovalQueue();
  queue.request({
    idempotencyKey: 'intent-1',
    agentId: 'qa-agent',
    actionType: 'QA.OPEN_CAPA',
    risk: 'medium',
    reason: 'Recurring NCR pattern',
  });

  assert.throws(() => queue.request({
    idempotencyKey: 'intent-1',
    agentId: 'qa-agent',
    actionType: 'QA.OPEN_CAPA',
    risk: 'high',
    reason: 'Different payload',
  }), /IDEMPOTENCY_CONFLICT/);
});

test('approval decisions are terminal and idempotent for the same outcome', () => {
  const queue = createApprovalQueue();
  const approval = queue.request({
    idempotencyKey: 'intent-2',
    agentId: 'vibpe',
    actionType: 'ENGINEERING.BASELINE_CHANGE',
    risk: 'high',
    reason: 'Baseline impact',
  });

  const decided = queue.decide(approval.id, { decision: 'APPROVED', decidedBy: 'founder@example.com' });
  const retry = queue.decide(approval.id, { decision: 'APPROVED', decidedBy: 'founder@example.com' });

  assert.equal(decided.status, 'APPROVED');
  assert.equal(retry.status, 'APPROVED');
  assert.throws(() => queue.decide(approval.id, { decision: 'REJECTED', decidedBy: 'founder@example.com' }), /APPROVAL_ALREADY_DECIDED/);
});
