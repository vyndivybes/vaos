const RISK = new Set(['low', 'medium', 'high', 'critical']);
const ACTION = /^[A-Z][A-Z0-9_]*(\.[A-Z][A-Z0-9_]*)+$/;

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
