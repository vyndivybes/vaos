const RISK = new Set(['low', 'medium', 'high', 'critical']);
const ACTION = /^[A-Z][A-Z0-9_]*(\.[A-Z][A-Z0-9_]*)+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRACE_DOMAINS = new Set(['QA_CAPA', 'ENGINEERING_BASELINE', 'PROJECT_RISK']);
const TRACE_RELATIONS = new Set(['DRIVES_CHANGE', 'MITIGATES_RISK', 'TRIGGERS_CAPA', 'RELATED_TO']);
const WORKFORCE_ACTIONS = new Set([
  'WORKFORCE.START_TRAINING',
  'WORKFORCE.ASSESS_QUALIFICATION',
  'WORKFORCE.QUALIFY',
  'WORKFORCE.ACTIVATE',
  'WORKFORCE.RESTRICT',
  'WORKFORCE.START_RETRAINING',
  'WORKFORCE.RETIRE',
]);
const EMPLOYEE_ID = /^[a-z0-9][a-z0-9-]{1,63}$/;

function validBusinessResourceId(value) {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 128
    && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function validateDigitalThreadLinkPayload(payload, errors) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    errors.push('INVALID_DIGITAL_THREAD_PAYLOAD');
    return;
  }

  if (payload.qualificationKnowledgeLink === true) {
    if (!validBusinessResourceId(payload.sourceRiskId)) {
      errors.push('INVALID_KNOWLEDGE_LINK_SOURCE');
    }
    if (!validBusinessResourceId(payload.targetBaseline)) {
      errors.push('INVALID_KNOWLEDGE_LINK_TARGET');
    }
    if (!TRACE_RELATIONS.has(payload.relationType)) {
      errors.push('INVALID_DIGITAL_THREAD_RELATION');
    }
    return;
  }

  if (!TRACE_DOMAINS.has(payload.sourceDomain) || !TRACE_DOMAINS.has(payload.targetDomain)) {
    errors.push('INVALID_DIGITAL_THREAD_DOMAIN');
  }
  if (!UUID.test(String(payload.sourceRecordId || '')) || !UUID.test(String(payload.targetRecordId || ''))) {
    errors.push('INVALID_DIGITAL_THREAD_RECORD_ID');
  }
  if (!TRACE_RELATIONS.has(payload.relationType)) {
    errors.push('INVALID_DIGITAL_THREAD_RELATION');
  }
  if (
    payload.sourceDomain === payload.targetDomain
    && payload.sourceRecordId === payload.targetRecordId
  ) {
    errors.push('DIGITAL_THREAD_SELF_LINK_DENIED');
  }
}

function validateWorkforcePayload(actionType, payload, errors) {
  if (!WORKFORCE_ACTIONS.has(actionType)) {
    errors.push('INVALID_WORKFORCE_ACTION');
    return;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    errors.push('INVALID_WORKFORCE_PAYLOAD');
    return;
  }
  if (!EMPLOYEE_ID.test(String(payload.employeeId || ''))) errors.push('INVALID_DIGITAL_EMPLOYEE_ID');

  if (actionType === 'WORKFORCE.ASSESS_QUALIFICATION') {
    if (!Number.isInteger(payload.targetLevel) || payload.targetLevel < 1 || payload.targetLevel > 4) {
      errors.push('INVALID_QUALIFICATION_LEVEL');
    }
    if (typeof payload.profileId !== 'string' || !/^[A-Z0-9_]{8,128}$/.test(payload.profileId)) {
      errors.push('INVALID_QUALIFICATION_PROFILE');
    }
  }

  if (actionType === 'WORKFORCE.QUALIFY') {
    if (!Number.isInteger(payload.qualificationLevel) || payload.qualificationLevel < 1 || payload.qualificationLevel > 4) {
      errors.push('INVALID_QUALIFICATION_LEVEL');
    }
    if (!Array.isArray(payload.evidenceRefs)
        || payload.evidenceRefs.length < 1
        || payload.evidenceRefs.length > 20
        || payload.evidenceRefs.some((ref) => typeof ref !== 'string' || !ref.trim() || ref.length > 500)) {
      errors.push('QUALIFICATION_EVIDENCE_REQUIRED');
    }
  }
}

export function validateIntentRequest({ idempotencyKey, body } = {}) {
  const errors = [];
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 4 || idempotencyKey.length > 160) errors.push('INVALID_IDEMPOTENCY_KEY');
  if (!body || typeof body !== 'object' || Array.isArray(body)) errors.push('INVALID_BODY');
  else {
    if (typeof body.agentId !== 'string' || !body.agentId.trim()) errors.push('INVALID_AGENT_ID');
    if (typeof body.actionType !== 'string' || !ACTION.test(body.actionType)) errors.push('INVALID_ACTION_TYPE');
    if (!RISK.has(String(body.risk || '').toLowerCase())) errors.push('INVALID_RISK');
    if (typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 1000) errors.push('INVALID_REASON');
    if (body.payload !== undefined && (body.payload === null || typeof body.payload !== 'object' || Array.isArray(body.payload))) errors.push('INVALID_PAYLOAD');
    if (body.actionType === 'DIGITAL_THREAD.CREATE_LINK') validateDigitalThreadLinkPayload(body.payload, errors);
    if (String(body.actionType || '').startsWith('WORKFORCE.')) validateWorkforcePayload(body.actionType, body.payload, errors);
  }
  return { ok: errors.length === 0, errors };
}

export function validateApprovalDecision(input = {}) {
  const decision = String(input.decision || '').toUpperCase();
  const errors = [];
  if (typeof input.approvalId !== 'string' || !input.approvalId.trim()) errors.push('INVALID_APPROVAL_ID');
  if (!['APPROVED', 'REJECTED'].includes(decision)) errors.push('INVALID_DECISION');
  return { ok: errors.length === 0, errors, decision };
}

export function apiError(code, message, details) {
  return { error: { code, message, ...(details ? { details } : {}) } };
}
