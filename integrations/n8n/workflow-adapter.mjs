const PROVIDER_ID = 'n8n';
const CAPABILITY = 'workflow.orchestrate';
const SUCCESS_STATES = new Set(['success', 'succeeded']);
const HEADER_NAME = /^[A-Za-z0-9-]+$/;

function providerError(code, {
  message = code,
  retryable = false,
  outcomeUnknown = false,
} = {}) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  error.outcomeUnknown = outcomeUnknown;
  return error;
}

function requiredText(input, key) {
  const value = input?.[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw providerError('N8N_JOB_INVALID', { message: `N8N_JOB_INVALID:${key}` });
  }
  return value.trim();
}

function validateJob(job) {
  const id = requiredText(job, 'id');
  const intentId = requiredText(job, 'intentId');
  const actionType = requiredText(job, 'actionType');
  if (!job?.payload || typeof job.payload !== 'object' || Array.isArray(job.payload)) {
    throw providerError('N8N_JOB_INVALID', { message: 'N8N_JOB_INVALID:payload' });
  }
  return Object.freeze({
    id,
    intentId,
    actionType,
    payload: structuredClone(job.payload),
  });
}

function absoluteHttpUrl(value, key) {
  if (typeof value !== 'string' || !value.trim()) {
    throw providerError('N8N_CONFIG_INVALID', { message: `N8N_CONFIG_INVALID:${key}` });
  }
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw providerError('N8N_CONFIG_INVALID', { message: `N8N_CONFIG_INVALID:${key}` });
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw providerError('N8N_CONFIG_INVALID', { message: `N8N_CONFIG_INVALID:${key}` });
  }
  return parsed.toString().replace(/\/$/, '');
}

function normalizeConfig(config) {
  const webhookUrl = absoluteHttpUrl(config?.webhookUrl, 'webhookUrl');
  const apiBaseUrl = absoluteHttpUrl(config?.apiBaseUrl, 'apiBaseUrl');
  const webhookSecretBindingRef = requiredConfigText(config, 'webhookSecretBindingRef');
  const apiSecretBindingRef = requiredConfigText(config, 'apiSecretBindingRef');
  const webhookAuthHeader = requiredConfigText(config, 'webhookAuthHeader');
  if (!HEADER_NAME.test(webhookAuthHeader)) {
    throw providerError('N8N_CONFIG_INVALID', { message: 'N8N_CONFIG_INVALID:webhookAuthHeader' });
  }
  const timeoutMs = Number(config?.timeoutMs ?? 10_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw providerError('N8N_CONFIG_INVALID', { message: 'N8N_CONFIG_INVALID:timeoutMs' });
  }
  return Object.freeze({
    webhookUrl,
    apiBaseUrl,
    webhookSecretBindingRef,
    apiSecretBindingRef,
    webhookAuthHeader,
    timeoutMs,
  });
}

function requiredConfigText(input, key) {
  const value = input?.[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw providerError('N8N_CONFIG_INVALID', { message: `N8N_CONFIG_INVALID:${key}` });
  }
  return value.trim();
}

function validateDependencies({ capabilityRegistry, credentialBroker, transport }) {
  if (!capabilityRegistry || typeof capabilityRegistry.resolve !== 'function') {
    throw providerError('N8N_CAPABILITY_REGISTRY_REQUIRED');
  }
  if (!credentialBroker || typeof credentialBroker.withCredential !== 'function') {
    throw providerError('N8N_CREDENTIAL_BROKER_REQUIRED');
  }
  if (!transport
      || typeof transport.invokeWebhook !== 'function'
      || typeof transport.readExecution !== 'function') {
    throw providerError('N8N_TRANSPORT_REQUIRED');
  }
}

function assertQualifiedProvider(capabilityRegistry) {
  const provider = capabilityRegistry.resolve(CAPABILITY, {
    allowedProviderIds: [PROVIDER_ID],
  });
  if (!provider || provider.providerId !== PROVIDER_ID) {
    throw providerError('N8N_PROVIDER_NOT_QUALIFIED');
  }
  return provider;
}

function credentialRequest(config, job, bindingRef) {
  return {
    bindingRef,
    providerId: PROVIDER_ID,
    capability: CAPABILITY,
    executionJobId: job.id,
    intentId: job.intentId,
  };
}

function dispatchPayload(job) {
  return Object.freeze({
    schemaVersion: 'vaos.n8n.workflow.v1',
    executionJobId: job.id,
    intentId: job.intentId,
    idempotencyKey: job.id,
    actionType: job.actionType,
    input: structuredClone(job.payload),
  });
}

function classifyDispatchException(error, transportStarted) {
  if (!transportStarted) return error;
  if (error?.requestSent === false) {
    return providerError('N8N_DISPATCH_UNAVAILABLE', {
      retryable: true,
      outcomeUnknown: false,
    });
  }
  return providerError('N8N_OUTCOME_UNKNOWN', {
    retryable: false,
    outcomeUnknown: true,
  });
}

function assertDispatchResponse(response) {
  const status = Number(response?.status);
  if (!Number.isInteger(status)) {
    throw providerError('N8N_OUTCOME_UNKNOWN', { outcomeUnknown: true });
  }
  if ([401, 403].includes(status)) {
    throw providerError('N8N_AUTHENTICATION_FAILED');
  }
  if (status === 429) {
    throw providerError('N8N_RATE_LIMITED', { retryable: true });
  }
  if (status >= 500) {
    throw providerError('N8N_OUTCOME_UNKNOWN', { outcomeUnknown: true });
  }
  if (status < 200 || status >= 300) {
    throw providerError('N8N_DISPATCH_REJECTED');
  }

  const executionId = response?.body?.executionId;
  if (typeof executionId !== 'string' || !executionId.trim()) {
    throw providerError('N8N_EXECUTION_ID_MISSING', {
      retryable: false,
      outcomeUnknown: true,
    });
  }
  return executionId.trim();
}

function assertReadbackResponse(response, executionId) {
  const status = Number(response?.status);
  if ([401, 403].includes(status)) {
    throw providerError('N8N_VERIFICATION_AUTH_FAILED', {
      retryable: false,
      outcomeUnknown: true,
    });
  }
  if (!Number.isInteger(status) || status >= 500 || status === 429) {
    throw providerError('N8N_VERIFICATION_UNAVAILABLE', {
      retryable: false,
      outcomeUnknown: true,
    });
  }
  if (status < 200 || status >= 300) {
    throw providerError('N8N_VERIFICATION_FAILED');
  }

  const record = response?.body;
  const recordId = typeof record?.id === 'number' ? String(record.id) : record?.id;
  const executionStatus = typeof record?.status === 'string' ? record.status.toLowerCase() : '';
  const verified = recordId === executionId
    && SUCCESS_STATES.has(executionStatus)
    && record?.finished !== false;

  if (!verified) throw providerError('N8N_VERIFICATION_FAILED');
  return Object.freeze({
    executionId,
    status: executionStatus,
    finished: record?.finished === true,
  });
}

export function createN8nWorkflowAdapter({
  capabilityRegistry,
  credentialBroker,
  transport,
  config,
} = {}) {
  validateDependencies({ capabilityRegistry, credentialBroker, transport });
  const normalizedConfig = normalizeConfig(config);

  async function execute(inputJob) {
    const job = validateJob(inputJob);
    assertQualifiedProvider(capabilityRegistry);

    let transportStarted = false;
    let dispatchResponse;
    try {
      dispatchResponse = await credentialBroker.withCredential(
        credentialRequest(normalizedConfig, job, normalizedConfig.webhookSecretBindingRef),
        async (credential) => {
          transportStarted = true;
          return transport.invokeWebhook({
            url: normalizedConfig.webhookUrl,
            method: 'POST',
            timeoutMs: normalizedConfig.timeoutMs,
            headers: {
              'Content-Type': 'application/json',
              [normalizedConfig.webhookAuthHeader]: credential.value,
              'X-VAOS-IDEMPOTENCY-KEY': job.id,
              'X-VAOS-INTENT-ID': job.intentId,
            },
            body: dispatchPayload(job),
          });
        },
      );
    } catch (error) {
      throw classifyDispatchException(error, transportStarted);
    }

    const executionId = assertDispatchResponse(dispatchResponse);

    let readbackResponse;
    let readbackStarted = false;
    try {
      readbackResponse = await credentialBroker.withCredential(
        credentialRequest(normalizedConfig, job, normalizedConfig.apiSecretBindingRef),
        async (credential) => {
          readbackStarted = true;
          return transport.readExecution({
            url: `${normalizedConfig.apiBaseUrl}/executions/${encodeURIComponent(executionId)}`,
            method: 'GET',
            timeoutMs: normalizedConfig.timeoutMs,
            headers: {
              Accept: 'application/json',
              'X-N8N-API-KEY': credential.value,
            },
          });
        },
      );
    } catch (error) {
      if (!readbackStarted) throw error;
      throw providerError('N8N_VERIFICATION_UNAVAILABLE', {
        retryable: false,
        outcomeUnknown: true,
      });
    }

    const verified = assertReadbackResponse(readbackResponse, executionId);

    return Object.freeze({
      adapterId: 'n8n.workflow.v1',
      providerId: PROVIDER_ID,
      capability: CAPABILITY,
      effect: Object.freeze({
        effectType: 'AUTOMATION.WORKFLOW_EXECUTED',
        resourceType: 'N8N_EXECUTION',
        resourceId: executionId,
        state: 'SUCCEEDED',
        idempotencyKey: job.id,
      }),
      verification: Object.freeze({
        verified: true,
        resourceType: 'N8N_EXECUTION',
        resourceId: executionId,
        expectedState: 'success',
        providerStatus: verified.status,
        evidenceSource: 'n8n.api.execution-readback',
        executionJobId: job.id,
        intentId: job.intentId,
      }),
    });
  }

  return Object.freeze({
    id: 'n8n.workflow.v1',
    providerId: PROVIDER_ID,
    capability: CAPABILITY,
    execute,
  });
}
