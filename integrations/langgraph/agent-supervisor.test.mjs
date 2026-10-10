import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentSupervisor } from './agent-supervisor.mjs';

function fixture() {
  const events = [], evidence = new Map();
  const handoff = { id: 'hand-001', work_package_id: 'work-001', to_agent_id: 'project',
    requested_job: 'PROJECT.TRACK_DEPENDENCY', status: 'PENDING', version: 1, evidence_refs: [] };
  const wp = { id: 'work-001', owner_agent_id: 'project', action_type: 'PROJECT.TRACK_DEPENDENCY',
    authority: 1, execution_mode: 'ANALYSE', human_approval_required: false, status: 'READY', depends_on: [] };
  const mission = { mission: { id: 'mission-001', status: 'ACTIVE' }, workPackages: [wp], handoffs: [handoff] };
  const fleet = { agents: [{ id: 'project', name: 'Project Controls' }, { id: 'orchestrator', name: 'Orchestrator' }],
    workforce: { digitalEmployees: ['project', 'orchestrator'].map(id => ({ id, status: 'ACTIVE', qualificationLevel: 2 })) },
    approvals: [{ id: 'approval-001', status: 'PENDING', actionType: 'ENGINEERING.BASELINE_CHANGE' }] };
  const controlService = { async snapshot() { return structuredClone(fleet); } };
  const missionService = {
    async snapshot() { return structuredClone(mission); },
    async transitionHandoff(input) {
      assert.equal(input.handoffId, handoff.id);
      assert.equal(input.expectedVersion, handoff.version);
      const verify = input.outcome === 'VERIFY' || input.outcome === 'REJECT_VERIFICATION';
      assert.equal(input.byAgentId, verify ? 'orchestrator' : 'project');
      handoff.status = { ACCEPT: 'ACCEPTED', SUBMIT: 'SUBMITTED', VERIFY: 'COMPLETED', REJECT_VERIFICATION: 'RETURNED' }[input.outcome];
      handoff.version++;
      handoff.evidence_refs.push(...(input.evidenceRefs || []));
      if (input.outcome === 'VERIFY') handoff.verified_by_agent_id = input.byAgentId;
      wp.status = handoff.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS';
      events.push(input);
      return { handoff: structuredClone(handoff) };
    },
    async recordWorkEvidence(input) {
      assert.equal(input.byAgentId, 'project');
      evidence.set('evidence-001', { handoff_id: handoff.id, report: structuredClone(input.report) });
      return { evidenceId: 'evidence-001' };
    },
    async getWorkEvidence(id) { return structuredClone(evidence.get(id)); },
  };
  let enabled = true;
  return { events, evidence, mission, handoff, wp, fleet, controlService, missionService,
    setEnabled(value) { enabled = value; },
    supervisor() { return createAgentSupervisor({ controlService, missionService, isControlEnabled: () => enabled }); } };
}

test('real LangGraph monitors persisted fleet and mission without transitions or external network', async () => {
  const f = fixture(); const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('UNEXPECTED_NETWORK'); };
  try {
    const result = await f.supervisor().run({ missionId: 'mission-001' });
    assert.equal(result.status, 'OBSERVED');
    assert.equal(result.engine, 'langgraph');
    assert.equal(result.monitor.agents[0].qualified, true);
    assert.equal(result.monitor.agents[0].runtimeLiveness, 'UNVERIFIED');
    assert.equal(result.monitor.pendingApprovals.length, 1);
    assert.equal(result.monitor.mission.handoffs[0].eligible, true);
    assert.deepEqual(f.events, []);
  } finally { globalThis.fetch = originalFetch; }
});

test('one governed handoff is submitted, independently verified and read back', async () => {
  const f = fixture();
  const result = await f.supervisor().run({ operation: 'RUN_SAFE', missionId: 'mission-001' });
  assert.equal(result.status, 'PASS');
  assert.deepEqual(f.events.map(e => [e.outcome, e.byAgentId]), [['ACCEPT', 'project'], ['SUBMIT', 'project'], ['VERIFY', 'orchestrator']]);
  assert.deepEqual(result.evidenceRefs, ['evidence-001']);
  assert.equal(result.businessEffectsExecuted, false);
});

test('disabled control, inactive or underqualified owner/verifier, effectful jobs and altered authority are held', async () => {
  const mutations = [
    f => f.setEnabled(false),
    f => { f.fleet.workforce.digitalEmployees[0].status = 'RESTRICTED'; },
    f => { f.fleet.workforce.digitalEmployees[1].qualificationLevel = 1; },
    f => { f.handoff.requested_job = 'FINANCE.PREPARE_PAYMENT'; },
    f => { f.wp.authority = 5; },
    f => { f.wp.human_approval_required = true; },
    f => { f.wp.status = 'BLOCKED'; },
    f => { f.wp.depends_on = ['missing-work']; },
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f);
    assert.equal((await f.supervisor().run({ operation: 'RUN_SAFE', missionId: 'mission-001' })).status, 'HOLD');
    assert.deepEqual(f.events, []);
  }
});

test('does not review an unrelated previously submitted handoff', async () => {
  const f = fixture();
  f.mission.handoffs.unshift({ ...structuredClone(f.handoff), id: 'unrelated', status: 'SUBMITTED' });
  const result = await f.supervisor().run({ operation: 'RUN_SAFE', missionId: 'mission-001' });
  assert.equal(result.status, 'PASS');
  assert.equal(f.mission.handoffs[0].status, 'SUBMITTED');
  assert.ok(f.events.every(e => e.handoffId === 'hand-001'));
});

test('missing source, duplicate records and wrong mission cannot look healthy or produce controls', async () => {
  for (const mutate of [
    f => { delete f.fleet.workforce; },
    f => { f.mission.mission.id = 'other-mission'; },
    f => { f.mission.handoffs.push(structuredClone(f.handoff)); },
  ]) {
    const f = fixture(); mutate(f);
    assert.equal((await f.supervisor().run({ missionId: 'mission-001' })).status, 'HOLD');
    assert.deepEqual(f.events, []);
  }
});

test('kill switch is checked again before each control phase', async () => {
  const f = fixture(); const record = f.missionService.recordWorkEvidence;
  f.missionService.recordWorkEvidence = async input => { const result = await record(input); f.setEnabled(false); return result; };
  const result = await f.supervisor().run({ operation: 'RUN_SAFE', missionId: 'mission-001' });
  assert.equal(result.status, 'HOLD');
  assert.equal(result.reason, 'LANGGRAPH_CONTROL_DISABLED');
  assert.equal(f.handoff.status, 'SUBMITTED');
  assert.equal(f.events.some(e => e.outcome === 'VERIFY'), false);
});

test('lost write response is held with reconciliation required and no blind retry', async () => {
  const f = fixture(); let calls = 0;
  const record = f.missionService.recordWorkEvidence;
  f.missionService.recordWorkEvidence = async input => { calls++; await record(input); throw new Error('token=never-expose'); };
  const result = await f.supervisor().run({ operation: 'RUN_SAFE', missionId: 'mission-001' });
  assert.equal(result.status, 'HOLD'); assert.equal(result.automaticRetry, false);
  assert.equal(result.reconciliationRequired, true); assert.equal(calls, 1);
  assert.equal(JSON.stringify(result).includes('never-expose'), false);
});

test('tampered evidence, missing reviewer and incomplete persisted transition cannot pass', async () => {
  for (const mutate of [
    f => { f.evidence.get('evidence-001').report.findings = ['fabricated']; },
    f => { delete f.handoff.verified_by_agent_id; },
    f => { f.wp.status = 'IN_PROGRESS'; },
  ]) {
    const f = fixture(); const transition = f.missionService.transitionHandoff;
    f.missionService.transitionHandoff = async input => {
      const result = await transition(input); if (input.outcome === 'VERIFY') mutate(f); return result;
    };
    assert.equal((await f.supervisor().run({ operation: 'RUN_SAFE', missionId: 'mission-001' })).status, 'HOLD');
  }
});

test('repeat of completed work is held and cannot create duplicate evidence', async () => {
  const f = fixture(), supervisor = f.supervisor();
  assert.equal((await supervisor.run({ operation: 'RUN_SAFE', missionId: 'mission-001' })).status, 'PASS');
  assert.equal((await supervisor.run({ operation: 'RUN_SAFE', missionId: 'mission-001' })).reason, 'NO_ELIGIBLE_HANDOFF');
  assert.equal(f.events.length, 3); assert.equal(f.evidence.size, 1);
});

test('arbitrary actions, extra state and invalid mission IDs cannot be graph inputs', async () => {
  const f = fixture();
  await assert.rejects(f.supervisor().run({ operation: 'ACTIVATE_AGENT' }), /LANGGRAPH_REQUEST_INVALID/);
  await assert.rejects(f.supervisor().run({ operation: 'RUN_SAFE' }), /LANGGRAPH_REQUEST_INVALID/);
  await assert.rejects(f.supervisor().run({ missionId: '../mission' }), /LANGGRAPH_REQUEST_INVALID/);
});

test('ambient hosted tracing is refused before any snapshot or transition', async () => {
  const f = fixture(), saved = process.env.LANGSMITH_TRACING;
  process.env.LANGSMITH_TRACING = 'true';
  try {
    const result = await f.supervisor().run({ operation: 'RUN_SAFE', missionId: 'mission-001' });
    assert.equal(result.status, 'HOLD'); assert.deepEqual(f.events, []);
  } finally {
    if (saved === undefined) delete process.env.LANGSMITH_TRACING; else process.env.LANGSMITH_TRACING = saved;
  }
});
