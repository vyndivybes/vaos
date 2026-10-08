import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createPaperworkExtractAdapter } from './extract-adapter.mjs';

function paperworkManifest(overrides = {}) {
  return {
    schemaVersion: 'vaos.provider.v1',
    providerId: 'paperwork',
    displayName: 'Paperwork',
    capabilities: ['document.extract'],
    deploymentModes: ['managed-saas'],
    qualification: {
      state: 'qualified',
      qualifiedCapabilities: ['document.extract'],
      evidenceRefs: ['qualification:paperwork:extract:test'],
    },
    security: {
      secretBinding: 'required',
      dataEgress: 'external',
      authModes: ['bearer'],
      callbackVerification: 'public-key',
    },
    execution: {
      idempotency: 'native',
      retrySemantics: 'safe',
      verificationStrategy: 'provider-readback',
      healthProbe: 'required',
    },
    ...overrides,
  };
}

function broker() {
  return createCredentialBroker({
    async resolveCredential() {
      return {
        kind: 'bearer',
        value: 'paperwork-secret',
        providerId: 'paperwork',
        capabilities: ['document.extract'],
      };
    },
  });
}

function job(overrides = {}) {
  return {
    id: 'job-doc-101',
    intentId: 'intent-doc-101',
    actionType: 'DOCUMENT.EXTRACT',
    payload: {
      file: { url: 'https://files.example.test/supplier-quote.pdf', name: 'supplier-quote.pdf' },
      schema: {
        type: 'object',
        properties: {
          supplier: { type: ['string', 'null'] },
          price: { type: ['number', 'null'] },
        },
      },
    },
    ...overrides,
  };
}

function config(overrides = {}) {
  return {
    apiBaseUrl: 'https://api.cloudraker.com',
    secretBindingRef: 'secret:paperwork:api',
    createWaitSeconds: 0,
    readWaitSeconds: 30,
    timeoutMs: 45_000,
    ttlSeconds: 86_400,
    ...overrides,
  };
}

function processedRun(id = 'exr_101') {
  return {
    object: 'extract_run',
    id,
    status: 'processed',
    files: [{ id: 'file-1', name: 'supplier-quote.pdf', status: 'processed' }],
    output: {
      value: { supplier: 'Acme Carbon', price: 1250 },
      citations: {
        supplier: [{ fileId: 'file-1', page: 0, bbox: { x: 0.1, y: 0.2, width: 0.3, height: 0.05 } }],
        price: [{ fileId: 'file-1', page: 0, bbox: { x: 0.5, y: 0.6, width: 0.2, height: 0.05 } }],
      },
    },
  };
}

test('Paperwork adapter extracts structured data with citations and verified provider evidence', async () => {
  const calls = [];
  const transport = {
    async createExtract(request) {
      calls.push({ operation: 'create', request });
      return { status: 200, headers: {}, body: processedRun() };
    },
    async readRun(request) {
      calls.push({ operation: 'read', request });
      throw new Error('sync result should not poll');
    },
  };

  const adapter = createPaperworkExtractAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [paperworkManifest()] }),
    credentialBroker: broker(),
    transport,
    config: config(),
  });

  const result = await adapter.execute(job());

  assert.equal(result.adapterId, 'paperwork.extract.v1');
  assert.equal(result.providerId, 'paperwork');
  assert.equal(result.capability, 'document.extract');
  assert.equal(result.effect.resourceId, 'exr_101');
  assert.equal(result.effect.state, 'PROCESSED');
  assert.deepEqual(result.effect.output, { supplier: 'Acme Carbon', price: 1250 });
  assert.equal(result.verification.verified, true);
  assert.deepEqual(Object.keys(result.verification.citations).sort(), ['price', 'supplier']);
  assert.equal(result.verification.evidenceSource, 'paperwork.api.extract-run');

  const create = calls[0].request;
  assert.equal(create.url, 'https://api.cloudraker.com/v1/extract?wait=0');
  assert.equal(create.headers.Authorization, 'Bearer paperwork-secret');
  assert.equal(create.headers['Idempotency-Key'], 'job-doc-101');
  assert.equal(create.body.citations, true);
  assert.equal(create.body.metadata.executionJobId, 'job-doc-101');
  assert.equal(create.body.metadata.intentId, 'intent-doc-101');
  assert.equal(JSON.stringify(result).includes('paperwork-secret'), false);
});

test('Paperwork 202 response is followed through the authoritative run endpoint', async () => {
  const calls = [];
  const transport = {
    async createExtract(request) {
      calls.push({ operation: 'create', request });
      return {
        status: 202,
        headers: {},
        body: { object: 'extract_run', id: 'exr_async', status: 'processing', statusUrl: '/v1/runs/exr_async' },
      };
    },
    async readRun(request) {
      calls.push({ operation: 'read', request });
      return { status: 200, headers: {}, body: processedRun('exr_async') };
    },
  };

  const adapter = createPaperworkExtractAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [paperworkManifest()] }),
    credentialBroker: broker(),
    transport,
    config: config(),
  });

  const result = await adapter.execute(job());

  assert.equal(result.effect.resourceId, 'exr_async');
  assert.equal(result.verification.verified, true);
  const read = calls.find((call) => call.operation === 'read').request;
  assert.equal(read.url, 'https://api.cloudraker.com/v1/runs/exr_async?wait=30');
  assert.equal(read.headers.Authorization, 'Bearer paperwork-secret');
});

test('Paperwork adapter fails closed when document extraction is not qualified', async () => {
  let touched = false;
  const adapter = createPaperworkExtractAdapter({
    capabilityRegistry: createCapabilityRegistry({
      providers: [paperworkManifest({ qualification: { state: 'evaluation', qualifiedCapabilities: [] } })],
    }),
    credentialBroker: broker(),
    transport: {
      async createExtract() { touched = true; },
      async readRun() { touched = true; },
    },
    config: config(),
  });

  await assert.rejects(() => adapter.execute(job()), /PAPERWORK_PROVIDER_NOT_QUALIFIED/);
  assert.equal(touched, false);
});

test('Paperwork uses the VAOS execution job id as a stable provider idempotency key', async () => {
  const keys = [];
  const transport = {
    async createExtract(request) {
      keys.push(request.headers['Idempotency-Key']);
      return { status: 200, headers: {}, body: processedRun(`exr_${keys.length}`) };
    },
    async readRun() { throw new Error('not used'); },
  };
  const adapter = createPaperworkExtractAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [paperworkManifest()] }),
    credentialBroker: broker(),
    transport,
    config: config(),
  });

  await adapter.execute(job());
  await adapter.execute(job());

  assert.deepEqual(keys, ['job-doc-101', 'job-doc-101']);
});

test('ambiguous dispatch failure remains retryable because Paperwork idempotency replays the original run', async () => {
  const transport = {
    async createExtract() {
      const error = new Error('socket closed after send');
      error.requestSent = true;
      throw error;
    },
    async readRun() { throw new Error('not used'); },
  };
  const adapter = createPaperworkExtractAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [paperworkManifest()] }),
    credentialBroker: broker(),
    transport,
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'PAPERWORK_DISPATCH_UNCERTAIN');
        assert.equal(error.retryable, true);
        assert.equal(error.outcomeUnknown, true);
        throw error;
      }
    },
    /PAPERWORK_DISPATCH_UNCERTAIN/,
  );
});

test('Paperwork rate limit is retryable and preserves Retry-After without claiming a run started', async () => {
  const adapter = createPaperworkExtractAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [paperworkManifest()] }),
    credentialBroker: broker(),
    transport: {
      async createExtract() {
        return { status: 429, headers: { 'retry-after': '60' }, body: { code: 'rate_limited' } };
      },
      async readRun() { throw new Error('not used'); },
    },
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'PAPERWORK_RATE_LIMITED');
        assert.equal(error.retryable, true);
        assert.equal(error.outcomeUnknown, false);
        assert.equal(error.retryAfterSeconds, 60);
        throw error;
      }
    },
    /PAPERWORK_RATE_LIMITED/,
  );
});

test('Paperwork auth, plan/credit and idempotency-conflict errors are terminal', async () => {
  for (const [status, code] of [
    [401, 'PAPERWORK_AUTHENTICATION_FAILED'],
    [402, 'PAPERWORK_ACCOUNT_BLOCKED'],
    [409, 'PAPERWORK_IDEMPOTENCY_CONFLICT'],
  ]) {
    const adapter = createPaperworkExtractAdapter({
      capabilityRegistry: createCapabilityRegistry({ providers: [paperworkManifest()] }),
      credentialBroker: broker(),
      transport: {
        async createExtract() { return { status, headers: {}, body: {} }; },
        async readRun() { throw new Error('not used'); },
      },
      config: config(),
    });
    await assert.rejects(
      async () => {
        try {
          await adapter.execute(job());
        } catch (error) {
          assert.equal(error.code, code);
          assert.equal(error.retryable, false);
          throw error;
        }
      },
      new RegExp(code),
    );
  }
});

test('processed Paperwork result without citation evidence fails verification', async () => {
  const run = processedRun();
  delete run.output.citations;
  const adapter = createPaperworkExtractAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [paperworkManifest()] }),
    credentialBroker: broker(),
    transport: {
      async createExtract() { return { status: 200, headers: {}, body: run }; },
      async readRun() { throw new Error('not used'); },
    },
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'PAPERWORK_VERIFICATION_FAILED');
        assert.equal(error.retryable, false);
        throw error;
      }
    },
    /PAPERWORK_VERIFICATION_FAILED/,
  );
});

test('known Paperwork run that is still processing is retryable without creating a new logical run', async () => {
  const adapter = createPaperworkExtractAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [paperworkManifest()] }),
    credentialBroker: broker(),
    transport: {
      async createExtract() {
        return { status: 202, headers: {}, body: { id: 'exr_slow', status: 'processing' } };
      },
      async readRun() {
        return { status: 200, headers: {}, body: { id: 'exr_slow', status: 'processing' } };
      },
    },
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'PAPERWORK_RUN_INCOMPLETE');
        assert.equal(error.retryable, true);
        assert.equal(error.runId, 'exr_slow');
        throw error;
      }
    },
    /PAPERWORK_RUN_INCOMPLETE/,
  );
});

test('terminal provider run failure is not converted into successful extraction', async () => {
  const adapter = createPaperworkExtractAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [paperworkManifest()] }),
    credentialBroker: broker(),
    transport: {
      async createExtract() {
        return {
          status: 200,
          headers: {},
          body: { id: 'exr_failed', status: 'failed', files: [{ id: 'file-1', error: { code: 'parse_failed' } }] },
        };
      },
      async readRun() { throw new Error('not used'); },
    },
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'PAPERWORK_RUN_FAILED');
        assert.equal(error.retryable, false);
        throw error;
      }
    },
    /PAPERWORK_RUN_FAILED/,
  );
});

test('malformed extraction job is rejected before credentials or provider transport are touched', async () => {
  let touched = false;
  const credentialBroker = createCredentialBroker({
    async resolveCredential() { touched = true; throw new Error('should not resolve'); },
  });
  const adapter = createPaperworkExtractAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [paperworkManifest()] }),
    credentialBroker,
    transport: {
      async createExtract() { touched = true; },
      async readRun() { touched = true; },
    },
    config: config(),
  });

  const malformed = job({ payload: { file: {}, schema: {} } });
  await assert.rejects(() => adapter.execute(malformed), /PAPERWORK_JOB_INVALID:file/);
  assert.equal(touched, false);
});
