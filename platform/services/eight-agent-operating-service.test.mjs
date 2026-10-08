import test from 'node:test';
import assert from 'node:assert/strict';
import { createEightAgentOperatingService } from './eight-agent-operating-service.mjs';

function fakeStore() {
  const calls = [];
  return {
    calls,
    async createOperatingMission(plan) {
      calls.push({ type: 'mission', plan });
      return { outcome: 'CREATED', mission: { id: plan.id, status: 'PLANNED' } };
    },
    async createOperatingHandoff(handoff) {
      calls.push({ type: 'handoff', handoff });
      return { outcome: 'CREATED', handoff: { ...handoff, version: 1 } };
    },
    async transitionOperatingHandoff(input) {
      calls.push({ type: 'transition', input });
      return { outcome: 'UPDATED', handoff: { id: input.handoffId, status: 'COMPLETED', version: input.expectedVersion + 1 } };
    },
    async operatingMissionSnapshot(missionId) {
      calls.push({ type: 'snapshot', missionId });
      return { mission: { id: missionId }, workPackages: [], handoffs: [] };
    },
  };
}

test('service plans and persists a governed mission through the durable store', async () => {
  const store = fakeStore();
  const service = createEightAgentOperatingService({ store });
  const result = await service.planMission({
    missionId: 'mission-service-001',
    objective: 'Assess engineering baseline readiness',
    requestedJobs: ['ENGINEERING.ASSESS_CHANGE', 'RELEASE.ASSESS_GATE'],
  });

  assert.equal(result.outcome, 'CREATED');
  assert.equal(store.calls[0].type, 'mission');
  assert.equal(store.calls[0].plan.createdByAgentId, 'orchestrator');
  assert.ok(store.calls[0].plan.workPackages.some((item) => item.actionType === 'QA.VERIFY_RESULT'));
  assert.ok(store.calls[0].plan.workPackages.some((item) => item.actionType === 'RISK.ASSESS'));
  assert.ok(store.calls[0].plan.workPackages.some((item) => item.actionType === 'KNOWLEDGE.BUILD_EVIDENCE_PACK'));
});

test('service validates handoffs before persistence and preserves controlled outcomes', async () => {
  const store = fakeStore();
  const service = createEightAgentOperatingService({ store });
  const result = await service.createHandoff({
    id: 'handoff-service-001',
    missionId: 'mission-service-001',
    workPackageId: 'mission-service-001-wp-002',
    fromAgentId: 'orchestrator',
    toAgentId: 'vibpe',
    requestedJob: 'ENGINEERING.ASSESS_CHANGE',
    reason: 'Engineering assessment required',
    requiredOutcome: 'Impact assessment',
    acceptanceCriteria: ['technical evidence attached'],
    priority: 'HIGH',
  });
  assert.equal(result.outcome, 'CREATED');
  assert.equal(store.calls[0].handoff.status, 'PENDING');
});

test('service transitions handoffs using optimistic version control', async () => {
  const store = fakeStore();
  const service = createEightAgentOperatingService({ store });
  const result = await service.transitionHandoff({
    handoffId: 'handoff-service-001',
    expectedVersion: 2,
    outcome: 'COMPLETE',
    byAgentId: 'vibpe',
    evidenceRefs: ['ENG-001'],
  });
  assert.equal(result.handoff.version, 3);
  assert.equal(store.calls[0].input.expectedVersion, 2);
});

test('service exposes mission operating snapshots without bypassing the store', async () => {
  const store = fakeStore();
  const service = createEightAgentOperatingService({ store });
  const snapshot = await service.snapshot('mission-service-001');
  assert.equal(snapshot.mission.id, 'mission-service-001');
  assert.equal(store.calls[0].type, 'snapshot');
});
