import {
  HANDOFF_OUTCOME,
  buildMissionPlan,
  createGovernedHandoff,
} from '../runtime/vaos-eight-operating-model.mjs';

const VALID_OUTCOMES = new Set(Object.values(HANDOFF_OUTCOME));

function requireStore(store) {
  const required = [
    'createOperatingMission',
    'dispatchOperatingMission',
    'createOperatingHandoff',
    'transitionOperatingHandoff',
    'operatingMissionSnapshot',
    'prepareOperatingMissionClosure',
    'recordWorkEvidence',
    'getWorkEvidence',
    'listRunnableMissions',
  ];
  if (!store || required.some((name) => typeof store[name] !== 'function')) {
    throw new Error('EIGHT_AGENT_OPERATING_STORE_REQUIRED');
  }
  return store;
}

function requiredText(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
}

export function createEightAgentOperatingService({ store } = {}) {
  const durableStore = requireStore(store);

  return Object.freeze({
    async planMission(input = {}) {
      const plan = buildMissionPlan(input);
      return durableStore.createOperatingMission(plan);
    },

    async dispatchMission(missionId, { maxAssignments = 8 } = {}) {
      const id = requiredText(missionId, 'MISSION_ID_REQUIRED');
      if (!Number.isInteger(maxAssignments) || maxAssignments < 1 || maxAssignments > 8) {
        throw new Error('MISSION_DISPATCH_LIMIT_INVALID');
      }
      return durableStore.dispatchOperatingMission(id, { maxAssignments });
    },

    async createHandoff(input = {}) {
      const handoff = createGovernedHandoff(input);
      return durableStore.createOperatingHandoff(handoff);
    },

    async transitionHandoff(input = {}) {
      const handoffId = requiredText(input.handoffId, 'HANDOFF_ID_REQUIRED');
      const outcome = requiredText(input.outcome, 'HANDOFF_OUTCOME_REQUIRED');
      const byAgentId = requiredText(input.byAgentId, 'HANDOFF_ACTOR_REQUIRED');
      if (!VALID_OUTCOMES.has(outcome)) throw new Error('HANDOFF_OUTCOME_INVALID');
      if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
        throw new Error('HANDOFF_EXPECTED_VERSION_INVALID');
      }
      if (input.evidenceRefs !== undefined && !Array.isArray(input.evidenceRefs)) {
        throw new Error('HANDOFF_EVIDENCE_INVALID');
      }

      return durableStore.transitionOperatingHandoff({
        handoffId,
        expectedVersion: input.expectedVersion,
        outcome,
        byAgentId,
        reason: input.reason || null,
        evidenceRefs: input.evidenceRefs || [],
      });
    },

    async recordWorkEvidence(input = {}) {
      const handoffId = requiredText(input.handoffId, 'HANDOFF_ID_REQUIRED');
      const byAgentId = requiredText(input.byAgentId, 'HANDOFF_ACTOR_REQUIRED');
      if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
        throw new Error('HANDOFF_EXPECTED_VERSION_INVALID');
      }
      if (!input.report || typeof input.report !== 'object' || Array.isArray(input.report)) {
        throw new Error('MISSION_EVIDENCE_REPORT_INVALID');
      }
      return durableStore.recordWorkEvidence({
        handoffId,
        expectedVersion: input.expectedVersion,
        byAgentId,
        report: input.report,
      });
    },

    async getWorkEvidence(evidenceId) {
      return durableStore.getWorkEvidence(requiredText(evidenceId, 'MISSION_EVIDENCE_ID_REQUIRED'));
    },

    async listRunnableMissions({ limit = 8 } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 8) {
        throw new Error('MISSION_DISCOVERY_LIMIT_INVALID');
      }
      return durableStore.listRunnableMissions({ limit });
    },

    async prepareMissionClosure(missionId) {
      return durableStore.prepareOperatingMissionClosure(requiredText(missionId, 'MISSION_ID_REQUIRED'));
    },

    snapshot(missionId) {
      return durableStore.operatingMissionSnapshot(
        requiredText(missionId, 'MISSION_ID_REQUIRED'),
      );
    },
  });
}
