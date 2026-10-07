import test from 'node:test';
import assert from 'node:assert/strict';

import { createDevelopmentRuntime } from './development-runtime.mjs';

test('development runtime boots the specialist fleet and governed sample intents', () => {
  let eventId = 0;
  let approvalId = 0;
  const runtime = createDevelopmentRuntime({
    now: () => '2026-10-07T00:00:00.000Z',
    eventIdFactory: () => `evt-${++eventId}`,
    approvalIdFactory: () => `apr-${++approvalId}`,
  });

  const snapshot = runtime.snapshot();

  assert.ok(snapshot.agents.length >= 8);
  assert.equal(snapshot.approvals.filter((item) => item.status === 'PENDING').length, 3);
  assert.ok(snapshot.events.some((event) => event.type === 'GOVERNANCE.APPROVAL_REQUIRED'));
  assert.ok(snapshot.events.some((event) => event.type === 'GOVERNANCE.ACTION_AUTHORIZED'));
  assert.equal(snapshot.mode, 'EPHEMERAL_DEVELOPMENT');
});


test('knowledge agent has L4 authority to propose governed digital-thread links', () => {
  const runtime = createDevelopmentRuntime();
  const knowledge = runtime.snapshot().agents.find((agent) => agent.id === 'knowledge');
  assert.equal(knowledge.capabilities['DIGITAL_THREAD.CREATE_LINK'], 4);
});
