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


test('live operational workspaces derive Agent Control, VIBPE, Projects, Governance, Evidence and Admin from control-plane state', () => {
  const snapshot = runtimeSnapshot();
  snapshot.executions = [
    { id: 'job-1', intentId: 'intent-1', actionType: 'ENGINEERING.BASELINE_CHANGE', status: 'SUCCEEDED', attemptCount: 1, maxAttempts: 5 },
    { id: 'job-2', intentId: 'intent-2', actionType: 'PROJECT.ESCALATE_RISK', status: 'FAILED', attemptCount: 2, maxAttempts: 5 },
  ];
  snapshot.metrics = {
    ...(snapshot.metrics || {}),
    intentCount: 12,
    eventCount: snapshot.events.length,
    executionPending: 1,
    executionSucceeded: 7,
    executionDeadLetter: 0,
    engineeringChanges: 1,
    riskEscalations: 1,
    capaRecords: 1,
  };
  snapshot.domains = {
    qaCapa: [{
      id: 'qa-live-1', resourceId: 'CAPA-LIVE-1', status: 'OPEN',
      intentId: 'intent-qa', intentStatus: 'EXECUTED',
      executionJobId: 'job-qa', executionStatus: 'SUCCEEDED',
      evidenceCount: 1, evidenceVerifiedAt: '2026-10-07T08:00:00.000Z',
      latestEventType: 'EVIDENCE.VERIFIED',
    }],
    engineering: [{
      id: 'eng-live-1', resourceId: 'BASE-LIVE-1', status: 'CHANGE_RECORDED',
      intentId: 'intent-eng', intentStatus: 'EXECUTED',
      approvalId: 'approval-eng', approvalStatus: 'APPROVED',
      executionJobId: 'job-eng', executionStatus: 'SUCCEEDED',
      evidenceCount: 1, evidenceVerifiedAt: '2026-10-07T08:01:00.000Z',
      latestEventType: 'EVIDENCE.VERIFIED',
    }],
    projectRisk: [{
      id: 'risk-live-1', resourceId: 'RSK-LIVE-1', status: 'ESCALATED',
      intentId: 'intent-risk', intentStatus: 'EXECUTED',
      executionJobId: 'job-risk', executionStatus: 'SUCCEEDED',
      evidenceCount: 1, evidenceVerifiedAt: '2026-10-07T08:02:00.000Z',
      latestEventType: 'EVIDENCE.VERIFIED',
    }],
  };

  const model = buildWorkspaceModel(snapshot);

  for (const id of ['agents','vibpe','projects','governance','evidence','admin']) {
    assert.ok(model.operationalViews[id], `missing operational view: ${id}`);
    assert.ok(model.operationalViews[id].summary.length >= 3, `missing summary: ${id}`);
    assert.ok(model.operationalViews[id].rows.length >= 1, `missing live rows: ${id}`);
  }

  assert.equal(model.operationalViews.agents.rows.length, model.agents.length);
  assert.equal(model.operationalViews.vibpe.rows[0].resourceId, 'BASE-LIVE-1');
  assert.equal(model.operationalViews.projects.rows[0].resourceId, 'RSK-LIVE-1');
  assert.equal(model.operationalViews.evidence.summary.find((item) => item.label === 'Verified objects').value, 3);
  assert.equal(model.operationalViews.admin.summary.find((item) => item.label === 'Runtime').value, model.runtimeMode);
});

test('live operational workspaces fail safely when durable domain data is empty', () => {
  const model = buildWorkspaceModel(runtimeSnapshot());
  assert.equal(model.operationalViews.projects.rows.length >= 1, true);
  assert.equal(model.operationalViews.evidence.rows.length >= 1, true);
  assert.equal(model.operationalViews.admin.rows.length >= 1, true);
});


test('durable digital workforce becomes the Agent Control source of truth without falsifying qualification', () => {
  const snapshot = runtimeSnapshot();
  snapshot.workforce = {
    digitalEmployees: [{
      id: 'vibpe',
      name: 'VIBPE Engineering',
      role: 'Engineering Intelligence',
      department: 'Engineering',
      mission: 'Protect engineering baseline integrity.',
      responsibilities: ['Analyse change impact', 'Protect configuration integrity'],
      responsibilityContractId: 'vibpe-contract',
      qualificationLevel: 0,
      status: 'PROPOSED',
      capabilities: { 'ENGINEERING.BASELINE_CHANGE': 5 },
      owner: 'Enterprise',
      supervisor: 'Human governance',
      autonomyLevel: 4,
      currentAssignment: 'Monitor engineering baseline changes',
      priority: 'HIGH',
      confidence: 94,
      heartbeatAt: null,
      modelRequirements: { minimumQualification: 'Q3_ENGINEERING' },
      costBudget: { mode: 'governed', limitConfigured: false },
      sla: { class: 'engineering' },
      memoryPolicy: { scope: 'role' },
      contextPolicy: { sourceAuthority: 'required' },
      evidenceRefs: [],
    }],
    responsibilityContracts: [{
      id: 'vibpe-contract',
      role: 'Engineering Intelligence',
      mission: 'Protect engineering baseline integrity.',
      outcomes: ['Engineering changes remain traceable'],
      autonomousActions: [],
      approvalRequiredActions: ['ENGINEERING.BASELINE_CHANGE'],
      prohibitedActions: [],
      escalationConditions: ['Verification evidence missing'],
      approvalThresholds: { baselineChange: 'human-approval' },
      evidenceRequirements: ['Verification evidence'],
    }],
    metrics: {
      totalDigitalEmployees: 1,
      proposedDigitalEmployees: 1,
      qualifiedDigitalEmployees: 0,
      activeDigitalEmployees: 0,
      restrictedDigitalEmployees: 0,
      responsibilityContracts: 1,
    },
  };

  const model = buildWorkspaceModel(snapshot);
  const view = model.operationalViews.agents;

  assert.equal(model.workforce.digitalEmployees.length, 1);
  assert.equal(model.workforce.digitalEmployees[0].lifecycleStatus, 'PROPOSED');
  assert.equal(model.workforce.digitalEmployees[0].runtimeStatus, 'approval');
  assert.equal(view.title, 'Digital Workforce Console');
  assert.equal(view.summary.find((item) => item.label === 'Proposed / Q0').value, 1);
  assert.equal(view.rows[0].kind, 'digital-employee');
  assert.equal(view.rows[0].meta.find((item) => item.label === 'Qualification').value, 'Q0');
  assert.deepEqual(view.rows[0].contract.approvalRequiredActions, ['ENGINEERING.BASELINE_CHANGE']);
});

test('Agent Control falls back to the legacy runtime fleet when no durable workforce snapshot exists', () => {
  const model = buildWorkspaceModel(runtimeSnapshot());
  assert.equal(model.workforce.digitalEmployees.length, 0);
  assert.equal(model.operationalViews.agents.title, 'Live Agent Fleet');
  assert.equal(model.operationalViews.agents.rows.length, model.agents.length);
});


test('Digital Workforce rows expose only valid next lifecycle actions', () => {
  const snapshot = runtimeSnapshot();
  snapshot.workforce = {
    digitalEmployees: [{
      id: 'orchestrator',
      name: 'VAOS Orchestrator',
      role: 'Enterprise Orchestrator',
      department: 'Enterprise Operations',
      mission: 'Coordinate governed enterprise work.',
      responsibilities: ['Coordinate work'],
      responsibilityContractId: 'orchestrator-contract',
      qualificationLevel: 0,
      status: 'PROPOSED',
      capabilities: { 'WORKFORCE.START_TRAINING': 4 },
      owner: 'Enterprise',
      supervisor: 'Human governance',
      autonomyLevel: 4,
      currentAssignment: 'Bootstrap qualification',
      priority: 'HIGH',
      confidence: 97,
      modelRequirements: { minimumQualification: 'Q2_BUSINESS' },
      evidenceRefs: [],
    }],
    responsibilityContracts: [],
    metrics: { totalDigitalEmployees: 1, proposedDigitalEmployees: 1, qualifiedDigitalEmployees: 0, activeDigitalEmployees: 0, restrictedDigitalEmployees: 0, responsibilityContracts: 0 },
  };

  const row = buildWorkspaceModel(snapshot).operationalViews.agents.rows[0];
  assert.deepEqual(row.actions.map((item) => item.actionType), ['WORKFORCE.START_TRAINING','WORKFORCE.RETIRE']);
  assert.equal(row.resourceId, 'orchestrator');

  snapshot.workforce.digitalEmployees[0].status = 'TRAINING';
  const training = buildWorkspaceModel(snapshot).operationalViews.agents.rows[0];
  assert.deepEqual(training.actions.map((item) => item.actionType), ['WORKFORCE.RETIRE']);
});

test('VIBPE Q3 training requires a PASS assessment before Qualify is exposed', () => {
  const snapshot = runtimeSnapshot();
  snapshot.workforce = {
    digitalEmployees: [{
      id: 'vibpe',
      name: 'VIBPE Engineering',
      role: 'Engineering Intelligence',
      department: 'Engineering',
      mission: 'Protect engineering baseline integrity.',
      responsibilities: ['Protect configuration integrity'],
      responsibilityContractId: 'vibpe-contract',
      qualificationLevel: 0,
      status: 'TRAINING',
      capabilities: { 'ENGINEERING.BASELINE_CHANGE': 5 },
      owner: 'Enterprise',
      supervisor: 'Human governance',
      autonomyLevel: 4,
      currentAssignment: 'Qualification',
      priority: 'HIGH',
      confidence: 94,
      modelRequirements: { minimumQualification: 'Q3_ENGINEERING' },
      evidenceRefs: [],
      latestAssessment: null,
    }],
    responsibilityContracts: [],
    metrics: { totalDigitalEmployees: 1, proposedDigitalEmployees: 0, qualifiedDigitalEmployees: 0, activeDigitalEmployees: 0, restrictedDigitalEmployees: 0, responsibilityContracts: 0 },
  };

  let row = buildWorkspaceModel(snapshot).operationalViews.agents.rows[0];
  assert.equal(row.actions[0].actionType, 'WORKFORCE.ASSESS_QUALIFICATION');
  assert.equal(row.actions[0].profileId, 'VIBPE_Q3_ENGINEERING_BASELINE_GOVERNANCE_V1');

  snapshot.workforce.digitalEmployees[0].latestAssessment = {
    id: 'assessment-1',
    targetLevel: 3,
    profileId: 'VIBPE_Q3_ENGINEERING_BASELINE_GOVERNANCE_V1',
    scope: 'ENGINEERING_BASELINE_GOVERNANCE',
    status: 'PASS',
    criteria: [],
    results: {},
    evidenceRefs: [],
  };
  row = buildWorkspaceModel(snapshot).operationalViews.agents.rows[0];
  assert.equal(row.actions[0].actionType, 'WORKFORCE.QUALIFY');
  assert.equal(row.actions[0].recommendedQualificationLevel, 3);
  assert.deepEqual(row.actions[0].evidenceRefs, ['qualification_assessment:assessment-1']);
});

test('QA Q3 training requires a CAPA governance PASS assessment before Qualify is exposed', () => {
  const snapshot = runtimeSnapshot();
  snapshot.workforce = {
    digitalEmployees: [{
      id: 'qa',
      name: 'QA / CAPA Agent',
      role: 'Quality Assurance',
      department: 'Quality',
      mission: 'Protect product and process quality.',
      responsibilities: ['Prepare CAPA', 'Verify closure evidence'],
      responsibilityContractId: 'qa-contract',
      qualificationLevel: 0,
      status: 'TRAINING',
      capabilities: { 'QA.OPEN_CAPA': 4 },
      owner: 'Enterprise',
      supervisor: 'Human governance',
      autonomyLevel: 4,
      currentAssignment: 'Qualification',
      priority: 'HIGH',
      confidence: 94,
      modelRequirements: { minimumQualification: 'Q3_ENGINEERING' },
      evidenceRefs: [],
      latestAssessment: null,
    }],
    responsibilityContracts: [],
    metrics: { totalDigitalEmployees: 1, proposedDigitalEmployees: 0, qualifiedDigitalEmployees: 0, activeDigitalEmployees: 0, restrictedDigitalEmployees: 0, responsibilityContracts: 0 },
  };

  let row = buildWorkspaceModel(snapshot).operationalViews.agents.rows[0];
  assert.equal(row.actions[0].actionType, 'WORKFORCE.ASSESS_QUALIFICATION');
  assert.equal(row.actions[0].profileId, 'QA_Q3_CAPA_GOVERNANCE_V1');

  snapshot.workforce.digitalEmployees[0].latestAssessment = {
    id: 'qa-assessment-1',
    targetLevel: 3,
    profileId: 'QA_Q3_CAPA_GOVERNANCE_V1',
    scope: 'CAPA_GOVERNANCE',
    status: 'PASS',
    criteria: [],
    results: {},
    evidenceRefs: [],
  };
  row = buildWorkspaceModel(snapshot).operationalViews.agents.rows[0];
  assert.equal(row.actions[0].actionType, 'WORKFORCE.QUALIFY');
  assert.equal(row.actions[0].recommendedQualificationLevel, 3);
  assert.deepEqual(row.actions[0].evidenceRefs, ['qualification_assessment:qa-assessment-1']);
});


test('Risk Q3 training requires an enterprise-risk governance PASS assessment before Qualify is exposed', () => {
  const snapshot = runtimeSnapshot();
  snapshot.workforce = {
    digitalEmployees: [{
      id: 'risk',
      name: 'Risk Agent',
      role: 'Enterprise Risk',
      department: 'Governance',
      mission: 'Monitor enterprise exposure and escalate governed risks.',
      responsibilities: ['Escalate material risk', 'Track mitigation evidence'],
      responsibilityContractId: 'risk-contract',
      qualificationLevel: 0,
      status: 'TRAINING',
      capabilities: { 'PROJECT.ESCALATE_RISK': 4 },
      owner: 'Enterprise',
      supervisor: 'Human governance',
      autonomyLevel: 4,
      currentAssignment: 'Qualification',
      priority: 'HIGH',
      confidence: 94,
      modelRequirements: { minimumQualification: 'Q3_ENTERPRISE_RISK' },
      evidenceRefs: [],
      latestAssessment: null,
    }],
    responsibilityContracts: [],
    metrics: { totalDigitalEmployees: 1, proposedDigitalEmployees: 0, qualifiedDigitalEmployees: 0, activeDigitalEmployees: 0, restrictedDigitalEmployees: 0, responsibilityContracts: 0 },
  };

  let row = buildWorkspaceModel(snapshot).operationalViews.agents.rows[0];
  assert.equal(row.actions[0].actionType, 'WORKFORCE.ASSESS_QUALIFICATION');
  assert.equal(row.actions[0].profileId, 'RISK_Q3_ENTERPRISE_RISK_GOVERNANCE_V1');

  snapshot.workforce.digitalEmployees[0].latestAssessment = {
    id: 'risk-assessment-1',
    targetLevel: 3,
    profileId: 'RISK_Q3_ENTERPRISE_RISK_GOVERNANCE_V1',
    scope: 'ENTERPRISE_RISK_GOVERNANCE',
    status: 'PASS',
    criteria: [],
    results: {},
    evidenceRefs: [],
  };
  row = buildWorkspaceModel(snapshot).operationalViews.agents.rows[0];
  assert.equal(row.actions[0].actionType, 'WORKFORCE.QUALIFY');
  assert.equal(row.actions[0].recommendedQualificationLevel, 3);
  assert.deepEqual(row.actions[0].evidenceRefs, ['qualification_assessment:risk-assessment-1']);
});
