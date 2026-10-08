import { AUTHORITY } from '../../packages/contracts/agent.mjs';

export const POLICY_DECISION = Object.freeze({
  DENY: 'DENY',
  PREPARE_ONLY: 'PREPARE_ONLY',
  AWAIT_APPROVAL: 'AWAIT_APPROVAL',
  ALLOW: 'ALLOW',
});

export const ACTION_POLICIES = Object.freeze({
  'QA.OPEN_CAPA': Object.freeze({
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'medium',
  }),
  'ENGINEERING.BASELINE_CHANGE': Object.freeze({
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'high',
  }),
  'PROJECT.ESCALATE_RISK': Object.freeze({
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: false,
    defaultRisk: 'medium',
  }),
  'SECURITY.OBSERVE_IDENTITY': Object.freeze({
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'high',
  }),
  'RELEASE.OBSERVE_GATE': Object.freeze({
    minimumAuthority: AUTHORITY.RECOMMEND,
    requiresApproval: false,
    defaultRisk: 'low',
  }),
  'DIGITAL_THREAD.CREATE_LINK': Object.freeze({
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'medium',
  }),
  'WORKFORCE.START_TRAINING': Object.freeze({
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'medium',
  }),
  'WORKFORCE.ASSESS_QUALIFICATION': Object.freeze({
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'high',
  }),
  'WORKFORCE.QUALIFY': Object.freeze({
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'high',
  }),
  'WORKFORCE.ACTIVATE': Object.freeze({
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'high',
  }),
  'WORKFORCE.RESTRICT': Object.freeze({
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'high',
  }),
  'WORKFORCE.START_RETRAINING': Object.freeze({
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'medium',
  }),
  'WORKFORCE.RETIRE': Object.freeze({
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'high',
  }),
  'EVIDENCE.DELETE': Object.freeze({
    prohibited: true,
    minimumAuthority: AUTHORITY.AUTONOMOUS_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'high',
  }),
});

const VALID_RISKS = new Set(['low', 'medium', 'high', 'critical']);

export function evaluateActionPolicy({ actionType, authority, risk } = {}) {
  const policy = ACTION_POLICIES[actionType];

  if (!policy) {
    return { decision: POLICY_DECISION.DENY, reason: 'UNKNOWN_ACTION', policy: null };
  }
  if (policy.prohibited) {
    return { decision: POLICY_DECISION.DENY, reason: 'ACTION_PROHIBITED', policy };
  }
  if (!Number.isInteger(authority) || authority < AUTHORITY.OBSERVE || authority > AUTHORITY.AUTONOMOUS_EXECUTION) {
    return { decision: POLICY_DECISION.DENY, reason: 'INVALID_AUTHORITY', policy };
  }
  if (authority < policy.minimumAuthority) {
    return { decision: POLICY_DECISION.DENY, reason: 'INSUFFICIENT_AUTHORITY', policy };
  }

  const normalizedRisk = VALID_RISKS.has(String(risk || '').toLowerCase())
    ? String(risk).toLowerCase()
    : policy.defaultRisk;

  if (authority <= AUTHORITY.PREPARE) {
    return { decision: POLICY_DECISION.PREPARE_ONLY, reason: 'PREPARE_ONLY', policy, risk: normalizedRisk };
  }

  if (
    policy.requiresApproval ||
    normalizedRisk === 'high' ||
    normalizedRisk === 'critical' ||
    authority === AUTHORITY.APPROVED_EXECUTION
  ) {
    return { decision: POLICY_DECISION.AWAIT_APPROVAL, reason: 'HUMAN_APPROVAL_REQUIRED', policy, risk: normalizedRisk };
  }

  return { decision: POLICY_DECISION.ALLOW, reason: 'POLICY_AUTHORIZED', policy, risk: normalizedRisk };
}
