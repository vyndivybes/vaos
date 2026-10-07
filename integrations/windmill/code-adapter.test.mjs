import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createWindmillCodeAdapter } from './code-adapter.mjs';

function windmillManifest(overrides = {}) {
  return {
    schemaVersion: 'vaos.provider.v1',
    providerId: 'windmill',
    displayName: 'Windmill',
    capabilities: ['code.execute'],
    deploymentModes: ['self-hosted'],
    qualification: {
      state: 'qualified',
      qualifiedCapabilities: ['code.execute'],
      evidenceRefs: ['qualification:windmill:code:test'],
    },
    security: {
      secretBinding: 'required',
      dataEgress: 'controlled',
      authModes: ['bearer'],
      callbackVerification: 'none',
    },
    execution: {
      idempotency: 'not-supported',
      retrySemantics: 'conditional',
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
        value: 'windmill-secret-token',
        providerId: 'windmill',
        capabilities: ['code.execute'],
      };
    },
  });
}

function job(overrides = {}) {
  return {
    id: 'job-code-101',
    intentId: 'intent-code-101',
    actionType: 'CODE.RUN_SCRIPT',
    payload: {
      scriptKey: 'engineering.mass-estimate',
      args: { frameSize: 'M', layupRevision: '5.3.9' },
    },
    ...overrides,
  };
}

function config(overrides = {}) {
  return {
    baseUrl: 'https://windmill.internal.example',
    workspace: 'vaos',
    secretBindingRef: 'secret:windmill:service-account',
    scripts: {
      'engineering.mass-estimate': 'f/vaos/engineering/mass_estimate',
    },
    dispatchTimeoutMs: 15_000,
    completionTimeoutMs: 120_000,
    maxResultBytes: 65_536,
    ...overrides,
  };
}

function completed(overrides = {}) {
  return {
    id: '019f-job-101',
    success: true,
    script_path: 'f/vaos/engineering/mass_estimate',
    duration_ms: 842,
    result: { massGrams: 884.2, revision: '5.3.9' },
    ...overrides,
  };
}

test('Windmill adapter runs only an approved script and verifies the completed job by ID and script path', async () => {
  const calls = [];
  const adapter = createWindmillCodeAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [windmillManifest()] }),
    credentialBroker: broker(),
    transport: {
      async runScript(request) {
        calls.push({ operation: 'run', request });
        return { status: 201, headers: {}, body: '019f-job-101' };
      },
      async waitForJob(request) {
        calls.push({ operation: 'wait', request });
        return completed();
      },
    },
    config: config(),
  });

  const result = await adapter.execute(job());

  assert.equal(result.adapterId, 'windmill.code.v1');
  assert.equal(result.providerId, 'windmill');
  assert.equal(result.capability, 'code.execute');
  assert.equal(result.effect.resourceId, '019f-job-101');
  assert.equal(result.effect.state, 'SUCCEEDED');
  assert.deepEqual(result.effect.output, { massGrams: 884.2, revision: '5.3.9' });
  assert.equal(result.verification.verified, true);
  assert.equal(result.verification.scriptPath, 'f/vaos/engineering/mass_estimate');
  assert.equal(result.verification.evidenceSource, 'windmill.api.job-readback');

  const run = calls.find((call) => call.operation === 'run').request;
  assert.equal(run.url, 'https://windmill.internal.example/api/w/vaos/jobs/run/p/f/vaos/engineering/mass_estimate');
  assert.equal(run.headers.Authorization, 'Bearer windmill-secret-token');
  assert.equal(run.headers['X-VAOS-EXECUTION-JOB-ID'], 'job-code-101');
  assert.deepEqual(run.body, { frameSize: 'M', layupRevision: '5.3.9' });

  const wait = calls.find((call) => call.operation === 'wait').request;
  assert.equal(wait.jobId, '019f-job-101');
  assert.equal(wait.url, 'https://windmill.internal.example/api/w/vaos/jobs_u/get/019f-job-101');
  assert.equal(wait.headers.Authorization, 'Bearer windmill-secret-token');
  assert.equal(JSON.stringify(result).includes('windmill-secret-token'), false);
});

test('unknown script key fails before credentials or transport are touched', async () => {
  let touched = false;
  const credentialBroker = createCredentialBroker({
    async resolveCredential() { touched = true; throw new Error('should not resolve'); },
  });
  const adapter = createWindmillCodeAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [windmillManifest()] }),
    credentialBroker,
    transport: {
      async runScript() { touched = true; },
      async waitForJob() { touched = true; },
    },
    config: config(),
  });

  await assert.rejects(
    () => adapter.execute(job({ payload: { scriptKey: 'admin.arbitrary-shell', args: {} } })),
    /WINDMILL_SCRIPT_NOT_ALLOWED/,
  );
  assert.equal(touched, false);
});

test('Windmill adapter fails closed when code execution capability is not qualified', async () => {
  let touched = false;
  const adapter = createWindmillCodeAdapter({
    capabilityRegistry: createCapabilityRegistry({
      providers: [windmillManifest({ qualification: { state: 'evaluation', qualifiedCapabilities: [] } })],
    }),
    credentialBroker: broker(),
    transport: {
      async runScript() { touched = true; },
      async waitForJob() { touched = true; },
    },
    config: config(),
  });

  await assert.rejects(() => adapter.execute(job()), /WINDMILL_PROVIDER_NOT_QUALIFIED/);
  assert.equal(touched, false);
});

test('pre-send Windmill failure is retryable because no provider job exists yet', async () => {
  const adapter = createWindmillCodeAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [windmillManifest()] }),
    credentialBroker: broker(),
    transport: {
      async runScript() {
        const error = new Error('connection refused');
        error.requestSent = false;
        throw error;
      },
      async waitForJob() { throw new Error('not used'); },
    },
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'WINDMILL_DISPATCH_UNAVAILABLE');
        assert.equal(error.retryable, true);
        assert.equal(error.outcomeUnknown, false);
        throw error;
      }
    },
    /WINDMILL_DISPATCH_UNAVAILABLE/,
  );
});

test('post-send Windmill timeout is unknown outcome and never blindly redispatched', async () => {
  const adapter = createWindmillCodeAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [windmillManifest()] }),
    credentialBroker: broker(),
    transport: {
      async runScript() {
        const error = new Error('timeout after write');
        error.requestSent = true;
        throw error;
      },
      async waitForJob() { throw new Error('not used'); },
    },
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'WINDMILL_OUTCOME_UNKNOWN');
        assert.equal(error.retryable, false);
        assert.equal(error.outcomeUnknown, true);
        throw error;
      }
    },
    /WINDMILL_OUTCOME_UNKNOWN/,
  );
});

test('Windmill 429 is retryable only when the dispatch was explicitly rejected', async () => {
  const adapter = createWindmillCodeAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [windmillManifest()] }),
    credentialBroker: broker(),
    transport: {
      async runScript() { return { status: 429, headers: { 'retry-after': '15' }, body: {} }; },
      async waitForJob() { throw new Error('not used'); },
    },
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'WINDMILL_RATE_LIMITED');
        assert.equal(error.retryable, true);
        assert.equal(error.retryAfterSeconds, 15);
        throw error;
      }
    },
    /WINDMILL_RATE_LIMITED/,
  );
});

test('Windmill auth and missing-script responses are terminal', async () => {
  for (const [status, code] of [
    [401, 'WINDMILL_AUTHENTICATION_FAILED'],
    [403, 'WINDMILL_AUTHENTICATION_FAILED'],
    [404, 'WINDMILL_SCRIPT_NOT_FOUND'],
  ]) {
    const adapter = createWindmillCodeAdapter({
      capabilityRegistry: createCapabilityRegistry({ providers: [windmillManifest()] }),
      credentialBroker: broker(),
      transport: {
        async runScript() { return { status, headers: {}, body: {} }; },
        async waitForJob() { throw new Error('not used'); },
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

test('status wait failure after receiving a provider job ID never redispatches the script', async () => {
  let dispatches = 0;
  const adapter = createWindmillCodeAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [windmillManifest()] }),
    credentialBroker: broker(),
    transport: {
      async runScript() {
        dispatches += 1;
        return { status: 201, headers: {}, body: '019f-job-101' };
      },
      async waitForJob() { throw new Error('status endpoint unavailable'); },
    },
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'WINDMILL_JOB_STATUS_PENDING');
        assert.equal(error.retryable, false);
        assert.equal(error.outcomeUnknown, true);
        assert.equal(error.providerRunId, '019f-job-101');
        throw error;
      }
    },
    /WINDMILL_JOB_STATUS_PENDING/,
  );
  assert.equal(dispatches, 1);
});

test('failed Windmill job is terminal and preserves the provider run ID', async () => {
  const adapter = createWindmillCodeAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [windmillManifest()] }),
    credentialBroker: broker(),
    transport: {
      async runScript() { return { status: 201, headers: {}, body: '019f-job-101' }; },
      async waitForJob() { return completed({ success: false, result: { error: { name: 'Error', message: 'failed' } } }); },
    },
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'WINDMILL_JOB_FAILED');
        assert.equal(error.retryable, false);
        assert.equal(error.providerRunId, '019f-job-101');
        throw error;
      }
    },
    /WINDMILL_JOB_FAILED/,
  );
});

test('job readback must match both provider job ID and approved script path', async () => {
  for (const mismatch of [
    { id: 'other-job' },
    { script_path: 'f/vaos/admin/dangerous' },
  ]) {
    const adapter = createWindmillCodeAdapter({
      capabilityRegistry: createCapabilityRegistry({ providers: [windmillManifest()] }),
      credentialBroker: broker(),
      transport: {
        async runScript() { return { status: 201, headers: {}, body: '019f-job-101' }; },
        async waitForJob() { return completed(mismatch); },
      },
      config: config(),
    });

    await assert.rejects(
      () => adapter.execute(job()),
      /WINDMILL_VERIFICATION_FAILED/,
    );
  }
});

test('oversized Windmill results fail closed instead of being copied into VAOS evidence', async () => {
  const adapter = createWindmillCodeAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [windmillManifest()] }),
    credentialBroker: broker(),
    transport: {
      async runScript() { return { status: 201, headers: {}, body: '019f-job-101' }; },
      async waitForJob() { return completed({ result: { data: 'x'.repeat(300) } }); },
    },
    config: config({ maxResultBytes: 100 }),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'WINDMILL_RESULT_TOO_LARGE');
        assert.equal(error.retryable, false);
        throw error;
      }
    },
    /WINDMILL_RESULT_TOO_LARGE/,
  );
});

test('malformed code-execution job is rejected before credential or provider access', async () => {
  let touched = false;
  const credentialBroker = createCredentialBroker({
    async resolveCredential() { touched = true; throw new Error('should not resolve'); },
  });
  const adapter = createWindmillCodeAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [windmillManifest()] }),
    credentialBroker,
    transport: {
      async runScript() { touched = true; },
      async waitForJob() { touched = true; },
    },
    config: config(),
  });

  await assert.rejects(
    () => adapter.execute(job({ payload: { scriptKey: '', args: {} } })),
    /WINDMILL_JOB_INVALID:scriptKey/,
  );
  assert.equal(touched, false);
});
