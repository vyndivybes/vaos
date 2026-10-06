import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkspaceModel,
  findModule,
  summarizeAgentFleet,
  normaliseWorkspaceView,
} from './workspace-model.mjs';

test('workspace exposes the required operational modules and no legacy house/range modules', () => {
  const model = buildWorkspaceModel();
  const ids = model.modules.map((module) => module.id);
  for (const required of ['command','agents','vibpe','engineering','qa-capa','projects','risk','governance','digital-thread','evidence','approvals','admin']) {
    assert.ok(ids.includes(required), `missing ${required}`);
  }
  assert.equal(ids.includes('house'), false);
  assert.equal(ids.includes('range'), false);
});

test('agent fleet summary derives active and approval counts from agent state', () => {
  const model = buildWorkspaceModel();
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

test('workspace model exposes actionable approvals and ordered events', () => {
  const model = buildWorkspaceModel();
  assert.ok(model.approvals.length >= 2);
  assert.ok(model.events.length >= 4);
  assert.ok(model.events.every((event) => Number.isFinite(event.timeRank)));
  for (let i = 1; i < model.events.length; i += 1) {
    assert.ok(model.events[i - 1].timeRank >= model.events[i].timeRank);
  }
});
