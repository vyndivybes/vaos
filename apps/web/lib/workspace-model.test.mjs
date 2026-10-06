import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkspaceModel,
  findModule,
  summarizeAgentFleet,
  normaliseWorkspaceView,
} from './workspace-model.mjs';
import { createDevelopmentRuntime } from '../../../platform/runtime/development-runtime.mjs';

function runtimeSnapshot() {
  let eventId = 0;
  let approvalId = 0;
  return createDevelopmentRuntime({
    now: () => '2026-10-07T00:00:00.000Z',
    eventIdFactory: () => `evt-${++eventId}`,
    approvalIdFactory: () => `apr-${++approvalId}`,
  }).snapshot();
}

test('workspace exposes the required operational modules and no legacy house/range modules', () => {
  const model = buildWorkspaceModel(runtimeSnapshot());
  const ids = model.modules.map((module) => module.id);
  for (const required of ['command','agents','vibpe','engineering','qa-capa','projects','risk','governance','digital-thread','evidence','approvals','admin']) {
    assert.ok(ids.includes(required), `missing ${required}`);
  }
  assert.equal(ids.includes('house'), false);
  assert.equal(ids.includes('range'), false);
});

test('agent fleet summary derives active and approval counts from runtime state', () => {
  const model = buildWorkspaceModel(runtimeSnapshot());
  const summary = summarizeAgentFleet(model.agents);
  assert.equal(summary.total, model.agents.length);
  assert.ok(summary.active >= 1);
  assert.ok(summary.needsApproval >= 1);
  assert.ok(summary.maxAuthority <= 5);
});

test('module lookup and workspace view normalization fail closed to command centre', () => {
  assert.equal(findModule('vibpe')?.id, 'vibpe');
  assert.equal(normaliseWorkspaceView('qa-capa'), 'qa-capa');
  assert.equal(normaliseWorkspaceView('house'), 'command');
  assert.equal(normaliseWorkspaceView('unknown'), 'command');
});

test('workspace agents, approvals and events are derived from the runtime snapshot', () => {
  const snapshot = runtimeSnapshot();
  const model = buildWorkspaceModel(snapshot);

  assert.deepEqual(
    model.agents.map((agent) => agent.id).sort(),
    snapshot.agents.map((agent) => agent.id).sort(),
  );
  assert.equal(model.approvals.length, snapshot.approvals.filter((item) => item.status === 'PENDING').length);
  assert.ok(model.events.some((event) => event.type === 'GOVERNANCE.APPROVAL_REQUIRED'));
  assert.equal(model.runtimeMode, 'EPHEMERAL_DEVELOPMENT');
});

test('workspace runtime events remain ordered newest-first for rendering', () => {
  const model = buildWorkspaceModel(runtimeSnapshot());
  assert.ok(model.events.length >= 4);
  assert.ok(model.events.every((event) => Number.isFinite(event.timeRank)));
  for (let i = 1; i < model.events.length; i += 1) {
    assert.ok(model.events[i - 1].timeRank >= model.events[i].timeRank);
  }
});
