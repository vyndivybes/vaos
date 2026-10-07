import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createAirbyteReplicationAdapter } from './replication-adapter.mjs';

function airbyteManifest(overrides = {}) {
  return {
    schemaVersion: 'vaos.provider.v1',
    providerId: 'airbyte',
    displayName: 'Airbyte',
    capabilities: ['data.replicate'],
    deploymentModes: ['self-hosted', 'managed-saas'],
    qualification: {
      state: 'qualified',
      qualifiedCapabilities: ['data.replicate'],
      evidenceRefs: ['qualification:airbyte:replication:test'],
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
  let calls = 0;
  return createCredentialBroker({
    async resolveCredential() {
      calls += 1;
      return {
        kind: 'bearer',
        value: `airbyte-token-${calls}`,
        providerId: 'airbyte',
        capabilities: ['data.replicate'],
      };
    },
  });
}

function job(overrides = {}) {
  return {
    id: 'job-data-101',
    intentId: 'intent-data-101',
    actionType: 'DATA.RUN_REPLICATION',
    payload: {
      connectionKey: 'finance.erp-to-warehouse',
    },
    ...overrides,
  };
}

function config(overrides = {}) {
  return {
    apiBaseUrl: 'https://airbyte.internal.example/api/public/v1',
    secretBindingRef: 'secret:airbyte:application',
    connections: {
      'finance.erp-to-warehouse': '9924bcd0-99be-453d-ba47-c2c9766f7da5',
    },
    dispatchTimeoutMs: 15_000,
    completionTimeoutMs: 300_000,
    ...overrides,
  };
}

function completed(overrides = {}) {
  return {
    jobId: 1234,
    status: 'succeeded',
    jobType: 'sync',
    connectionId: '9924bcd0-99be-453d-ba47-c2c9766f7da5',
    recordsSynced: 8421,
    bytesSynced: 65536,
    ...overrides,
  };
}

test('Airbyte adapter triggers only an approved connection and verifies completed sync metadata', async () => {
  const calls = [];
  const adapter = createAirbyteReplicationAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [airbyteManifest()] }),
    credentialBroker: broker(),
    transport: {
      async createJob(request) {
        calls.push({ operation: 'create', request });
        return { status: 200, headers: {}, body: { jobId: 1234, status: 'running', jobType: 'sync' } };
      },
      async waitForJob(request) {
        calls.push({ operation: 'wait', request });
        return completed();
      },
    },
    config: config(),
  });

  const result = await adapter.execute(job());

  assert.equal(result.adapterId, 'airbyte.replication.v1');
  assert.equal(result.providerId, 'airbyte');
  assert.equal(result.capability, 'data.replicate');
  assert.equal(result.effect.resourceId, '1234');
  assert.equal(result.effect.state, 'SUCCEEDED');
  assert.deepEqual(result.effect.summary, { recordsSynced: 8421, bytesSynced: 65536 });
  assert.equal(result.verification.verified, true);
  assert.equal(result.verification.connectionKey, 'finance.erp-to-warehouse');
  assert.equal(result.verification.evidenceSource, 'airbyte.api.job-readback');

  const create = calls.find((call) => call.operation === 'create').request;
  assert.equal(create.url, 'https://airbyte.internal.example/api/public/v1/jobs');
  assert.equal(create.headers.Authorization, 'Bearer airbyte-token-1');
  assert.deepEqual(create.body, {
    jobType: 'sync',
    connectionId: '9924bcd0-99be-453d-ba47-c2c9766f7da5',
  });

  const wait = calls.find((call) => call.operation === 'wait').request;
  assert.equal(wait.jobId, 1234);
  assert.equal(wait.headers.Authorization, 'Bearer airbyte-token-2');
  assert.equal(JSON.stringify(result).includes('airbyte-token'), false);
});

test('unknown Airbyte connection key fails before credentials or transport', async () => {
  let touched = false;
  const credentialBroker = createCredentialBroker({
    async resolveCredential() { touched = true; throw new Error('should not resolve'); },
  });
  const adapter = createAirbyteReplicationAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [airbyteManifest()] }),
    credentialBroker,
    transport: {
      async createJob() { touched = true; },
      async waitForJob() { touched = true; },
    },
    config: config(),
  });

  await assert.rejects(
    () => adapter.execute(job({ payload: { connectionKey: 'unapproved.connection' } })),
    /AIRBYTE_CONNECTION_NOT_ALLOWED/,
  );
  assert.equal(touched, false);
});

test('Airbyte adapter fails closed when replication capability is not qualified', async () => {
  let touched = false;
  const adapter = createAirbyteReplicationAdapter({
    capabilityRegistry: createCapabilityRegistry({
      providers: [airbyteManifest({ qualification: { state: 'evaluation', qualifiedCapabilities: [] } })],
    }),
    credentialBroker: broker(),
    transport: {
      async createJob() { touched = true; },
      async waitForJob() { touched = true; },
    },
    config: config(),
  });

  await assert.rejects(() => adapter.execute(job()), /AIRBYTE_PROVIDER_NOT_QUALIFIED/);
  assert.equal(touched, false);
});

test('Airbyte 409 busy response is safely retryable because no second sync is started', async () => {
  const adapter = createAirbyteReplicationAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [airbyteManifest()] }),
    credentialBroker: broker(),
    transport: {
      async createJob() { return { status: 409, headers: {}, body: { title: 'try-again-later' } }; },
      async waitForJob() { throw new Error('not used'); },
    },
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'AIRBYTE_CONNECTION_BUSY');
        assert.equal(error.retryable, true);
        assert.equal(error.outcomeUnknown, false);
        throw error;
      }
    },
    /AIRBYTE_CONNECTION_BUSY/,
  );
});

test('pre-send Airbyte failure is retryable but post-send timeout is unknown and not blindly retryable', async () => {
  for (const [requestSent, code, retryable, unknown] of [
    [false, 'AIRBYTE_DISPATCH_UNAVAILABLE', true, false],
    [true, 'AIRBYTE_OUTCOME_UNKNOWN', false, true],
  ]) {
    const adapter = createAirbyteReplicationAdapter({
      capabilityRegistry: createCapabilityRegistry({ providers: [airbyteManifest()] }),
      credentialBroker: broker(),
      transport: {
        async createJob() {
          const error = new Error('network failure');
          error.requestSent = requestSent;
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
          assert.equal(error.code, code);
          assert.equal(error.retryable, retryable);
          assert.equal(error.outcomeUnknown, unknown);
          throw error;
        }
      },
      new RegExp(code),
    );
  }
});

test('Airbyte auth, missing connection and rate limit responses are classified consistently', async () => {
  for (const [status, code, retryable] of [
    [401, 'AIRBYTE_AUTHENTICATION_FAILED', false],
    [403, 'AIRBYTE_AUTHENTICATION_FAILED', false],
    [404, 'AIRBYTE_CONNECTION_NOT_FOUND', false],
    [429, 'AIRBYTE_RATE_LIMITED', true],
  ]) {
    const adapter = createAirbyteReplicationAdapter({
      capabilityRegistry: createCapabilityRegistry({ providers: [airbyteManifest()] }),
      credentialBroker: broker(),
      transport: {
        async createJob() { return { status, headers: { 'retry-after': '30' }, body: {} }; },
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
          assert.equal(error.retryable, retryable);
          if (status === 429) assert.equal(error.retryAfterSeconds, 30);
          throw error;
        }
      },
      new RegExp(code),
    );
  }
});

test('status wait failure after job creation never starts a second Airbyte sync', async () => {
  let creates = 0;
  const adapter = createAirbyteReplicationAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [airbyteManifest()] }),
    credentialBroker: broker(),
    transport: {
      async createJob() {
        creates += 1;
        return { status: 200, headers: {}, body: { jobId: 1234, status: 'running', jobType: 'sync' } };
      },
      async waitForJob() { throw new Error('status unavailable'); },
    },
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'AIRBYTE_SYNC_STATUS_PENDING');
        assert.equal(error.retryable, false);
        assert.equal(error.outcomeUnknown, true);
        assert.equal(error.providerRunId, '1234');
        throw error;
      }
    },
    /AIRBYTE_SYNC_STATUS_PENDING/,
  );
  assert.equal(creates, 1);
});

test('running or queued sync after the wait window remains incomplete and must be reconciled by job ID', async () => {
  for (const status of ['running', 'queued']) {
    const adapter = createAirbyteReplicationAdapter({
      capabilityRegistry: createCapabilityRegistry({ providers: [airbyteManifest()] }),
      credentialBroker: broker(),
      transport: {
        async createJob() { return { status: 200, headers: {}, body: { jobId: 1234, status: 'running', jobType: 'sync' } }; },
        async waitForJob() { return completed({ status }); },
      },
      config: config(),
    });

    await assert.rejects(
      async () => {
        try {
          await adapter.execute(job());
        } catch (error) {
          assert.equal(error.code, 'AIRBYTE_SYNC_INCOMPLETE');
          assert.equal(error.providerRunId, '1234');
          assert.equal(error.retryable, false);
          throw error;
        }
      },
      /AIRBYTE_SYNC_INCOMPLETE/,
    );
  }
});

test('failed or cancelled Airbyte sync is terminal', async () => {
  for (const status of ['failed', 'cancelled']) {
    const adapter = createAirbyteReplicationAdapter({
      capabilityRegistry: createCapabilityRegistry({ providers: [airbyteManifest()] }),
      credentialBroker: broker(),
      transport: {
        async createJob() { return { status: 200, headers: {}, body: { jobId: 1234, status: 'running', jobType: 'sync' } }; },
        async waitForJob() { return completed({ status }); },
      },
      config: config(),
    });

    await assert.rejects(
      async () => {
        try {
          await adapter.execute(job());
        } catch (error) {
          assert.equal(error.code, 'AIRBYTE_SYNC_FAILED');
          assert.equal(error.providerRunId, '1234');
          assert.equal(error.retryable, false);
          throw error;
        }
      },
      /AIRBYTE_SYNC_FAILED/,
    );
  }
});

test('Airbyte readback must match job identity, type and governed connection when present', async () => {
  for (const mismatch of [
    { jobId: 9999 },
    { jobType: 'reset' },
    { connectionId: 'different-connection' },
  ]) {
    const adapter = createAirbyteReplicationAdapter({
      capabilityRegistry: createCapabilityRegistry({ providers: [airbyteManifest()] }),
      credentialBroker: broker(),
      transport: {
        async createJob() { return { status: 200, headers: {}, body: { jobId: 1234, status: 'running', jobType: 'sync' } }; },
        async waitForJob() { return completed(mismatch); },
      },
      config: config(),
    });

    await assert.rejects(
      () => adapter.execute(job()),
      /AIRBYTE_VERIFICATION_FAILED/,
    );
  }
});

test('malformed replication job is rejected before credentials or provider access', async () => {
  let touched = false;
  const credentialBroker = createCredentialBroker({
    async resolveCredential() { touched = true; throw new Error('should not resolve'); },
  });
  const adapter = createAirbyteReplicationAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [airbyteManifest()] }),
    credentialBroker,
    transport: {
      async createJob() { touched = true; },
      async waitForJob() { touched = true; },
    },
    config: config(),
  });

  await assert.rejects(
    () => adapter.execute(job({ payload: { connectionKey: '' } })),
    /AIRBYTE_JOB_INVALID:connectionKey/,
  );
  assert.equal(touched, false);
});
