import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTHORITY } from '../../packages/contracts/agent.mjs';
import {
  ORIGINAL_VAOS_AGENT_IDS,
  VAOS_JOB_CATALOG,
  HANDOFF_OUTCOME,
  createGovernedHandoff,
  transitionGovernedHandoff,
  buildMissionPlan,
  routeJob,
  arbitrateAgentFindings,
  rankWorkQueue,
  evaluateWorkSla,
  evaluateAgentRequalification,
  summarizeAgentPerformance,
  selectReadyWorkPackages,
  dueMonitoringJobs,
  assessOperatingModelQualification,
} from './vaos-eight-operating-model.mjs';

const EXPECTED_AGENTS = [
  'orchestrator',
  'project',
  'vibpe',
  'qa',
  'risk',
  'security',
  'knowledge',
  'release',
];

test('the definitive operating model covers the original eight VAOS agents only', () => {
  assert.deepEqual([...ORIGINAL_VAOS_AGENT_IDS], EXPECTED_AGENTS);
  assert.deepEqual(Object.keys(VAOS_JOB_CATALOG), EXPECTED_AGENTS);
  for (const agentId of EXPECTED_AGENTS) {
    assert.ok(VAOS_JOB_CATALOG[agentId].length >= 8, `${agentId} must have a real job family`);
  }
  for (const jobs of Object.values(VAOS_JOB_CATALOG)) {
    for (const job of jobs) {
      assert.equal(job.ownerAgentId.length > 0, true);
      assert.equal(job.ownerAgentId, EXPECTED_AGENTS.find((id) => id === job.ownerAgentId));
      assert.match(job.actionType, /^[A-Z][A-Z0-9_]*(\.[A-Z][A-Z0-9_]*)+$/);
      assert.ok(Number.isInteger(job.authority));
      assert.ok(job.authority >= AUTHORITY.OBSERVE && job.authority <= AUTHORITY.AUTONOMOUS_EXECUTION);
      assert.ok(['low', 'medium', 'high', 'critical'].includes(job.risk));
      assert.ok(Array.isArray(job.kpis) && job.kpis.length > 0);
      assert.ok(typeof job.slaHours === 'number' && job.slaHours > 0);
    }
  }
});

test('Release remains independent and recommendation-only across its complete job family', () => {
  for (const job of VAOS_JOB_CATALOG.release) {
    assert.ok(job.authority <= AUTHORITY.RECOMMEND);
    assert.notEqual(job.executionMode, 'EXECUTE');
  }
});

test('high-impact jobs enforce maker-checker separation or explicit human approval', () => {
  for (const jobs of Object.values(VAOS_JOB_CATALOG)) {
    for (const job of jobs.filter((entry) => ['high', 'critical'].includes(entry.risk))) {
      const route = routeJob(job.actionType);
      assert.equal(route.ownerAgentId, job.ownerAgentId);
      assert.ok(route.humanApprovalRequired || route.verifierAgentIds.some((id) => id !== route.ownerAgentId));
      assert.equal(route.verifierAgentIds.includes('orchestrator') && route.ownerAgentId === 'orchestrator', false);
    }
  }
});

test('governed handoffs use a closed state machine and preserve lineage', () => {
  const handoff = createGovernedHandoff({
    id: 'handoff-001',
    missionId: 'mission-001',
    workPackageId: 'wp-001',
    fromAgentId: 'orchestrator',
    toAgentId: 'vibpe',
    requestedJob: 'ENGINEERING.ASSESS_REQUIREMENT',
    reason: 'Technical assessment required',
    requiredOutcome: 'Verified engineering assessment',
    acceptanceCriteria: ['requirement assessed', 'evidence attached'],
    evidenceRefs: ['REQ-001'],
    priority: 'HIGH',
  });

  const accepted = transitionGovernedHandoff(handoff, {
    outcome: HANDOFF_OUTCOME.ACCEPT,
    byAgentId: 'vibpe',
    evidenceRefs: ['REQ-001', 'ACK-001'],
  });
  assert.equal(accepted.status, 'ACCEPTED');
  assert.equal(accepted.history.length, 2);
  assert.deepEqual(accepted.evidenceRefs, ['REQ-001', 'ACK-001']);

  const completed = transitionGovernedHandoff(accepted, {
    outcome: HANDOFF_OUTCOME.COMPLETE,
    byAgentId: 'vibpe',
    evidenceRefs: ['ENG-ASSESS-001'],
  });
  assert.equal(completed.status, 'COMPLETED');
  assert.deepEqual(completed.evidenceRefs, ['REQ-001', 'ACK-001', 'ENG-ASSESS-001']);

  assert.throws(
    () => transitionGovernedHandoff(completed, {
      outcome: HANDOFF_OUTCOME.ACCEPT,
      byAgentId: 'vibpe',
    }),
    /HANDOFF_TRANSITION_INVALID/,
  );
});

test('handoff recipient can request information, return work, reject invalid work or escalate', () => {
  const base = {
    id: 'handoff-002',
    missionId: 'mission-001',
    workPackageId: 'wp-002',
    fromAgentId: 'orchestrator',
    toAgentId: 'knowledge',
    requestedJob: 'KNOWLEDGE.BUILD_EVIDENCE_PACK',
    reason: 'Release evidence needed',
    requiredOutcome: 'Evidence pack',
    acceptanceCriteria: ['all sources authoritative'],
  };

  for (const outcome of [
    HANDOFF_OUTCOME.REQUEST_INFORMATION,
    HANDOFF_OUTCOME.REJECT_INVALID,
  ]) {
    const result = transitionGovernedHandoff(createGovernedHandoff(base), {
      outcome,
      byAgentId: 'knowledge',
      reason: 'Input insufficient',
    });
    assert.ok(['INFORMATION_REQUIRED', 'REJECTED'].includes(result.status));
  }

  const accepted = transitionGovernedHandoff(createGovernedHandoff(base), {
    outcome: HANDOFF_OUTCOME.ACCEPT,
    byAgentId: 'knowledge',
  });
  const returned = transitionGovernedHandoff(accepted, {
    outcome: HANDOFF_OUTCOME.RETURN_FOR_CORRECTION,
    byAgentId: 'knowledge',
    reason: 'Source authority unresolved',
  });
  assert.equal(returned.status, 'RETURNED');

  const escalated = transitionGovernedHandoff(accepted, {
    outcome: HANDOFF_OUTCOME.ESCALATE,
    byAgentId: 'knowledge',
    reason: 'Conflicting authoritative sources',
  });
  assert.equal(escalated.status, 'ESCALATED');
});

test('mission planning produces a dependency-safe DAG and includes verification work', () => {
  const mission = buildMissionPlan({
    missionId: 'mission-release-001',
    objective: 'Assess an engineering baseline for release readiness',
    requestedJobs: [
      'ENGINEERING.ASSESS_REQUIREMENT',
      'ENGINEERING.ASSESS_CHANGE',
      'QA.VERIFY_RESULT',
      'RISK.ASSESS',
      'KNOWLEDGE.BUILD_EVIDENCE_PACK',
      'RELEASE.ASSESS_GATE',
    ],
  });

  assert.equal(mission.id, 'mission-release-001');
  assert.equal(mission.status, 'PLANNED');
  assert.ok(mission.workPackages.length >= 6);
  assert.equal(new Set(mission.workPackages.map((item) => item.id)).size, mission.workPackages.length);

  const release = mission.workPackages.find((item) => item.actionType === 'RELEASE.ASSESS_GATE');
  assert.ok(release);
  const dependencyActions = release.dependsOn
    .map((id) => mission.workPackages.find((item) => item.id === id)?.actionType);
  assert.ok(dependencyActions.includes('QA.VERIFY_RESULT'));
  assert.ok(dependencyActions.includes('RISK.ASSESS'));
  assert.ok(dependencyActions.includes('KNOWLEDGE.BUILD_EVIDENCE_PACK'));
});

test('conflict arbitration is fail-closed with security, quality, risk, evidence and release holds', () => {
  assert.equal(arbitrateAgentFindings([{ agentId: 'security', disposition: 'DENY' }]).decision, 'HOLD_SECURITY');
  assert.equal(arbitrateAgentFindings([{ agentId: 'qa', disposition: 'REJECT' }]).decision, 'RETURN_FOR_CORRECTION');
  assert.equal(arbitrateAgentFindings([{ agentId: 'risk', disposition: 'ESCALATE' }]).decision, 'HOLD_RISK');
  assert.equal(arbitrateAgentFindings([{ agentId: 'knowledge', disposition: 'EVIDENCE_GAP' }]).decision, 'REQUEST_INFORMATION');
  assert.equal(arbitrateAgentFindings([{ agentId: 'release', disposition: 'HOLD' }]).decision, 'HOLD_RELEASE');
  assert.equal(
    arbitrateAgentFindings([
      { agentId: 'vibpe', disposition: 'READY' },
      { agentId: 'qa', disposition: 'READY' },
    ]).decision,
    'PROCEED',
  );
});

test('work queues prioritize criticality, overdue status and due time deterministically', () => {
  const ranked = rankWorkQueue([
    { id: 'low-later', priority: 'LOW', dueAt: '2026-10-10T10:00:00Z' },
    { id: 'critical-later', priority: 'CRITICAL', dueAt: '2026-10-10T10:00:00Z' },
    { id: 'high-overdue', priority: 'HIGH', dueAt: '2026-10-08T08:00:00Z' },
  ], { now: '2026-10-08T10:00:00Z' });

  assert.deepEqual(ranked.map((item) => item.id), ['high-overdue', 'critical-later', 'low-later']);
});

test('SLA evaluation exposes healthy, at-risk and breached work without guessing', () => {
  assert.equal(evaluateWorkSla({
    startedAt: '2026-10-08T08:00:00Z',
    dueAt: '2026-10-08T12:00:00Z',
    now: '2026-10-08T09:00:00Z',
  }).state, 'HEALTHY');

  assert.equal(evaluateWorkSla({
    startedAt: '2026-10-08T08:00:00Z',
    dueAt: '2026-10-08T12:00:00Z',
    now: '2026-10-08T11:30:00Z',
  }).state, 'AT_RISK');

  assert.equal(evaluateWorkSla({
    startedAt: '2026-10-08T08:00:00Z',
    dueAt: '2026-10-08T12:00:00Z',
    now: '2026-10-08T12:01:00Z',
  }).state, 'BREACHED');
});

test('agent performance KPIs capture completion, rework, SLA and verification', () => {
  const summary = summarizeAgentPerformance([
    { status: 'COMPLETED', verification: 'PASS', reworkCount: 0, slaState: 'HEALTHY' },
    { status: 'COMPLETED', verification: 'PASS', reworkCount: 1, slaState: 'AT_RISK' },
    { status: 'FAILED', verification: 'FAIL', reworkCount: 1, slaState: 'BREACHED' },
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.completed, 2);
  assert.equal(summary.verified, 2);
  assert.equal(summary.reworked, 2);
  assert.equal(summary.slaBreached, 1);
  assert.equal(summary.completionRate, 2 / 3);
});

test('qualification drift forces retraining for stale qualification, new job authority or poor evidence', () => {
  assert.equal(evaluateAgentRequalification({
    qualificationLevel: 3,
    qualifiedAt: '2025-01-01T00:00:00Z',
    now: '2026-10-08T00:00:00Z',
    maximumQualificationAgeDays: 365,
    requiredQualificationLevel: 3,
    jobCatalogVersion: '2.0.0',
    qualifiedJobCatalogVersion: '2.0.0',
    verificationFailureRate: 0,
    criticalIncidents: 0,
  }).required, true);

  assert.equal(evaluateAgentRequalification({
    qualificationLevel: 2,
    qualifiedAt: '2026-10-01T00:00:00Z',
    now: '2026-10-08T00:00:00Z',
    maximumQualificationAgeDays: 365,
    requiredQualificationLevel: 3,
    jobCatalogVersion: '2.0.0',
    qualifiedJobCatalogVersion: '1.0.0',
    verificationFailureRate: 0.25,
    criticalIncidents: 1,
  }).required, true);

  assert.equal(evaluateAgentRequalification({
    qualificationLevel: 3,
    qualifiedAt: '2026-10-01T00:00:00Z',
    now: '2026-10-08T00:00:00Z',
    maximumQualificationAgeDays: 365,
    requiredQualificationLevel: 3,
    jobCatalogVersion: '2.0.0',
    qualifiedJobCatalogVersion: '2.0.0',
    verificationFailureRate: 0.01,
    criticalIncidents: 0,
  }).required, false);
});


test('expanded job families do not silently grant new effect execution authority', () => {
  const qualifiedEffectActions = new Set([
    'PROJECT.ESCALATE_RISK',
    'ENGINEERING.BASELINE_CHANGE',
    'QA.OPEN_CAPA',
    'SECURITY.OBSERVE_IDENTITY',
    'DIGITAL_THREAD.CREATE_LINK',
  ]);
  for (const jobs of Object.values(VAOS_JOB_CATALOG)) {
    for (const job of jobs) {
      if (job.executionMode === 'GOVERNED_EXECUTION') {
        assert.ok(qualifiedEffectActions.has(job.actionType), `${job.actionType} must be separately qualified before execution`);
      }
    }
  }
});

test('monitoring jobs declare cadence and become due deterministically', () => {
  const monitoringJobs = Object.values(VAOS_JOB_CATALOG).flat().filter((job) => job.monitoring);
  assert.ok(monitoringJobs.length >= 8);
  for (const job of monitoringJobs) {
    assert.ok(Number.isFinite(job.monitoringIntervalMinutes) && job.monitoringIntervalMinutes > 0);
  }

  const due = dueMonitoringJobs({
    now: '2026-10-08T12:00:00Z',
    lastRuns: {
      'ORCHESTRATOR.MONITOR_MISSION': '2026-10-08T11:00:00Z',
      'PROJECT.TRACK_DEPENDENCY': '2026-10-08T11:59:00Z',
    },
  });
  assert.ok(due.some((job) => job.actionType === 'ORCHESTRATOR.MONITOR_MISSION'));
  assert.equal(due.some((job) => job.actionType === 'PROJECT.TRACK_DEPENDENCY'), false);
});

test('dispatcher releases only dependency-complete work and avoids duplicate open handoffs', () => {
  const mission = buildMissionPlan({
    missionId: 'mission-dispatch-001',
    objective: 'Assess baseline readiness',
    requestedJobs: ['ENGINEERING.ASSESS_CHANGE', 'RELEASE.ASSESS_GATE'],
  });

  const first = selectReadyWorkPackages({
    workPackages: mission.workPackages,
    handoffs: [],
  });
  assert.ok(first.some((item) => item.actionType === 'ENGINEERING.ASSESS_REQUIREMENT'));
  assert.ok(first.some((item) => item.actionType === 'RISK.ASSESS'));
  assert.equal(first.some((item) => item.actionType === 'RELEASE.ASSESS_GATE'), false);

  const risk = mission.workPackages.find((item) => item.actionType === 'RISK.ASSESS');
  const withOpenHandoff = selectReadyWorkPackages({
    workPackages: mission.workPackages,
    handoffs: [{ workPackageId: risk.id, status: 'PENDING' }],
  });
  assert.equal(withOpenHandoff.some((item) => item.id === risk.id), false);
});

test('existing qualification floors cover every original-eight job family without changing Release authority', () => {
  const workforce = [
    { id: 'knowledge', status: 'ACTIVE', qualificationLevel: 2 },
    { id: 'orchestrator', status: 'ACTIVE', qualificationLevel: 2 },
    { id: 'project', status: 'ACTIVE', qualificationLevel: 2 },
    { id: 'qa', status: 'ACTIVE', qualificationLevel: 3 },
    { id: 'release', status: 'ACTIVE', qualificationLevel: 2 },
    { id: 'risk', status: 'ACTIVE', qualificationLevel: 3 },
    { id: 'security', status: 'ACTIVE', qualificationLevel: 4 },
    { id: 'vibpe', status: 'ACTIVE', qualificationLevel: 3 },
  ];
  const assessment = assessOperatingModelQualification(workforce);
  assert.equal(assessment.qualified, true);
  assert.equal(assessment.qualifiedAgents, 8);
  assert.equal(assessment.qualifiedJobs, Object.values(VAOS_JOB_CATALOG).flat().length);

  const degraded = assessOperatingModelQualification(
    workforce.map((employee) => employee.id === 'security'
      ? { ...employee, qualificationLevel: 3 }
      : employee),
  );
  assert.equal(degraded.qualified, false);
  assert.ok(degraded.gaps.some((gap) => gap.agentId === 'security'));
});
