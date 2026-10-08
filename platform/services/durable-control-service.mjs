import { createAgentDefinition } from '../../packages/contracts/agent.mjs';
import { AGENT_DEFINITIONS } from '../runtime/development-runtime.mjs';
import { stableHash } from '../runtime/idempotency.mjs';
import { evaluateActionPolicy, evaluateWriteQualificationPolicy, POLICY_DECISION } from '../runtime/policy-engine.mjs';

const WORKFORCE_LIFECYCLE_ACTIONS = new Set([
  'WORKFORCE.START_TRAINING',
  'WORKFORCE.QUALIFY',
  'WORKFORCE.ACTIVATE',
  'WORKFORCE.RESTRICT',
  'WORKFORCE.START_RETRAINING',
  'WORKFORCE.RETIRE',
]);

function eventTypeFor(status) {
  if (status === 'AWAIT_APPROVAL') return 'GOVERNANCE.APPROVAL_REQUIRED';
  if (status === 'AUTHORIZED') return 'GOVERNANCE.ACTION_AUTHORIZED';
  if (status === 'PREPARED') return 'AGENT.ACTION_PREPARED';
  return 'GOVERNANCE.ACTION_DENIED';
}

function resultFromPolicy(policy, authority) {
  if (policy.decision === POLICY_DECISION.AWAIT_APPROVAL) {
    return { status: 'AWAIT_APPROVAL', reason: policy.reason, effectExecuted: false, authority };
  }
  if (policy.decision === POLICY_DECISION.ALLOW) {
    return { status: 'AUTHORIZED', reason: policy.reason, effectExecuted: false, authority };
  }
  if (policy.decision === POLICY_DECISION.PREPARE_ONLY) {
    return { status: 'PREPARED', reason: policy.reason, effectExecuted: false, authority };
  }
  return { status: 'DENIED', reason: policy.reason, effectExecuted: false, authority };
}

function qualificationModeRequested(intent) {
  return intent?.payload?.qualificationMode === true;
}

function declaredQualificationAction(contract, actionType) {
  if (!contract) return { allowed: false, reason: 'RESPONSIBILITY_CONTRACT_NOT_FOUND' };
  if ((contract.prohibitedActions || []).includes(actionType)) {
    return { allowed: false, reason: 'RESPONSIBILITY_ACTION_PROHIBITED' };
  }
  const declared = [
    ...(contract.approvalRequiredActions || []),
    ...(contract.autonomousActions || []),
  ];
  return declared.includes(actionType)
    ? { allowed: true, reason: null }
    : { allowed: false, reason: 'RESPONSIBILITY_ACTION_UNDECLARED' };
}

export function createDurableControlService({
  store,
  agentDefinitions = AGENT_DEFINITIONS,
} = {}) {
  if (!store) throw new Error('DURABLE_STORE_REQUIRED');

  const agents = agentDefinitions.map((definition) => createAgentDefinition(definition));
  const byId = new Map(agents.map((agent) => [agent.id, agent]));

  async function proposeIntent(intent) {
    if (!intent?.idempotencyKey) throw new Error('IDEMPOTENCY_KEY_REQUIRED');

    const agent = byId.get(intent.agentId);
    let authority = null;
    let result;

    if (!agent) {
      result = { status: 'DENIED', reason: 'AGENT_NOT_FOUND', effectExecuted: false, authority: null };
    } else if (agent.capabilities[intent.actionType] === undefined) {
      result = { status: 'DENIED', reason: 'CAPABILITY_NOT_GRANTED', effectExecuted: false, authority: null };
    } else {
      authority = agent.capabilities[intent.actionType];

      if (!WORKFORCE_LIFECYCLE_ACTIONS.has(intent.actionType)) {
        const employee = await store.getDigitalEmployee(agent.id);
        if (!employee) {
          result = { status: 'DENIED', reason: 'DIGITAL_EMPLOYEE_NOT_REGISTERED', effectExecuted: false, authority };
        } else {
          const activeAndQualified =
            employee.status === 'ACTIVE' && Number(employee.qualificationLevel || 0) >= 1;
          const qualificationState =
            employee.status === 'TRAINING' || employee.status === 'RETRAINING';

          if (!activeAndQualified) {
            if (qualificationState && qualificationModeRequested(intent)) {
              if (!employee.responsibilityContractId) {
                result = { status: 'DENIED', reason: 'RESPONSIBILITY_CONTRACT_REQUIRED', effectExecuted: false, authority };
              } else {
                const workforceSnapshot = await store.snapshot();
                const contracts =
                  workforceSnapshot?.responsibilityContracts
                  || workforceSnapshot?.workforce?.responsibilityContracts
                  || [];
                const contract = contracts.find((item) => item.id === employee.responsibilityContractId);
                const declaration = declaredQualificationAction(contract, intent.actionType);

                if (!declaration.allowed) {
                  result = { status: 'DENIED', reason: declaration.reason, effectExecuted: false, authority };
                } else {
                  const policy = evaluateActionPolicy({
                    actionType: intent.actionType,
                    authority,
                    risk: intent.risk,
                  });
                  if (
                    policy.decision === POLICY_DECISION.DENY
                    || policy.decision === POLICY_DECISION.PREPARE_ONLY
                  ) {
                    result = resultFromPolicy(policy, authority);
                  } else {
                    result = {
                      status: 'AWAIT_APPROVAL',
                      reason: 'QUALIFICATION_EVIDENCE_APPROVAL_REQUIRED',
                      effectExecuted: false,
                      authority,
                    };
                  }
                }
              }
            } else {
              result = { status: 'DENIED', reason: 'DIGITAL_EMPLOYEE_NOT_ACTIVE', effectExecuted: false, authority };
            }
          }
        }
      }

      if (!result) {
        const policy = intent?.payload?.writeQualification === true
          ? evaluateWriteQualificationPolicy({
              actionType: intent.actionType,
              authority,
              risk: intent.risk,
              payload: intent.payload,
            })
          : evaluateActionPolicy({
              actionType: intent.actionType,
              authority,
              risk: intent.risk,
            });
        result = resultFromPolicy(policy, authority);
      }
    }

    const requestHash = stableHash({
      agentId: intent.agentId,
      actionType: intent.actionType,
      risk: intent.risk,
      reason: intent.reason,
      payload: intent.payload || {},
    });

    const persisted = await store.submitIntent({
      ...intent,
      requestHash,
      authority,
      result,
      eventType: eventTypeFor(result.status),
    });

    if (persisted?.outcome === 'CONFLICT') throw new Error('IDEMPOTENCY_CONFLICT');

    return {
      ...result,
      status: persisted?.intent?.status || result.status,
      approvalId: persisted?.approvalId || null,
      durableOutcome: persisted?.outcome || 'UNKNOWN',
    };
  }

  async function snapshot() {
    const durable = await store.snapshot();
    return {
      ...durable,
      agents: agents.map((agent) => ({ ...agent, capabilities: { ...agent.capabilities } })),
    };
  }

  return Object.freeze({
    proposeIntent,
    snapshot,
    decideApproval(approvalId, input) {
      return store.decideApproval(approvalId, input);
    },
  });
}
