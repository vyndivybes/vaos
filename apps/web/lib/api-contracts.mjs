const RISK = new Set(['low', 'medium', 'high', 'critical']);
const ACTION = /^[A-Z][A-Z0-9_]*(\.[A-Z][A-Z0-9_]*)+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRACE_DOMAINS = new Set(['QA_CAPA', 'ENGINEERING_BASELINE', 'PROJECT_RISK']);
const TRACE_RELATIONS = new Set(['DRIVES_CHANGE', 'MITIGATES_RISK', 'TRIGGERS_CAPA', 'RELATED_TO']);

function validateDigitalThreadLinkPayload(payload, errors) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    errors.push('INVALID_DIGITAL_THREAD_PAYLOAD');
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
