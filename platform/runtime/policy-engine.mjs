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
  'COMMERCIAL.OBSERVE_PIPELINE': Object.freeze({
    commissioningMode: 'live_read',
    minimumAuthority: AUTHORITY.RECOMMEND,
    requiresApproval: false,
    defaultRisk: 'low',
  }),
  'COMMERCIAL.COMMIT_ORDER': Object.freeze({
    commissioningMode: 'prepare_only',
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'high',
  }),
  'COMMERCIAL.CHANGE_COMMITMENT': Object.freeze({
    commissioningMode: 'prepare_only',
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'high',
  }),
  'PROCUREMENT.OBSERVE_SHORTAGE': Object.freeze({
    commissioningMode: 'live_read',
    minimumAuthority: AUTHORITY.RECOMMEND,
    requiresApproval: false,
    defaultRisk: 'low',
  }),
  'PROCUREMENT.CREATE_PO': Object.freeze({
    commissioningMode: 'prepare_only',
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'high',
  }),
  'PROCUREMENT.CHANGE_PO': Object.freeze({
    commissioningMode: 'prepare_only',
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'high',
  }),
  'INVENTORY.OBSERVE_STOCK': Object.freeze({
    commissioningMode: 'live_read',
    minimumAuthority: AUTHORITY.RECOMMEND,
    requiresApproval: false,
    defaultRisk: 'low',
  }),
  'INVENTORY.RESERVE_MATERIAL': Object.freeze({
    commissioningMode: 'prepare_only',
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'medium',
  }),
  'INVENTORY.ISSUE_MATERIAL': Object.freeze({
    commissioningMode: 'prepare_only',
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'high',
  }),
  'PRODUCTION.OBSERVE_WIP': Object.freeze({
    commissioningMode: 'live_read',
    minimumAuthority: AUTHORITY.RECOMMEND,
    requiresApproval: false,
    defaultRisk: 'low',
  }),
  'PRODUCTION.RELEASE_JOB': Object.freeze({
    commissioningMode: 'prepare_only',
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'high',
  }),
  'PRODUCTION.ADVANCE_STAGE': Object.freeze({
    commissioningMode: 'prepare_only',
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'medium',
  }),
  'MAINTENANCE.OBSERVE_ASSET': Object.freeze({
    commissioningMode: 'live_read',
    minimumAuthority: AUTHORITY.RECOMMEND,
    requiresApproval: false,
    defaultRisk: 'low',
  }),
  'MAINTENANCE.OPEN_WORK_ORDER': Object.freeze({
    commissioningMode: 'prepare_only',
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'medium',
  }),
  'MAINTENANCE.RETURN_TO_SERVICE': Object.freeze({
    commissioningMode: 'prepare_only',
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'high',
  }),
  'FINANCE.OBSERVE_LEDGER': Object.freeze({
    commissioningMode: 'live_read',
    minimumAuthority: AUTHORITY.RECOMMEND,
    requiresApproval: false,
    defaultRisk: 'low',
  }),
  'FINANCE.PREPARE_PAYMENT': Object.freeze({
    commissioningMode: 'prepare_only',
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'high',
  }),
  'PEOPLE.OBSERVE_WORKFORCE': Object.freeze({
    commissioningMode: 'live_read',
    minimumAuthority: AUTHORITY.RECOMMEND,
    requiresApproval: false,
    defaultRisk: 'low',
  }),
  'PEOPLE.PREPARE_PAYROLL': Object.freeze({
    commissioningMode: 'prepare_only',
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'high',
  }),
  'PEOPLE.CHANGE_EMPLOYEE_MASTER': Object.freeze({
    commissioningMode: 'prepare_only',
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'high',
  }),
  'ENGINEERING.OBSERVE_CONFIGURATION': Object.freeze({
    commissioningMode: 'live_read',
    minimumAuthority: AUTHORITY.RECOMMEND,
    requiresApproval: false,
    defaultRisk: 'low',
  }),
  'ENGINEERING.CONFIGURATION_CHANGE': Object.freeze({
    commissioningMode: 'prepare_only',
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'high',
  }),
  'ENGINEERING.RELEASE_CONFIGURATION': Object.freeze({
    commissioningMode: 'prepare_only',
    minimumAuthority: AUTHORITY.APPROVED_EXECUTION,
    requiresApproval: true,
    defaultRisk: 'critical',
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

export const VYNDI_WRITE_QUALIFICATION_PROFILE = 'COMMERCIAL_WRITE_CANARY_V1';

export function evaluateWriteQualificationPolicy({ actionType, authority, risk, payload } = {}) {
  const policy = ACTION_POLICIES[actionType];
  const normalizedRisk = VALID_RISKS.has(String(risk || '').toLowerCase())
    ? String(risk).toLowerCase()
    : policy?.defaultRisk || 'high';

  if (
    actionType !== 'COMMERCIAL.COMMIT_ORDER'
    || payload?.writeQualification !== true
    || payload?.qualificationProfile !== VYNDI_WRITE_QUALIFICATION_PROFILE
  ) {
    return { decision: POLICY_DECISION.DENY, reason: 'WRITE_QUALIFICATION_SCOPE_DENIED', policy: policy || null, risk: normalizedRisk };
  }
  if (!policy || policy.commissioningMode !== 'prepare_only') {
    return { decision: POLICY_DECISION.DENY, reason: 'WRITE_QUALIFICATION_POLICY_INVALID', policy: policy || null, risk: normalizedRisk };
  }
  if (!Number.isInteger(authority) || authority < AUTHORITY.APPROVED_EXECUTION) {
    return { decision: POLICY_DECISION.DENY, reason: 'INSUFFICIENT_AUTHORITY', policy, risk: normalizedRisk };
  }
  return {
    decision: POLICY_DECISION.AWAIT_APPROVAL,
    reason: 'WRITE_QUALIFICATION_APPROVAL_REQUIRED',
    policy,
    risk: normalizedRisk,
  };
}

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

  if (policy.commissioningMode === 'prepare_only') {
    return { decision: POLICY_DECISION.PREPARE_ONLY, reason: 'WORKFORCE_BRIDGE_PREPARE_ONLY', policy, risk: normalizedRisk };
  }

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
