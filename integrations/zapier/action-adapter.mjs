const PROVIDER_ID = 'zapier';
const CAPABILITY = 'integration.saas';

function providerError(code, {
  message = code,
  retryable = false,
  outcomeUnknown = false,
  retryAfterSeconds,
  receiptRef,
} = {}) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  error.outcomeUnknown = outcomeUnknown;
  if (Number.isFinite(retryAfterSeconds)) error.retryAfterSeconds = retryAfterSeconds;
  if (receiptRef) error.receiptRef = receiptRef;
  return error;
}

function requiredText(input, key, prefix = 'ZAPIER_JOB_INVALID') {
  const value = input?.[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw providerError(prefix, { message: `${prefix}:${key}` });
  }
  return value.trim();
}

function clone(value) {
  return structuredClone(value);
}

function validateJob(job) {
  const id = requiredText(job, 'id');
  const intentId = requiredText(job, 'intentId');
  const actionType = requiredText(job, 'actionType');
  if (!job?.payload || typeof job.payload !== 'object' || Array.isArray(job.payload)) {
    throw providerError('ZAPIER_JOB_INVALID', { message: 'ZAPIER_JOB_INVALID:payload' });
  }
  const actionKey = requiredText(job.payload, 'actionKey');
  const input = job.payload.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw providerError('ZAPIER_JOB_INVALID', { message: 'ZAPIER_JOB_INVALID:input' });
  }

  return Object.freeze({
    id,
    intentId,
    actionType,
    actionKey,
    input: clone(input),
  });
}

function requiredConfigText(input, key) {
  const value = input?.[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw providerError('ZAPIER_CONFIG_INVALID', { message: `ZAPIER_CONFIG_INVALID:${key}` });
  }
  return value.trim();
}

function boundedInteger(value, key, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw providerError('ZAPIER_CONFIG_INVALID', { message: `ZAPIER_CONFIG_INVALID:${key}` });
  }
  return number;
}

function normalizeConfig(config) {
  return Object.freeze({
    hookSecretBindingRef: requiredConfigText(config, 'hookSecretBindingRef'),
    dispatchTimeoutMs: boundedInteger(config?.dispatchTimeoutMs ?? 15_000, 'dispatchTimeoutMs', 1_000, 120_000),
    receiptWaitMs: boundedInteger(config?.receiptWaitMs ?? 30_000, 'receiptWaitMs', 1_000, 300_000),
  });
}

function validateDependencies({ capabilityRegistry, credentialBroker, receiptPort, transport }) {
  if (!capabilityRegistry || typeof capabilityRegistry.resolve !== 'function') {
    throw providerError('ZAPIER_CAPABILITY_REGISTRY_REQUIRED');
  }
  if (!credentialBroker || typeof credentialBroker.withCredential !== 'function') {
    throw providerError('ZAPIER_CREDENTIAL_BROKER_REQUIRED');
  }
  if (!receiptPort
      || typeof receiptPort.issue !== 'function'
      || typeof receiptPort.waitForReceipt !== 'function') {
    throw providerError('ZAPIER_RECEIPT_PORT_REQUIRED');
  }
  if (!transport || typeof transport.postHook !== 'function') {
    throw providerError('ZAPIER_TRANSPORT_REQUIRED');
  }
}

function assertQualifiedProvider(capabilityRegistry) {
  const provider = capabilityRegistry.resolve(CAPABILITY, {
    allowedProviderIds: [PROVIDER_ID],
  });
  if (!provider || provider.providerId !== PROVIDER_ID) {
    throw providerError('ZAPIER_PROVIDER_NOT_QUALIFIED');
  }
  return provider;
}

function normalizeHookUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw providerError('ZAPIER_HOOK_CREDENTIAL_INVALID');
  }
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw providerError('ZAPIER_HOOK_CREDENTIAL_INVALID');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hostname !== 'hooks.zapier.com') {
    throw providerError('ZAPIER_HOOK_CREDENTIAL_INVALID');
  }
  return parsed.toString();
}

function normalizeCallbackDescriptor(value, job) {
  if (!value || typeof value !== 'object') {
    throw providerError('ZAPIER_RECEIPT_ISSUE_FAILED', { retryable: true });
  }
  const receiptRef = requiredText(value, 'receiptRef', 'ZAPIER_RECEIPT_ISSUE_FAILED');
  const callbackUrl = requiredText(value, 'callbackUrl', 'ZAPIER_RECEIPT_ISSUE_FAILED');
  let parsed;
  try {
    parsed = new URL(callbackUrl);
  } catch {
    throw providerError('ZAPIER_RECEIPT_ISSUE_FAILED', { retryable: true });
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw providerError('ZAPIER_RECEIPT_ISSUE_FAILED', { retryable: true });
  }
  return Object.freeze({
    receiptRef,
    callbackUrl: parsed.toString(),
    executionJobId: job.id,
  });
}

function credentialRequest(config, job) {
  return {
    bindingRef: config.hookSecretBindingRef,
    providerId: PROVIDER_ID,
    capability: CAPABILITY,
    executionJobId: job.id,
    intentId: job.intentId,
  };
}

function dispatchPayload(job, callback) {
  return Object.freeze({
    schemaVersion: 'vaos.zapier.action.v1',
    executionJobId: job.id,
    intentId: job.intentId,
    idempotencyKey: job.id,
    actionType: job.actionType,
    actionKey: job.actionKey,
    input: clone(job.input),
    callbackUrl: callback.callbackUrl,
  });
}

function retryAfter(headers) {
  if (!headers || typeof headers !== 'object') return undefined;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === 'retry-after');
  const number = entry ? Number(entry[1]) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function classifyDispatchException(error, requestStarted) {
  if (!requestStarted) return error;
  if (error?.requestSent === false) {
    return providerError('ZAPIER_DISPATCH_UNAVAILABLE', {
      retryable: true,
      outcomeUnknown: false,
    });
  }
  return providerError('ZAPIER_OUTCOME_UNKNOWN', {
    retryable: false,
    outcomeUnknown: true,
  });
}

function assertDispatchAccepted(response) {
  const status = Number(response?.status);
  if (!Number.isInteger(status)) {
    throw providerError('ZAPIER_OUTCOME_UNKNOWN', {
      retryable: false,
      outcomeUnknown: true,
    });
  }
  if ([404, 410].includes(status)) {
    throw providerError('ZAPIER_HOOK_UNAVAILABLE');
  }
  if (status === 429) {
    throw providerError('ZAPIER_RATE_LIMITED', {
      retryable: true,
      outcomeUnknown: false,
      retryAfterSeconds: retryAfter(response?.headers),
    });
  }
  if (status >= 500) {
    throw providerError('ZAPIER_OUTCOME_UNKNOWN', {
      retryable: false,
      outcomeUnknown: true,
    });
  }
  if (status < 200 || status >= 300) {
    throw providerError('ZAPIER_DISPATCH_REJECTED');
  }
}

function validateReceipt(receipt, callback, job) {
  if (!receipt || typeof receipt !== 'object') {
    throw providerError('ZAPIER_VERIFICATION_FAILED', { receiptRef: callback.receiptRef });
  }
  const matches = receipt.receiptRef === callback.receiptRef
    && receipt.providerId === PROVIDER_ID
    && receipt.executionJobId === job.id
    && receipt.intentId === job.intentId
    && receipt.actionKey === job.actionKey;

  if (!matches) {
    throw providerError('ZAPIER_VERIFICATION_FAILED', { receiptRef: callback.receiptRef });
  }

  if (receipt.status === 'failed') {
    throw providerError('ZAPIER_WORKFLOW_FAILED', {
      retryable: false,
      outcomeUnknown: false,
      receiptRef: callback.receiptRef,
    });
  }
  if (receipt.status !== 'succeeded') {
    throw providerError('ZAPIER_VERIFICATION_FAILED', { receiptRef: callback.receiptRef });
  }

  const evidence = receipt.evidence && typeof receipt.evidence === 'object' && !Array.isArray(receipt.evidence)
    ? clone(receipt.evidence)
    : {};
  return Object.freeze({ evidence });
}

export function createZapierActionAdapter({
  capabilityRegistry,
  credentialBroker,
  receiptPort,
  transport,
  config,
} = {}) {
  validateDependencies({ capabilityRegistry, credentialBroker, receiptPort, transport });
  const normalizedConfig = normalizeConfig(config);

  async function execute(inputJob) {
    const job = validateJob(inputJob);
    assertQualifiedProvider(capabilityRegistry);

    let callback;
    try {
      callback = normalizeCallbackDescriptor(await receiptPort.issue({
        providerId: PROVIDER_ID,
        capability: CAPABILITY,
        executionJobId: job.id,
        intentId: job.intentId,
        actionKey: job.actionKey,
      }), job);
    } catch (error) {
      if (error?.code === 'ZAPIER_RECEIPT_ISSUE_FAILED') throw error;
      throw providerError('ZAPIER_RECEIPT_ISSUE_FAILED', {
        retryable: true,
        outcomeUnknown: false,
      });
    }

    let requestStarted = false;
    let response;
    try {
      response = await credentialBroker.withCredential(
        credentialRequest(normalizedConfig, job),
        async (credential) => {
          if (credential?.kind !== 'url') throw providerError('ZAPIER_HOOK_CREDENTIAL_INVALID');
          const hookUrl = normalizeHookUrl(credential.value);
          requestStarted = true;
          return transport.postHook({
            url: hookUrl,
            method: 'POST',
            timeoutMs: normalizedConfig.dispatchTimeoutMs,
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'X-VAOS-IDEMPOTENCY-KEY': job.id,
              'X-VAOS-INTENT-ID': job.intentId,
            },
            body: dispatchPayload(job, callback),
          });
        },
      );
    } catch (error) {
      throw classifyDispatchException(error, requestStarted);
    }

    assertDispatchAccepted(response);

    let receipt;
    try {
      receipt = await receiptPort.waitForReceipt({
        receiptRef: callback.receiptRef,
        providerId: PROVIDER_ID,
        executionJobId: job.id,
        intentId: job.intentId,
        actionKey: job.actionKey,
        timeoutMs: normalizedConfig.receiptWaitMs,
      });
    } catch {
      throw providerError('ZAPIER_RECEIPT_PENDING', {
        retryable: false,
        outcomeUnknown: true,
        receiptRef: callback.receiptRef,
      });
    }

    const verified = validateReceipt(receipt, callback, job);

    return Object.freeze({
      adapterId: 'zapier.action.v1',
      providerId: PROVIDER_ID,
      capability: CAPABILITY,
      effect: Object.freeze({
        effectType: 'INTEGRATION.ZAPIER_ACTION_COMPLETED',
        resourceType: 'ZAPIER_RECEIPT',
        resourceId: callback.receiptRef,
        state: 'SUCCEEDED',
        actionKey: job.actionKey,
        evidence: clone(verified.evidence),
        idempotencyKey: job.id,
      }),
      verification: Object.freeze({
        verified: true,
        resourceType: 'ZAPIER_RECEIPT',
        resourceId: callback.receiptRef,
        expectedState: 'succeeded',
        providerId: PROVIDER_ID,
        actionKey: job.actionKey,
        evidenceSource: 'vaos.callback.receipt',
        executionJobId: job.id,
        intentId: job.intentId,
      }),
    });
  }

  return Object.freeze({
    id: 'zapier.action.v1',
    providerId: PROVIDER_ID,
    capability: CAPABILITY,
    execute,
  });
}
