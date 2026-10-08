function terminalError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  error.retryable = false;
  return error;
}

function requiredText(input, key) {
  const value = input?.[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw terminalError('CREDENTIAL_REQUEST_INVALID', `CREDENTIAL_REQUEST_INVALID:${key}`);
  }
  return value.trim();
}

function normalizeRequest(input) {
  return Object.freeze({
    bindingRef: requiredText(input, 'bindingRef'),
    providerId: requiredText(input, 'providerId'),
    capability: requiredText(input, 'capability'),
    executionJobId: requiredText(input, 'executionJobId'),
    intentId: requiredText(input, 'intentId'),
  });
}

function validateCredential(credential, request, now) {
  if (!credential || typeof credential !== 'object') throw terminalError('CREDENTIAL_RESOLUTION_INVALID');
  if (typeof credential.kind !== 'string' || !credential.kind.trim()) throw terminalError('CREDENTIAL_RESOLUTION_INVALID');
  if (typeof credential.value !== 'string' || !credential.value) throw terminalError('CREDENTIAL_RESOLUTION_INVALID');
  if (credential.providerId !== request.providerId) throw terminalError('CREDENTIAL_SCOPE_MISMATCH');
  if (!Array.isArray(credential.capabilities) || !credential.capabilities.includes(request.capability)) {
    throw terminalError('CREDENTIAL_SCOPE_MISMATCH');
  }
  if (credential.expiresAt !== undefined && credential.expiresAt !== null) {
    const expiresAt = new Date(credential.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) throw terminalError('CREDENTIAL_RESOLUTION_INVALID');
    if (expiresAt.getTime() <= now().getTime()) throw terminalError('CREDENTIAL_EXPIRED');
  }
  return Object.freeze({ kind: credential.kind.trim(), value: credential.value });
}

function auditEnvelope(eventType, request, outcome) {
  return Object.freeze({
    eventType,
    bindingRef: request.bindingRef,
    providerId: request.providerId,
    capability: request.capability,
    executionJobId: request.executionJobId,
    intentId: request.intentId,
    ...(outcome ? { outcome } : {}),
  });
}

export function createCredentialBroker({ resolveCredential, recordAudit = async () => {}, now = () => new Date() } = {}) {
  if (typeof resolveCredential !== 'function') throw terminalError('CREDENTIAL_RESOLVER_REQUIRED');
  if (typeof recordAudit !== 'function') throw terminalError('CREDENTIAL_AUDIT_PORT_INVALID');
  if (typeof now !== 'function') throw terminalError('CREDENTIAL_CLOCK_INVALID');

  async function withCredential(input, operation) {
    const request = normalizeRequest(input);
    if (typeof operation !== 'function') throw terminalError('CREDENTIAL_OPERATION_REQUIRED');

    const resolved = await resolveCredential(request);
    const credential = validateCredential(resolved, request, now);
    await recordAudit(auditEnvelope('CREDENTIAL.ACQUIRED', request));

    let outcome = 'failed';
    try {
      const result = await operation(credential);
      outcome = 'succeeded';
      return result;
    } finally {
      await recordAudit(auditEnvelope('CREDENTIAL.RELEASED', request, outcome));
    }
  }

  return Object.freeze({ withCredential });
}
