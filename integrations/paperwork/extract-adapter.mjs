const PROVIDER_ID = 'paperwork';
const CAPABILITY = 'document.extract';
const RUN_ACTIVE = new Set(['queued', 'processing']);
const RUN_TERMINAL_FAILURE = new Set(['failed', 'cancelled', 'expired']);

function providerError(code, {
  message = code,
  retryable = false,
  outcomeUnknown = false,
  retryAfterSeconds,
  runId,
} = {}) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  error.outcomeUnknown = outcomeUnknown;
  if (Number.isFinite(retryAfterSeconds)) error.retryAfterSeconds = retryAfterSeconds;
  if (runId) error.runId = runId;
  return error;
}

function requiredText(input, key, prefix = 'PAPERWORK_JOB_INVALID') {
  const value = input?.[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw providerError(prefix, { message: `${prefix}:${key}` });
  }
  return value.trim();
}

function clone(value) {
  return structuredClone(value);
}

function normalizeFile(file) {
  if (!file || typeof file !== 'object' || Array.isArray(file)) {
    throw providerError('PAPERWORK_JOB_INVALID', { message: 'PAPERWORK_JOB_INVALID:file' });
  }

  const hasId = typeof file.id === 'string' && Boolean(file.id.trim());
  const hasUrl = typeof file.url === 'string' && Boolean(file.url.trim());
  if (hasId === hasUrl) {
    throw providerError('PAPERWORK_JOB_INVALID', { message: 'PAPERWORK_JOB_INVALID:file' });
  }

  if (hasId) return Object.freeze({ id: file.id.trim() });

  let parsed;
  try {
    parsed = new URL(file.url.trim());
  } catch {
    throw providerError('PAPERWORK_JOB_INVALID', { message: 'PAPERWORK_JOB_INVALID:file' });
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw providerError('PAPERWORK_JOB_INVALID', { message: 'PAPERWORK_JOB_INVALID:file' });
  }

  const normalized = { url: parsed.toString() };
  if (file.name !== undefined) {
    if (typeof file.name !== 'string' || !file.name.trim()) {
      throw providerError('PAPERWORK_JOB_INVALID', { message: 'PAPERWORK_JOB_INVALID:file.name' });
    }
    normalized.name = file.name.trim();
  }
  return Object.freeze(normalized);
}

function normalizeSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)
      || schema.type !== 'object'
      || !schema.properties
      || typeof schema.properties !== 'object'
      || Array.isArray(schema.properties)) {
    throw providerError('PAPERWORK_JOB_INVALID', { message: 'PAPERWORK_JOB_INVALID:schema' });
  }
  return Object.freeze(clone(schema));
}

function validateJob(job) {
  const id = requiredText(job, 'id');
  const intentId = requiredText(job, 'intentId');
  const actionType = requiredText(job, 'actionType');
  if (!job?.payload || typeof job.payload !== 'object' || Array.isArray(job.payload)) {
    throw providerError('PAPERWORK_JOB_INVALID', { message: 'PAPERWORK_JOB_INVALID:payload' });
  }
  return Object.freeze({
    id,
    intentId,
    actionType,
    file: normalizeFile(job.payload.file),
    schema: normalizeSchema(job.payload.schema),
  });
}

function requiredConfigText(input, key) {
  return requiredText(input, key, 'PAPERWORK_CONFIG_INVALID');
}

function absoluteHttpUrl(value, key) {
  if (typeof value !== 'string' || !value.trim()) {
    throw providerError('PAPERWORK_CONFIG_INVALID', { message: `PAPERWORK_CONFIG_INVALID:${key}` });
  }
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw providerError('PAPERWORK_CONFIG_INVALID', { message: `PAPERWORK_CONFIG_INVALID:${key}` });
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw providerError('PAPERWORK_CONFIG_INVALID', { message: `PAPERWORK_CONFIG_INVALID:${key}` });
  }
  return parsed.toString().replace(/\/$/, '');
}

function boundedInteger(value, key, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw providerError('PAPERWORK_CONFIG_INVALID', { message: `PAPERWORK_CONFIG_INVALID:${key}` });
  }
  return number;
}

function normalizeConfig(config) {
  return Object.freeze({
    apiBaseUrl: absoluteHttpUrl(config?.apiBaseUrl, 'apiBaseUrl'),
    secretBindingRef: requiredConfigText(config, 'secretBindingRef'),
    createWaitSeconds: boundedInteger(config?.createWaitSeconds ?? 0, 'createWaitSeconds', 0, 120),
    readWaitSeconds: boundedInteger(config?.readWaitSeconds ?? 30, 'readWaitSeconds', 0, 120),
    timeoutMs: boundedInteger(config?.timeoutMs ?? 45_000, 'timeoutMs', 1_000, 180_000),
    ttlSeconds: boundedInteger(config?.ttlSeconds ?? 86_400, 'ttlSeconds', 60, 604_800),
  });
}

function validateDependencies({ capabilityRegistry, credentialBroker, transport }) {
  if (!capabilityRegistry || typeof capabilityRegistry.resolve !== 'function') {
    throw providerError('PAPERWORK_CAPABILITY_REGISTRY_REQUIRED');
  }
  if (!credentialBroker || typeof credentialBroker.withCredential !== 'function') {
    throw providerError('PAPERWORK_CREDENTIAL_BROKER_REQUIRED');
  }
  if (!transport
      || typeof transport.createExtract !== 'function'
      || typeof transport.readRun !== 'function') {
    throw providerError('PAPERWORK_TRANSPORT_REQUIRED');
  }
}

function assertQualifiedProvider(capabilityRegistry) {
  const provider = capabilityRegistry.resolve(CAPABILITY, {
    allowedProviderIds: [PROVIDER_ID],
  });
  if (!provider || provider.providerId !== PROVIDER_ID) {
    throw providerError('PAPERWORK_PROVIDER_NOT_QUALIFIED');
  }
  return provider;
}

function credentialRequest(config, job) {
  return {
    bindingRef: config.secretBindingRef,
    providerId: PROVIDER_ID,
    capability: CAPABILITY,
    executionJobId: job.id,
    intentId: job.intentId,
  };
}

function authHeader(credential) {
  if (credential?.kind !== 'bearer') {
    throw providerError('PAPERWORK_CREDENTIAL_KIND_INVALID');
  }
  return `Bearer ${credential.value}`;
}

function extractRequestBody(job, config) {
  return Object.freeze({
    file: clone(job.file),
    schema: clone(job.schema),
    citations: true,
    metadata: {
      executionJobId: job.id,
      intentId: job.intentId,
    },
    ttl: config.ttlSeconds,
  });
}

function retryAfter(headers) {
  if (!headers || typeof headers !== 'object') return undefined;
  const entry = Object.entries(headers)
    .find(([key]) => key.toLowerCase() === 'retry-after');
  const value = entry ? Number(entry[1]) : NaN;
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function classifyCreateResponse(response) {
  const status = Number(response?.status);
  if ([401, 403].includes(status)) throw providerError('PAPERWORK_AUTHENTICATION_FAILED');
  if (status === 402) throw providerError('PAPERWORK_ACCOUNT_BLOCKED');
  if (status === 409) throw providerError('PAPERWORK_IDEMPOTENCY_CONFLICT');
  if (status === 429) {
    throw providerError('PAPERWORK_RATE_LIMITED', {
      retryable: true,
      outcomeUnknown: false,
      retryAfterSeconds: retryAfter(response?.headers),
    });
  }
  if (Number.isInteger(status) && status >= 500) {
    throw providerError('PAPERWORK_DISPATCH_UNCERTAIN', {
      retryable: true,
      outcomeUnknown: true,
    });
  }
  if (![200, 202].includes(status)) {
    throw providerError('PAPERWORK_REQUEST_REJECTED');
  }

  const runId = response?.body?.id;
  if (typeof runId !== 'string' || !runId.trim()) {
    throw providerError('PAPERWORK_DISPATCH_UNCERTAIN', {
      retryable: true,
      outcomeUnknown: true,
    });
  }
  return Object.freeze({ runId: runId.trim(), run: response.body });
}

function classifyReadResponse(response, runId) {
  const status = Number(response?.status);
  if ([401, 403].includes(status)) {
    throw providerError('PAPERWORK_VERIFICATION_AUTH_FAILED', { runId });
  }
  if (status === 429) {
    throw providerError('PAPERWORK_VERIFICATION_UNAVAILABLE', {
      retryable: true,
      outcomeUnknown: true,
      retryAfterSeconds: retryAfter(response?.headers),
      runId,
    });
  }
  if (!Number.isInteger(status) || status >= 500) {
    throw providerError('PAPERWORK_VERIFICATION_UNAVAILABLE', {
      retryable: true,
      outcomeUnknown: true,
      runId,
    });
  }
  if (status === 404) throw providerError('PAPERWORK_RUN_NOT_FOUND', { runId });
  if (status < 200 || status >= 300) {
    throw providerError('PAPERWORK_VERIFICATION_FAILED', { runId });
  }
  return response?.body;
}

function validateCitations(citations) {
  if (!citations || typeof citations !== 'object' || Array.isArray(citations)) return false;
  const entries = Object.values(citations);
  if (!entries.length) return false;
  return entries.every((item) => Array.isArray(item) && item.length > 0);
}

function verifyProcessedRun(run, expectedRunId) {
  if (!run || typeof run !== 'object' || run.id !== expectedRunId || run.status !== 'processed') {
    throw providerError('PAPERWORK_VERIFICATION_FAILED', { runId: expectedRunId });
  }
  const value = run.output?.value;
  const citations = run.output?.citations;
  if (!value || typeof value !== 'object' || Array.isArray(value) || !validateCitations(citations)) {
    throw providerError('PAPERWORK_VERIFICATION_FAILED', { runId: expectedRunId });
  }

  const files = Array.isArray(run.files)
    ? run.files
      .filter((file) => file && typeof file.id === 'string')
      .map((file) => ({ id: file.id, name: typeof file.name === 'string' ? file.name : undefined, status: file.status }))
    : [];

  return Object.freeze({
    output: clone(value),
    citations: clone(citations),
    files: clone(files),
  });
}

function classifyRun(run, runId) {
  const status = typeof run?.status === 'string' ? run.status.toLowerCase() : '';
  if (status === 'processed') return verifyProcessedRun(run, runId);
  if (RUN_ACTIVE.has(status)) {
    throw providerError('PAPERWORK_RUN_INCOMPLETE', {
      retryable: true,
      outcomeUnknown: false,
      runId,
    });
  }
  if (RUN_TERMINAL_FAILURE.has(status)) {
    throw providerError('PAPERWORK_RUN_FAILED', {
      retryable: false,
      outcomeUnknown: false,
      runId,
    });
  }
  throw providerError('PAPERWORK_VERIFICATION_FAILED', { runId });
}

function classifyCreateException(error, requestStarted) {
  if (!requestStarted) return error;
  if (error?.requestSent === false) {
    return providerError('PAPERWORK_DISPATCH_UNAVAILABLE', {
      retryable: true,
      outcomeUnknown: false,
    });
  }
  return providerError('PAPERWORK_DISPATCH_UNCERTAIN', {
    retryable: true,
    outcomeUnknown: true,
  });
}

export function createPaperworkExtractAdapter({
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

    let requestStarted = false;
    let createResponse;
    try {
      createResponse = await credentialBroker.withCredential(
        credentialRequest(normalizedConfig, job),
        async (credential) => {
          requestStarted = true;
          return transport.createExtract({
            url: `${normalizedConfig.apiBaseUrl}/v1/extract?wait=${normalizedConfig.createWaitSeconds}`,
            method: 'POST',
            timeoutMs: normalizedConfig.timeoutMs,
            headers: {
              Authorization: authHeader(credential),
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'Idempotency-Key': job.id,
            },
            body: extractRequestBody(job, normalizedConfig),
          });
        },
      );
    } catch (error) {
      throw classifyCreateException(error, requestStarted);
    }

    const created = classifyCreateResponse(createResponse);
    let run = created.run;
    const initialStatus = typeof run?.status === 'string' ? run.status.toLowerCase() : '';

    if (RUN_ACTIVE.has(initialStatus)) {
      let readResponse;
      try {
        readResponse = await credentialBroker.withCredential(
          credentialRequest(normalizedConfig, job),
          async (credential) => transport.readRun({
            url: `${normalizedConfig.apiBaseUrl}/v1/runs/${encodeURIComponent(created.runId)}?wait=${normalizedConfig.readWaitSeconds}`,
            method: 'GET',
            timeoutMs: normalizedConfig.timeoutMs,
            headers: {
              Authorization: authHeader(credential),
              Accept: 'application/json',
            },
          }),
        );
      } catch (error) {
        if (error?.code?.startsWith?.('CREDENTIAL_') || error?.code === 'PAPERWORK_CREDENTIAL_KIND_INVALID') {
          throw error;
        }
        throw providerError('PAPERWORK_VERIFICATION_UNAVAILABLE', {
          retryable: true,
          outcomeUnknown: true,
          runId: created.runId,
        });
      }
      run = classifyReadResponse(readResponse, created.runId);
    }

    const verified = classifyRun(run, created.runId);

    return Object.freeze({
      adapterId: 'paperwork.extract.v1',
      providerId: PROVIDER_ID,
      capability: CAPABILITY,
      effect: Object.freeze({
        effectType: 'DOCUMENT.STRUCTURED_DATA_EXTRACTED',
        resourceType: 'PAPERWORK_EXTRACT_RUN',
        resourceId: created.runId,
        state: 'PROCESSED',
        output: clone(verified.output),
        idempotencyKey: job.id,
      }),
      verification: Object.freeze({
        verified: true,
        resourceType: 'PAPERWORK_EXTRACT_RUN',
        resourceId: created.runId,
        expectedState: 'processed',
        citations: clone(verified.citations),
        files: clone(verified.files),
        evidenceSource: 'paperwork.api.extract-run',
        executionJobId: job.id,
        intentId: job.intentId,
      }),
    });
  }

  return Object.freeze({
    id: 'paperwork.extract.v1',
    providerId: PROVIDER_ID,
    capability: CAPABILITY,
    execute,
  });
}
