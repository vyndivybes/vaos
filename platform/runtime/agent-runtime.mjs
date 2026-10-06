import { validateAgentDefinition } from '../../packages/contracts/agent.mjs';
import { createApprovalQueue } from './approval-queue.mjs';
import { createEventBus } from './event-bus.mjs';
import { stableHash, stableStringify } from './idempotency.mjs';
import { evaluateActionPolicy, POLICY_DECISION } from './policy-engine.mjs';

function cloneAgent(agent) {
  return { ...agent, capabilities: { ...agent.capabilities } };
}

function cloneResult(result) {
  return result ? { ...result } : null;
}

export function createAgentRuntime({
  now,
  eventIdFactory,
  approvalIdFactory,
} = {}) {
  const bus = createEventBus({ now, idFactory: eventIdFactory });
  const approvals = createApprovalQueue({ now, idFactory: approvalIdFactory });
  const agents = new Map();
  const intentResults = new Map();

  function registerAgent(agent) {
    const validation = validateAgentDefinition(agent);
    if (!validation.ok) throw new Error(`AGENT_DEFINITION_INVALID:${validation.errors.join(',')}`);

    const existing = agents.get(agent.id);
    if (existing) {
      if (stableStringify(existing) === stableStringify(agent)) return cloneAgent(existing);
      throw new Error('AGENT_REGISTRATION_CONFLICT');
    }

    const normalized = Object.freeze({
      ...agent,
      capabilities: Object.freeze({ ...agent.capabilities }),
    });

    agents.set(normalized.id, normalized);
    bus.publish({
      type: 'AGENT.REGISTERED',
      source: 'vaos-runtime',
      payload: {
        agentId: normalized.id,
        domain: normalized.domain,
        capabilityCount: Object.keys(normalized.capabilities).length,
      },
    });

    return cloneAgent(normalized);
  }

  function cacheResult(idempotencyKey, intentHash, result) {
    intentResults.set(idempotencyKey, { intentHash, result: { ...result } });
    return cloneResult(result);
  }

  function replayOrConflict(intent) {
    const existing = intentResults.get(intent.idempotencyKey);
    if (!existing) return null;
    const intentHash = stableHash(intent);
    if (existing.intentHash !== intentHash) throw new Error('IDEMPOTENCY_CONFLICT');
    return cloneResult(existing.result);
  }

  function publishDenied(intent, reason) {
    bus.publish({
      type: 'GOVERNANCE.ACTION_DENIED',
      source: 'vaos-runtime',
      payload: {
        agentId: intent.agentId,
        actionType: intent.actionType,
        reason,
      },
    });
  }

  function proposeIntent(intent) {
    if (!intent?.idempotencyKey) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
    if (!intent?.agentId || !intent?.actionType) throw new Error('INVALID_INTENT');

    const replay = replayOrConflict(intent);
    if (replay) return replay;

    const intentHash = stableHash(intent);
    const agent = agents.get(intent.agentId);

    if (!agent) {
      const result = {
        status: 'DENIED',
        reason: 'AGENT_NOT_FOUND',
        effectExecuted: false,
      };
      publishDenied(intent, result.reason);
      return cacheResult(intent.idempotencyKey, intentHash, result);
    }

    const authority = agent.capabilities[intent.actionType];
    if (authority === undefined) {
      const result = {
        status: 'DENIED',
        reason: 'CAPABILITY_NOT_GRANTED',
        effectExecuted: false,
      };
      publishDenied(intent, result.reason);
      return cacheResult(intent.idempotencyKey, intentHash, result);
    }

    const policy = evaluateActionPolicy({
      actionType: intent.actionType,
      authority,
      risk: intent.risk,
    });

    if (policy.decision === POLICY_DECISION.DENY) {
      const result = {
        status: 'DENIED',
        reason: policy.reason,
        effectExecuted: false,
      };
      publishDenied(intent, result.reason);
      return cacheResult(intent.idempotencyKey, intentHash, result);
    }

    if (policy.decision === POLICY_DECISION.PREPARE_ONLY) {
      const result = {
        status: 'PREPARED',
        reason: policy.reason,
        effectExecuted: false,
        authority,
      };
      bus.publish({
        type: 'AGENT.ACTION_PREPARED',
        source: agent.id,
        payload: { actionType: intent.actionType, idempotencyKey: intent.idempotencyKey },
      });
      return cacheResult(intent.idempotencyKey, intentHash, result);
    }

    if (policy.decision === POLICY_DECISION.AWAIT_APPROVAL) {
      const approval = approvals.request({
        idempotencyKey: intent.idempotencyKey,
        agentId: agent.id,
        actionType: intent.actionType,
        risk: policy.risk,
        reason: intent.reason || policy.reason,
        authority,
        payload: intent.payload || {},
      });

      const result = {
        status: 'AWAIT_APPROVAL',
        reason: policy.reason,
        approvalId: approval.id,
        effectExecuted: false,
        authority,
      };

      bus.publish({
        type: 'GOVERNANCE.APPROVAL_REQUIRED',
        source: agent.id,
        payload: {
          approvalId: approval.id,
          actionType: intent.actionType,
          risk: policy.risk,
          authority,
        },
      });
      return cacheResult(intent.idempotencyKey, intentHash, result);
    }

    const result = {
      status: 'AUTHORIZED',
      reason: policy.reason,
      effectExecuted: false,
      authority,
    };
    bus.publish({
      type: 'GOVERNANCE.ACTION_AUTHORIZED',
      source: agent.id,
      payload: {
        actionType: intent.actionType,
        idempotencyKey: intent.idempotencyKey,
        authority,
      },
    });
    return cacheResult(intent.idempotencyKey, intentHash, result);
  }

  function snapshot() {
    return {
      mode: 'EPHEMERAL_DEVELOPMENT',
      agents: [...agents.values()].map(cloneAgent),
      approvals: approvals.all(),
      events: bus.history(),
      metrics: {
        registeredAgents: agents.size,
        pendingApprovals: approvals.pending().length,
        eventCount: bus.history().length,
      },
    };
  }

  return Object.freeze({
    registerAgent,
    proposeIntent,
    snapshot,
    events: bus,
    approvals,
  });
}
