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


test('workspace normalizes durable QA, Engineering and Project/Risk records into operational registers', () => {
  const snapshot = runtimeSnapshot();
  snapshot.domains = {
    qaCapa: [{
    id: 'domain-1',
    resourceId: 'CAPA-024',
    status: 'OPEN',
    recordedAt: '2026-10-07T00:10:00.000Z',
    intentId: 'intent-1',
    intentStatus: 'EXECUTED',
    intentRisk: 'medium',
    approvalId: 'approval-1',
    approvalStatus: 'APPROVED',
    decidedBy: 'founder@example.com',
    decidedAt: '2026-10-07T00:05:00.000Z',
    executionJobId: 'job-1',
    executionStatus: 'SUCCEEDED',
    attemptCount: 2,
    maxAttempts: 5,
    adapterId: 'supabase.qa-capa.v1',
    evidenceCount: 1,
    evidenceVerifiedAt: '2026-10-07T00:11:00.000Z',
    latestEventType: 'EVIDENCE.VERIFIED',
    latestEventAt: '2026-10-07T00:11:00.000Z',
  }],
    engineering: [{
      ...{
    id: 'domain-1',
    resourceId: 'CAPA-024',
    status: 'OPEN',
    recordedAt: '2026-10-07T00:10:00.000Z',
    intentId: 'intent-1',
    intentStatus: 'EXECUTED',
    intentRisk: 'medium',
    approvalId: 'approval-1',
    approvalStatus: 'APPROVED',
    decidedBy: 'founder@example.com',
    decidedAt: '2026-10-07T00:05:00.000Z',
    executionJobId: 'job-1',
    executionStatus: 'SUCCEEDED',
    attemptCount: 2,
    maxAttempts: 5,
    adapterId: 'supabase.qa-capa.v1',
    evidenceCount: 1,
    evidenceVerifiedAt: '2026-10-07T00:11:00.000Z',
    latestEventType: 'EVIDENCE.VERIFIED',
    latestEventAt: '2026-10-07T00:11:00.000Z',
  },
      id: 'domain-2',
      resourceId: '5.3.9',
      adapterId: 'supabase.engineering-baseline.v1',
    }],
    projectRisk: [{
      ...{
    id: 'domain-1',
    resourceId: 'CAPA-024',
    status: 'OPEN',
    recordedAt: '2026-10-07T00:10:00.000Z',
    intentId: 'intent-1',
    intentStatus: 'EXECUTED',
    intentRisk: 'medium',
    approvalId: 'approval-1',
    approvalStatus: 'APPROVED',
    decidedBy: 'founder@example.com',
    decidedAt: '2026-10-07T00:05:00.000Z',
    executionJobId: 'job-1',
    executionStatus: 'SUCCEEDED',
    attemptCount: 2,
    maxAttempts: 5,
    adapterId: 'supabase.qa-capa.v1',
    evidenceCount: 1,
    evidenceVerifiedAt: '2026-10-07T00:11:00.000Z',
    latestEventType: 'EVIDENCE.VERIFIED',
    latestEventAt: '2026-10-07T00:11:00.000Z',
  },
      id: 'domain-3',
      resourceId: 'RSK-013',
      adapterId: 'supabase.project-risk.v1',
    }],
  };

  const model = buildWorkspaceModel(snapshot);

  assert.equal(model.domainWorkspaces['qa-capa'].records[0].resourceId, 'CAPA-024');
  assert.equal(model.domainWorkspaces.engineering.records[0].resourceId, '5.3.9');
  assert.equal(model.domainWorkspaces.risk.records[0].resourceId, 'RSK-013');
  assert.equal(model.domainWorkspaces.risk.records[0].execution.status, 'SUCCEEDED');
  assert.equal(model.domainWorkspaces.risk.records[0].execution.attempts, 2);
  assert.equal(model.domainWorkspaces.risk.records[0].evidence.count, 1);
  assert.equal(model.domainWorkspaces.risk.records[0].latestEvent.type, 'EVIDENCE.VERIFIED');
});

test('workspace exposes empty durable registers when the runtime snapshot has no domain section', () => {
  const model = buildWorkspaceModel(runtimeSnapshot());
  assert.deepEqual(model.domainWorkspaces['qa-capa'].records, []);
  assert.deepEqual(model.domainWorkspaces.engineering.records, []);
  assert.deepEqual(model.domainWorkspaces.risk.records, []);
});


test('durable domain record exposes complete bounded digital thread context', () => {
  const snapshot = runtimeSnapshot();
  snapshot.domains = {
    qaCapa: [{
      id: 'domain-thread-1',
      resourceId: 'CAPA-100',
      status: 'OPEN',
      recordedAt: '2026-10-07T01:00:00.000Z',
      intentId: 'intent-100',
      intentStatus: 'EXECUTED',
      intentRisk: 'medium',
      approvalId: 'approval-100',
      approvalStatus: 'APPROVED',
      decidedBy: 'founder@example.com',
      decidedAt: '2026-10-07T00:55:00.000Z',
      executionJobId: 'job-100',
      executionStatus: 'SUCCEEDED',
      attemptCount: 2,
      maxAttempts: 5,
      adapterId: 'supabase.qa-capa.v1',
      evidenceCount: 1,
      evidenceVerifiedAt: '2026-10-07T01:01:00.000Z',
      effect: {
        effectType: 'QUALITY.CAPA_OPENED',
        resourceType: 'CAPA',
        resourceId: 'CAPA-100',
        state: 'OPEN',
      },
      evidenceVerification: {
        verified: true,
        resourceType: 'CAPA',
        resourceId: 'CAPA-100',
        expectedState: 'OPEN',
      },
      threadEvents: [
        {
          id: 'evt-2',
          sequence: 2,
          type: 'EXECUTION.SUCCEEDED',
          source: 'supabase.qa-capa.v1',
          occurredAt: '2026-10-07T01:01:00.000Z',
          payload: { executionJobId: 'job-100' },
        },
        {
          id: 'evt-1',
          sequence: 1,
          type: 'GOVERNANCE.APPROVAL_DECIDED',
          source: 'founder@example.com',
          occurredAt: '2026-10-07T00:55:00.000Z',
          payload: { approvalId: 'approval-100', decision: 'APPROVED' },
        },
      ],
    }],
    engineering: [],
    projectRisk: [],
  };

  const record = buildWorkspaceModel(snapshot).domainWorkspaces['qa-capa'].records[0];

  assert.equal(record.thread.effect.effectType, 'QUALITY.CAPA_OPENED');
  assert.equal(record.thread.verification.verified, true);
  assert.deepEqual(record.thread.events.map((event) => event.sequence), [1, 2]);
  assert.equal(record.thread.events[0].payload.decision, 'APPROVED');
});

test('digital thread defaults safely when persisted effect, evidence or event detail is absent', () => {
  const snapshot = runtimeSnapshot();
  snapshot.domains = {
    qaCapa: [{
      id: 'domain-thread-empty',
      resourceId: 'CAPA-101',
      status: 'OPEN',
      intentId: 'intent-101',
      intentStatus: 'EXECUTED',
      executionJobId: 'job-101',
      executionStatus: 'SUCCEEDED',
    }],
    engineering: [],
    projectRisk: [],
  };

  const record = buildWorkspaceModel(snapshot).domainWorkspaces['qa-capa'].records[0];
  assert.equal(record.thread.effect, null);
  assert.equal(record.thread.verification, null);
  assert.deepEqual(record.thread.events, []);
});


test('enterprise trace graph derives nodes from durable domains and only accepts explicit valid links', () => {
  const snapshot = runtimeSnapshot();
  snapshot.domains = {
    qaCapa: [{
      id: 'qa-1', resourceId: 'CAPA-001', status: 'OPEN', intentId: 'i-qa',
      intentStatus: 'EXECUTED', executionJobId: 'j-qa', executionStatus: 'SUCCEEDED',
      evidenceCount: 1,
    }],
    engineering: [{
      id: 'eng-1', resourceId: 'BASE-5.3.9', status: 'CHANGE_RECORDED', intentId: 'i-eng',
      intentStatus: 'EXECUTED', executionJobId: 'j-eng', executionStatus: 'SUCCEEDED',
      evidenceCount: 1,
    }],
    projectRisk: [{
      id: 'risk-1', resourceId: 'RSK-001', status: 'ESCALATED', intentId: 'i-risk',
      intentStatus: 'EXECUTED', executionJobId: 'j-risk', executionStatus: 'SUCCEEDED',
      evidenceCount: 1,
    }],
  };
  snapshot.digitalThreadLinks = [
    {
      id: 'link-1',
      sourceDomain: 'QA_CAPA',
      sourceRecordId: 'qa-1',
      relationType: 'DRIVES_CHANGE',
      targetDomain: 'ENGINEERING_BASELINE',
      targetRecordId: 'eng-1',
      createdBy: 'qualification',
      createdAt: '2026-10-07T02:00:00.000Z',
    },
    {
      id: 'link-2',
      sourceDomain: 'ENGINEERING_BASELINE',
      sourceRecordId: 'eng-1',
      relationType: 'MITIGATES_RISK',
      targetDomain: 'PROJECT_RISK',
      targetRecordId: 'risk-1',
      createdBy: 'qualification',
      createdAt: '2026-10-07T02:01:00.000Z',
    },
    {
      id: 'dangling',
      sourceDomain: 'QA_CAPA',
      sourceRecordId: 'qa-1',
      relationType: 'RELATED_TO',
      targetDomain: 'PROJECT_RISK',
      targetRecordId: 'missing-risk',
      createdBy: 'qualification',
      createdAt: '2026-10-07T02:02:00.000Z',
    },
  ];

  const graph = buildWorkspaceModel(snapshot).traceGraph;

  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 2);
  assert.deepEqual(graph.edges.map((edge) => edge.relationType), ['DRIVES_CHANGE', 'MITIGATES_RISK']);
  assert.equal(graph.summary.connectedNodes, 3);
  assert.equal(graph.summary.orphanNodes, 0);
  assert.ok(graph.nodes.every((node) => ['qa-capa', 'engineering', 'risk'].includes(node.moduleId)));
});

test('enterprise trace graph preserves unlinked durable records as visible orphan nodes', () => {
  const snapshot = runtimeSnapshot();
  snapshot.domains = {
    qaCapa: [{ id: 'qa-2', resourceId: 'CAPA-002', status: 'OPEN' }],
    engineering: [{ id: 'eng-2', resourceId: 'BASE-5.4', status: 'CHANGE_RECORDED' }],
    projectRisk: [{ id: 'risk-2', resourceId: 'RSK-002', status: 'ESCALATED' }],
  };
  snapshot.digitalThreadLinks = [];

  const graph = buildWorkspaceModel(snapshot).traceGraph;

  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 0);
  assert.equal(graph.summary.connectedNodes, 0);
  assert.equal(graph.summary.orphanNodes, 3);
});
