import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMissionConsumer,
  calculateReadOnlyMissionAudit,
  verifyReadOnlyMissionAudit,
  SAFE_MISSION_JOBS,
} from './mission-consumer.mjs';

function fixture() {
  const handoff = {
    id: 'hand-1', mission_id: 'mission-1', work_package_id: 'wp-1',
    to_agent_id: 'project', from_agent_id: 'orchestrator',
    requested_job: 'PROJECT.TRACK_DEPENDENCY',
    status: 'PENDING', version: 1, evidence_refs: [],
  };
  const workPackages = [
    { id: 'wp-1', action_type: 'PROJECT.TRACK_DEPENDENCY', owner_agent_id: 'project', status: 'READY', depends_on: [], human_approval_required: false, execution_mode: 'ANALYSE', authority: 1 },
    { id: 'wp-2', action_type: 'RISK.ASSESS', owner_agent_id: 'risk', status: 'COMPLETED', depends_on: [] },
  ];
  const events = [], reports = new Map();
  const service = {
    async snapshot() { return { mission: { id: 'mission-1', status: 'ACTIVE' }, workPackages, handoffs: [handoff] }; },
    async transitionHandoff(input) {
      assert.equal(input.handoffId, handoff.id);
      assert.equal(input.expectedVersion, handoff.version);
      const mapping = { ACCEPT: 'ACCEPTED', SUBMIT: 'SUBMITTED', VERIFY: 'COMPLETED', REJECT_VERIFICATION: 'RETURNED' };
      if (input.outcome === 'ACCEPT' || input.outcome === 'SUBMIT') assert.equal(input.byAgentId, 'project');
      if (input.outcome === 'VERIFY' || input.outcome === 'REJECT_VERIFICATION') assert.equal(input.byAgentId, 'orchestrator');
      handoff.version += 1;
      handoff.status = mapping[input.outcome];
      handoff.evidence_refs = [...new Set([...handoff.evidence_refs, ...(input.evidenceRefs || [])])];
      workPackages[0].status = handoff.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS';
      events.push(input);
      return { handoff: { ...handoff } };
    },
    async recordWorkEvidence(input) {
      assert.equal(input.handoffId, handoff.id);
      assert.equal(input.byAgentId, 'project');
      assert.equal(input.expectedVersion, handoff.version);
      assert.equal(input.report.kind, 'READ_ONLY_MISSION_AUDIT');
      const evidenceId = 'ev:mission-1:hand-1';
      reports.set(evidenceId, { id: evidenceId, report: input.report, handoff_id: handoff.id });
      return { evidenceId };
    },
    async getWorkEvidence(evidenceId) { return reports.get(evidenceId); },
  };
  return { service, handoff, events, reports };
}

test('only approved deterministic read-only job types are supported', () => {
  assert.deepEqual([...SAFE_MISSION_JOBS].sort(), [
    'KNOWLEDGE.DETECT_GAP', 'PROJECT.TRACK_DEPENDENCY', 'RELEASE.CHECK_OPEN_ITEMS', 'RISK.IDENTIFY',
  ]);
});

test('consumer accepts, records source-backed evidence and submits but cannot self-verify', async () => {
  const f = fixture();
  const consumer = createMissionConsumer({ service: f.service });
  const result = await consumer.consume('mission-1');
  assert.equal(result.submitted, 1);
  assert.equal(result.unsupported, 0);
  assert.deepEqual(f.events.map((event) => event.outcome), ['ACCEPT', 'SUBMIT']);
  assert.equal(f.handoff.status, 'SUBMITTED');
  assert.equal(f.reports.size, 1);
});

test('independent checker must recalculate evidence before verification', async () => {
  const f = fixture();
  const consumer = createMissionConsumer({ service: f.service });
  await consumer.consume('mission-1');
  const review = await consumer.review('mission-1');
  assert.equal(review.verified, 1);
  assert.equal(f.handoff.status, 'COMPLETED');
  assert.deepEqual(f.events.map((event) => event.byAgentId), ['project', 'project', 'orchestrator']);
});

test('tampered audit cannot be independently verified', async () => {
  const f = fixture();
  const consumer = createMissionConsumer({ service: f.service });
  await consumer.consume('mission-1');
  f.reports.values().next().value.report.dependencyCount = 9999;
  const review = await consumer.review('mission-1');
  assert.equal(review.verified, 0);
  assert.equal(review.returned, 1);
  assert.equal(f.handoff.status, 'RETURNED');
  assert.equal(f.events.at(-1).outcome, 'REJECT_VERIFICATION');
});

test('unsupported or effectful job types remain pending, without fabricated evidence', async () => {
  const f = fixture();
  f.handoff.requested_job = 'ENGINEERING.BASELINE_CHANGE';
  f.handoff.to_agent_id = 'vibpe';
  const result = await createMissionConsumer({ service: f.service }).consume('mission-1');
  assert.equal(result.submitted, 0);
  assert.equal(result.unsupported, 1);
  assert.deepEqual(f.events, []);
  assert.equal(f.handoff.status, 'PENDING');
});

test('human-approved work cannot be auto-consumed even when its job name is supported', async () => {
  const f = fixture();
  f.service.snapshot = async () => ({ mission: { id: 'mission-1', status: 'ACTIVE' }, handoffs: [f.handoff], workPackages: [
    { id: 'wp-1', status: 'READY', action_type: 'PROJECT.TRACK_DEPENDENCY', human_approval_required: true, authority: 1, execution_mode: 'ANALYSE', depends_on: [] },
  ] });
  const result = await createMissionConsumer({ service: f.service }).consume('mission-1');
  assert.equal(result.unsupported, 1);
  assert.equal(f.handoff.status, 'PENDING');
});

test('invalid snapshot status and unknown mission are fail-closed', async () => {
  const f = fixture();
  f.service.snapshot = async () => ({ mission: { id: 'mission-1', status: 'HOLD' }, handoffs: [f.handoff], workPackages: [] });
  await assert.rejects(() => createMissionConsumer({ service: f.service }).consume('mission-1'), /MISSION_NOT_ACTIVE/);
  assert.equal(f.events.length, 0);
});

test('read-only audit tracks dependencies and validator independently rejects changed evidence', () => {
  const workPackages = [
    { id: 'wp-1', status: 'COMPLETED', depends_on: [] },
    { id: 'wp-2', status: 'READY', depends_on: ['wp-1'] },
    { id: 'wp-3', status: 'BLOCKED', depends_on: ['unknown'] },
  ];
  const report = calculateReadOnlyMissionAudit('PROJECT.TRACK_DEPENDENCY', workPackages, 'wp-2');
  assert.equal(report.kind, 'READ_ONLY_MISSION_AUDIT');
  assert.equal(report.dependencyCount, 2);
  assert.ok(verifyReadOnlyMissionAudit(report, workPackages, 'wp-2'));
  assert.equal(verifyReadOnlyMissionAudit({ ...report, dependencyCount: 0 }, workPackages, 'wp-2'), false);
});


test('work-package action spoofing cannot trigger the wrong read-only adapter', async () => {
  const f = fixture();
  f.service.snapshot = async () => ({
    mission: { id: 'mission-1', status: 'ACTIVE' },
    handoffs: [f.handoff],
    workPackages: [{
      id: 'wp-1', action_type: 'RISK.ASSESS', owner_agent_id: 'risk',
      status: 'READY', depends_on: [], human_approval_required: false,
      execution_mode: 'ANALYSE', authority: 1,
    }],
  });
  const result = await createMissionConsumer({ service: f.service }).consume('mission-1');
  assert.equal(result.submitted, 0);
  assert.equal(result.unsupported, 1);
  assert.equal(f.events.length, 0);
});


test('risk identification is strictly a mission-blocker screen, not risk scoring or acceptance', () => {
  const items = [
    { id: 'risk-screen', status: 'READY', depends_on: [] },
    { id: 'delayed', status: 'FAILED', depends_on: [] },
    { id: 'blocked', status: 'BLOCKED', depends_on: ['unknown-upstream'] },
    { id: 'ok', status: 'COMPLETED', depends_on: [] },
  ];
  const report = calculateReadOnlyMissionAudit('RISK.IDENTIFY', items, 'risk-screen');
  assert.deepEqual(report.findings, [
    'MISSION_BLOCKER:blocked:BLOCKED',
    'MISSION_BLOCKER:delayed:FAILED',
    'MISSING_DEPENDENCY:blocked:unknown-upstream',
  ]);
  assert.equal(report.kind, 'READ_ONLY_MISSION_AUDIT');
  assert.equal(report.actionType, 'RISK.IDENTIFY');
  assert.equal(verifyReadOnlyMissionAudit(report, items, 'risk-screen'), true);
  assert.equal(verifyReadOnlyMissionAudit({ ...report, findings: [] }, items, 'risk-screen'), false);
  assert.ok(report.findings.every(value => !/SCORE|ACCEPT|MITIGATE/.test(value)));
});

test('risk screen cannot acquire effectful or approval-required authority', async () => {
  const f = fixture();
  f.handoff.requested_job = 'RISK.IDENTIFY';
  f.handoff.to_agent_id = 'risk';
  f.service.snapshot = async () => ({
    mission: { id: 'mission-1', status: 'ACTIVE' },
    handoffs: [f.handoff],
    workPackages: [{
      id: 'wp-1', action_type: 'RISK.IDENTIFY', owner_agent_id: 'risk',
      status: 'READY', depends_on: [], human_approval_required: true,
      execution_mode: 'ANALYSE', authority: 1,
    }],
  });
  const result = await createMissionConsumer({ service: f.service }).consume('mission-1');
  assert.equal(result.submitted, 0);
  assert.equal(result.unsupported, 1);
  assert.equal(f.events.length, 0);
});
