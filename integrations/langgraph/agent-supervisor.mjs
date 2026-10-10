import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { createMissionConsumer, SAFE_MISSION_JOBS, verifyReadOnlyMissionAudit } from '../../platform/execution/mission-consumer.mjs';
import { routeJob, VAOS_WORKFORCE_QUALIFICATION_FLOOR } from '../../platform/runtime/vaos-eight-operating-model.mjs';

const field = (obj, snake, camel) => obj?.[snake] ?? obj?.[camel];
const safeJobs = new Set(SAFE_MISSION_JOBS);
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/;
const State = Annotation.Root({
  missionId: Annotation(), operation: Annotation(), monitor: Annotation(),
  selected: Annotation(), consumed: Annotation(), reviewed: Annotation(),
  status: Annotation(), reason: Annotation(), evidenceRefs: Annotation(),
});

function workforce(snapshot) {
  const employees = snapshot?.workforce?.digitalEmployees;
  if (!Array.isArray(snapshot?.agents) || snapshot.agents.length === 0 || !Array.isArray(employees)
    || !Array.isArray(snapshot?.approvals)) throw new Error('LANGGRAPH_CONTROL_SNAPSHOT_INVALID');
  const ids = employees.map(e => e?.id);
  if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
    throw new Error('LANGGRAPH_WORKFORCE_INVALID');
  }
  return employees;
}

function qualified(employees, id) {
  const employee = employees.find(e => e.id === id);
  const level = employee?.qualificationLevel;
  return employee?.status === 'ACTIVE' && Number.isInteger(level)
    && level >= VAOS_WORKFORCE_QUALIFICATION_FLOOR[id] && level <= 4;
}

function validMission(snapshot, id) {
  if (snapshot?.mission?.id !== id || !Array.isArray(snapshot?.handoffs)
    || !Array.isArray(snapshot?.workPackages)) throw new Error('LANGGRAPH_MISSION_SNAPSHOT_INVALID');
  for (const items of [snapshot.handoffs, snapshot.workPackages]) {
    const ids = items.map(item => item?.id);
    if (ids.some(value => typeof value !== 'string' || !value) || new Set(ids).size !== ids.length) {
      throw new Error('LANGGRAPH_MISSION_RECORDS_INVALID');
    }
  }
  return snapshot;
}

function assess(handoff, snapshot, employees) {
  const action = field(handoff, 'requested_job', 'requestedJob');
  const owner = field(handoff, 'to_agent_id', 'toAgentId');
  const wp = snapshot.workPackages.find(item => item.id === field(handoff, 'work_package_id', 'workPackageId'));
  if (!wp || !safeJobs.has(action)) return { eligible: false, reason: 'UNSUPPORTED_OR_EFFECTFUL_JOB' };
  const route = routeJob(action);
  const verifier = route.verifierAgentIds.find(id => id !== owner)
    || (owner === 'orchestrator' ? 'project' : 'orchestrator');
  if (snapshot.mission.status !== 'ACTIVE' || !['PENDING', 'ACCEPTED'].includes(handoff.status)) {
    return { eligible: false, reason: 'HANDOFF_NOT_RUNNABLE' };
  }
  if (!['READY', 'IN_PROGRESS'].includes(wp.status)
    || !Array.isArray(field(wp, 'depends_on', 'dependsOn'))
    || field(wp, 'depends_on', 'dependsOn').some(id =>
      snapshot.workPackages.find(item => item.id === id)?.status !== 'COMPLETED')) {
    return { eligible: false, reason: 'WORK_PACKAGE_OR_DEPENDENCY_NOT_READY' };
  }
  if (route.ownerAgentId !== owner || field(wp, 'owner_agent_id', 'ownerAgentId') !== owner
    || field(wp, 'action_type', 'actionType') !== action
    || field(wp, 'execution_mode', 'executionMode') !== route.executionMode
    || !['ANALYSE', 'PREPARE'].includes(route.executionMode)
    || wp.authority !== route.authority || wp.authority > 2
    || route.humanApprovalRequired || field(wp, 'human_approval_required', 'humanApprovalRequired') !== false) {
    return { eligible: false, reason: 'GOVERNANCE_SCOPE_MISMATCH' };
  }
  if (!qualified(employees, owner) || !qualified(employees, verifier)) {
    return { eligible: false, reason: 'OWNER_OR_VERIFIER_NOT_QUALIFIED' };
  }
  return { eligible: true, reason: 'READ_ONLY_GOVERNED_JOB', owner, verifier, action };
}

// No model, hosted graph service, credentials, checkpointer or automatic retry.
// Supabase mission records remain the authoritative progress/evidence store.
export function createAgentSupervisor({ controlService, missionService, isControlEnabled = () => false,
  now = () => new Date().toISOString() } = {}) {
  if (typeof controlService?.snapshot !== 'function' || typeof missionService?.snapshot !== 'function'
    || typeof isControlEnabled !== 'function') throw new Error('LANGGRAPH_SERVICES_REQUIRED');

  function scopedService(selected) {
    return {
      async snapshot(id) {
        const snapshot = validMission(await missionService.snapshot(id), id);
        return { ...snapshot, handoffs: snapshot.handoffs.filter(h => h.id === selected) };
      },
      transitionHandoff: input => missionService.transitionHandoff(input),
      recordWorkEvidence: input => missionService.recordWorkEvidence(input),
      getWorkEvidence: id => missionService.getWorkEvidence(id),
    };
  }

  const graph = new StateGraph(State)
    .addNode('monitor_agents', async state => {
      const control = await controlService.snapshot();
      const employees = workforce(control);
      const mission = state.missionId ? validMission(await missionService.snapshot(state.missionId), state.missionId) : null;
      const agents = control.agents.map(agent => {
        const e = employees.find(item => item.id === agent.id);
        return { id: agent.id, name: agent.name, lifecycle: e?.status || 'UNREGISTERED',
          qualificationLevel: e?.qualificationLevel ?? null, qualified: qualified(employees, agent.id),
          heartbeatAt: e?.heartbeatAt ?? null, runtimeLiveness: 'UNVERIFIED',
          currentAssignment: e?.currentAssignment ?? null };
      });
      const handoffs = mission?.handoffs.map(h => ({ id: h.id, status: h.status,
        owner: field(h, 'to_agent_id', 'toAgentId'), action: field(h, 'requested_job', 'requestedJob'),
        ...assess(h, mission, employees) })) || [];
      const selected = handoffs.find(h => h.eligible)?.id || null;
      return { selected, monitor: { observedAt: now(), source: 'VAOS_PERSISTED_CONTROL_AND_MISSION', agents,
        pendingApprovals: control.approvals.filter(a => a.status === 'PENDING').map(a => ({ id: a.id, actionType: a.actionType })),
        mission: mission ? { id: mission.mission.id, status: mission.mission.status, handoffs,
          blockedWorkPackages: mission.workPackages.filter(w => ['BLOCKED', 'FAILED'].includes(w.status)).map(w => w.id) } : null,
        controls: { runSafeEnabled: isControlEnabled() === true, maxHandoffs: 1, businessWrites: false,
          approvalDecisions: false, lifecycleChanges: false, checkpointResume: false } },
        status: 'OBSERVED', reason: 'PERSISTED_STATE_OBSERVED' };
    })
    .addNode('admit_control', state => {
      if (isControlEnabled() !== true) return { status: 'HOLD', reason: 'LANGGRAPH_CONTROL_DISABLED' };
      if (!state.selected) return { status: 'HOLD', reason: 'NO_ELIGIBLE_HANDOFF' };
      return { status: 'ADMITTED', reason: 'BOUNDED_READ_ONLY_CONTROL' };
    })
    .addNode('consume_handoff', async state => {
      if (isControlEnabled() !== true) return { status: 'HOLD', reason: 'LANGGRAPH_CONTROL_DISABLED' };
      const snapshot = validMission(await missionService.snapshot(state.missionId), state.missionId);
      const employees = workforce(await controlService.snapshot());
      const handoff = snapshot.handoffs.find(h => h.id === state.selected);
      if (!handoff || !assess(handoff, snapshot, employees).eligible) return { status: 'HOLD', reason: 'HANDOFF_ADMISSION_CHANGED' };
      const consumed = await createMissionConsumer({ service: scopedService(state.selected) }).consume(state.missionId, { maxHandoffs: 1 });
      return { consumed, status: consumed.submitted === 1 ? 'SUBMITTED' : 'HOLD',
        reason: consumed.submitted === 1 ? 'EVIDENCE_SUBMITTED' : 'HANDOFF_NOT_SUBMITTED' };
    })
    .addNode('verify_handoff', async state => {
      if (isControlEnabled() !== true) return { status: 'HOLD', reason: 'LANGGRAPH_CONTROL_DISABLED' };
      const employees = workforce(await controlService.snapshot());
      const selected = state.monitor.mission.handoffs.find(h => h.id === state.selected);
      if (!qualified(employees, selected.owner) || !qualified(employees, selected.verifier)) {
        return { status: 'HOLD', reason: 'VERIFIER_ADMISSION_CHANGED' };
      }
      const reviewed = await createMissionConsumer({ service: scopedService(state.selected) }).review(state.missionId, { maxHandoffs: 1 });
      return { reviewed, status: reviewed.verified === 1 ? 'VERIFIED' : 'HOLD',
        reason: reviewed.verified === 1 ? 'INDEPENDENT_ROLE_VERIFIED' : 'INDEPENDENT_VERIFICATION_FAILED' };
    })
    .addNode('readback_evidence', async state => {
      const snapshot = validMission(await missionService.snapshot(state.missionId), state.missionId);
      const h = snapshot.handoffs.find(item => item.id === state.selected);
      const selected = state.monitor.mission.handoffs.find(item => item.id === state.selected);
      const refs = field(h, 'evidence_refs', 'evidenceRefs');
      const originals = Array.isArray(refs) ? refs.filter(ref => typeof ref === 'string' && !ref.startsWith('REVIEWED:')) : [];
      const wp = snapshot.workPackages.find(item => item.id === field(h, 'work_package_id', 'workPackageId'));
      if (h?.status !== 'COMPLETED' || wp?.status !== 'COMPLETED'
        || field(h, 'verified_by_agent_id', 'verifiedByAgentId') !== selected.verifier
        || field(h, 'to_agent_id', 'toAgentId') !== selected.owner
        || field(h, 'requested_job', 'requestedJob') !== selected.action
        || originals.length !== 1 || !refs.includes(`REVIEWED:${originals[0]}`)) {
        return { status: 'HOLD', reason: 'PERSISTED_VERIFICATION_MISSING' };
      }
      const evidence = await missionService.getWorkEvidence(originals[0]);
      if (evidence?.handoff_id !== h.id || evidence?.report?.actionType !== selected.action
        || !verifyReadOnlyMissionAudit(evidence.report, snapshot.workPackages, wp.id)) {
        return { status: 'HOLD', reason: 'PERSISTED_EVIDENCE_INVALID' };
      }
      return { status: 'PASS', reason: 'BOUNDED_HANDOFF_VERIFIED_AND_READ_BACK', evidenceRefs: originals };
    })
    .addEdge(START, 'monitor_agents')
    .addConditionalEdges('monitor_agents', state => state.operation === 'RUN_SAFE' ? 'admit_control' : END)
    .addConditionalEdges('admit_control', state => state.status === 'ADMITTED' ? 'consume_handoff' : END)
    .addConditionalEdges('consume_handoff', state => state.status === 'SUBMITTED' ? 'verify_handoff' : END)
    .addConditionalEdges('verify_handoff', state => state.status === 'VERIFIED' ? 'readback_evidence' : END)
    .addEdge('readback_evidence', END).compile();

  return Object.freeze({
    async run({ operation = 'MONITOR', missionId = null } = {}) {
      if (!['MONITOR', 'RUN_SAFE'].includes(operation) || (missionId !== null && !idPattern.test(missionId))
        || (operation === 'RUN_SAFE' && !missionId)) throw new Error('LANGGRAPH_REQUEST_INVALID');
      try {
        if (operation === 'RUN_SAFE' && ['transitionHandoff', 'recordWorkEvidence', 'getWorkEvidence']
          .some(name => typeof missionService[name] !== 'function')) throw new Error('LANGGRAPH_CONTROL_SERVICE_INCOMPLETE');
        // LangChain can auto-enable hosted tracing from ambient environment variables.
        // Supervision is local-only until a governed tracing path is commissioned.
        const env = globalThis.process?.env || {};
        if (['LANGSMITH_TRACING', 'LANGCHAIN_TRACING_V2', 'LANGCHAIN_TRACING', 'LANGCHAIN_VERBOSE']
          .some(key => env[key] && env[key] !== 'false')) throw new Error('LANGGRAPH_AMBIENT_TRACING_DISABLED');
        const state = await graph.invoke({ operation, missionId }, { recursionLimit: 8, callbacks: [] });
        return { schemaVersion: 'vaos.langgraph-supervisor.v1', engine: 'langgraph', operation, missionId,
          status: state.status, reason: state.reason, monitor: state.monitor,
          consumed: state.consumed || null, reviewed: state.reviewed || null,
          evidenceRefs: state.evidenceRefs || [], businessEffectsExecuted: false };
      } catch {
        // A response-loss can leave submitted evidence in Supabase: never retry the graph here.
        return { schemaVersion: 'vaos.langgraph-supervisor.v1', engine: 'langgraph', operation, missionId,
          status: 'HOLD', reason: 'LANGGRAPH_SOURCE_OR_EXECUTION_UNAVAILABLE',
          reconciliationRequired: operation === 'RUN_SAFE', automaticRetry: false, businessEffectsExecuted: false };
      }
    },
  });
}
