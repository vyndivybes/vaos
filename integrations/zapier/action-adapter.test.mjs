import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createZapierActionAdapter } from './action-adapter.mjs';

function zapierManifest(overrides = {}) {
  return {
    schemaVersion: 'vaos.provider.v1',
    providerId: 'zapier',
    displayName: 'Zapier',
    capabilities: ['integration.saas'],
    deploymentModes: ['managed-saas'],
    qualification: {
      state: 'qualified',
      qualifiedCapabilities: ['integration.saas'],
      evidenceRefs: ['qualification:zapier:saas:test'],
    },
    security: {
      secretBinding: 'required',
      dataEgress: 'external',
      authModes: ['local'],
      callbackVerification: 'provider-specific',
    },
    execution: {
      idempotency: 'not-supported',
      retrySemantics: 'conditional',
      verificationStrategy: 'callback-evidence',
      healthProbe: 'optional',
    },
    ...overrides,
  };
}

function broker() {
  return createCredentialBroker({
    async resolveCredential() {
      return {
        kind: 'url',
        value: 'https://hooks.zapier.com/hooks/catch/12345/abcdef/',
        providerId: 'zapier',
        capabilities: ['integration.saas'],
      };
    },
  });
}

function job(overrides = {}) {
  return {
    id: 'job-zap-101',
    intentId: 'intent-zap-101',
    actionType: 'INTEGRATION.RUN_ZAP',
    payload: {
      actionKey: 'supplier.notify-approved',
      input: {
        supplierId: 'SUP-42',
        supplierName: 'Acme Carbon',
      },
    },
    ...overrides,
  };
}

function config(overrides = {}) {
  return {
    hookSecretBindingRef: 'secret:zapier:supplier-approved',
    dispatchTimeoutMs: 15_000,
    receiptWaitMs: 30_000,
    ...overrides,
  };
}

function receiptPort(overrides = {}) {
  return {
    async issue(input) {
      return {
        receiptRef: `receipt:${input.executionJobId}`,
        callbackUrl: `https://vaos.example.test/api/integrations/zapier/receipts/${input.executionJobId}?token=one-time-token`,
      };
    },
    async waitForReceipt(input) {
      return {
        receiptRef: input.receiptRef,
        providerId: 'zapier',
        executionJobId: 'job-zap-101',
        intentId: 'intent-zap-101',
        actionKey: 'supplier.notify-approved',
        status: 'succeeded',
        evidence: { destination: 'crm', externalRecordId: 'CRM-99' },
      };
    },
    ...overrides,
  };
}

test('Zapier adapter dispatches a predefined Zap and succeeds only after verified callback evidence', async () => {
  const calls = [];
  const adapter = createZapierActionAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [zapierManifest()] }),
    credentialBroker: broker(),
    receiptPort: receiptPort(),
    transport: {
      async postHook(request) {
        calls.push(request);
        return { status: 200, headers: {}, body: { status: 'success' } };
      },
    },
    config: config(),
  });

  const result = await adapter.execute(job());

  assert.equal(result.adapterId, 'zapier.action.v1');
  assert.equal(result.providerId, 'zapier');
  assert.equal(result.capability, 'integration.saas');
  assert.equal(result.effect.resourceId, 'receipt:job-zap-101');
  assert.equal(result.effect.state, 'SUCCEEDED');
  assert.deepEqual(result.effect.evidence, { destination: 'crm', externalRecordId: 'CRM-99' });
  assert.equal(result.verification.verified, true);
  assert.equal(result.verification.evidenceSource, 'vaos.callback.receipt');

  const request = calls[0];
  assert.equal(request.url, 'https://hooks.zapier.com/hooks/catch/12345/abcdef/');
  assert.equal(request.headers['X-VAOS-IDEMPOTENCY-KEY'], 'job-zap-101');
  assert.equal(request.body.executionJobId, 'job-zap-101');
  assert.equal(request.body.intentId, 'intent-zap-101');
  assert.equal(request.body.idempotencyKey, 'job-zap-101');
  assert.equal(request.body.actionKey, 'supplier.notify-approved');
  assert.match(request.body.callbackUrl, /job-zap-101/);
  assert.equal(JSON.stringify(result).includes('hooks.zapier.com'), false);
  assert.equal(JSON.stringify(result).includes('one-time-token'), false);
});

test('Zapier adapter fails closed when SaaS integration capability is not qualified', async () => {
  let touched = false;
  const adapter = createZapierActionAdapter({
    capabilityRegistry: createCapabilityRegistry({
      providers: [zapierManifest({ qualification: { state: 'evaluation', qualifiedCapabilities: [] } })],
    }),
    credentialBroker: broker(),
    receiptPort: receiptPort({
      async issue() { touched = true; },
      async waitForReceipt() { touched = true; },
    }),
    transport: {
      async postHook() { touched = true; },
    },
    config: config(),
  });

  await assert.rejects(() => adapter.execute(job()), /ZAPIER_PROVIDER_NOT_QUALIFIED/);
  assert.equal(touched, false);
});

test('Zapier payload carries a stable VAOS idempotency identity even though Catch Hooks do not provide idempotent execution', async () => {
  const keys = [];
  const receipts = [];
  const adapter = createZapierActionAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [zapierManifest()] }),
    credentialBroker: broker(),
    receiptPort: receiptPort({
      async issue(input) {
        receipts.push(input.executionJobId);
        return { receiptRef: `receipt:${input.executionJobId}`, callbackUrl: 'https://vaos.example.test/callback?token=opaque' };
      },
    }),
    transport: {
      async postHook(request) {
        keys.push(request.headers['X-VAOS-IDEMPOTENCY-KEY']);
        return { status: 200, headers: {}, body: {} };
      },
    },
    config: config(),
  });

  await adapter.execute(job());
  await adapter.execute(job());

  assert.deepEqual(keys, ['job-zap-101', 'job-zap-101']);
  assert.deepEqual(receipts, ['job-zap-101', 'job-zap-101']);
});

test('pre-send Zapier connection failure is retryable because the Catch Hook was not reached', async () => {
  const adapter = createZapierActionAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [zapierManifest()] }),
    credentialBroker: broker(),
    receiptPort: receiptPort(),
    transport: {
      async postHook() {
        const error = new Error('connection refused');
        error.requestSent = false;
        throw error;
      },
    },
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'ZAPIER_DISPATCH_UNAVAILABLE');
        assert.equal(error.retryable, true);
        assert.equal(error.outcomeUnknown, false);
        throw error;
      }
    },
    /ZAPIER_DISPATCH_UNAVAILABLE/,
  );
});

test('post-send timeout is unknown outcome and never blindly retryable because Zapier Catch Hooks are not idempotent', async () => {
  const adapter = createZapierActionAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [zapierManifest()] }),
    credentialBroker: broker(),
    receiptPort: receiptPort(),
    transport: {
      async postHook() {
        const error = new Error('timeout after write');
        error.requestSent = true;
        throw error;
      },
    },
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'ZAPIER_OUTCOME_UNKNOWN');
        assert.equal(error.retryable, false);
        assert.equal(error.outcomeUnknown, true);
        throw error;
      }
    },
    /ZAPIER_OUTCOME_UNKNOWN/,
  );
});

test('Zapier rate limit is retryable only when the hook explicitly rejects the request', async () => {
  const adapter = createZapierActionAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [zapierManifest()] }),
    credentialBroker: broker(),
    receiptPort: receiptPort(),
    transport: {
      async postHook() {
        return { status: 429, headers: { 'retry-after': '20' }, body: {} };
      },
    },
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'ZAPIER_RATE_LIMITED');
        assert.equal(error.retryable, true);
        assert.equal(error.outcomeUnknown, false);
        assert.equal(error.retryAfterSeconds, 20);
        throw error;
      }
    },
    /ZAPIER_RATE_LIMITED/,
  );
});

test('missing or retired Catch Hook is terminal and does not wait for callback evidence', async () => {
  let waited = false;
  for (const status of [404, 410]) {
    const adapter = createZapierActionAdapter({
      capabilityRegistry: createCapabilityRegistry({ providers: [zapierManifest()] }),
      credentialBroker: broker(),
      receiptPort: receiptPort({
        async waitForReceipt() { waited = true; },
      }),
      transport: {
        async postHook() { return { status, headers: {}, body: {} }; },
      },
      config: config(),
    });

    await assert.rejects(
      async () => {
        try {
          await adapter.execute(job());
        } catch (error) {
          assert.equal(error.code, 'ZAPIER_HOOK_UNAVAILABLE');
          assert.equal(error.retryable, false);
          throw error;
        }
      },
      /ZAPIER_HOOK_UNAVAILABLE/,
    );
  }
  assert.equal(waited, false);
});

test('accepted Hook without callback receipt remains unknown and is never redispatched automatically', async () => {
  let dispatches = 0;
  const adapter = createZapierActionAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [zapierManifest()] }),
    credentialBroker: broker(),
    receiptPort: receiptPort({
      async waitForReceipt() {
        const error = new Error('receipt wait timeout');
        error.code = 'RECEIPT_TIMEOUT';
        throw error;
      },
    }),
    transport: {
      async postHook() {
        dispatches += 1;
        return { status: 200, headers: {}, body: {} };
      },
    },
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'ZAPIER_RECEIPT_PENDING');
        assert.equal(error.retryable, false);
        assert.equal(error.outcomeUnknown, true);
        throw error;
      }
    },
    /ZAPIER_RECEIPT_PENDING/,
  );
  assert.equal(dispatches, 1);
});

test('failed Zap callback is recorded as a terminal workflow failure', async () => {
  const adapter = createZapierActionAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [zapierManifest()] }),
    credentialBroker: broker(),
    receiptPort: receiptPort({
      async waitForReceipt(input) {
        return {
          receiptRef: input.receiptRef,
          providerId: 'zapier',
          executionJobId: 'job-zap-101',
          intentId: 'intent-zap-101',
          actionKey: 'supplier.notify-approved',
          status: 'failed',
          evidence: { errorCode: 'DESTINATION_REJECTED' },
        };
      },
    }),
    transport: {
      async postHook() { return { status: 200, headers: {}, body: {} }; },
    },
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'ZAPIER_WORKFLOW_FAILED');
        assert.equal(error.retryable, false);
        assert.equal(error.receiptRef, 'receipt:job-zap-101');
        throw error;
      }
    },
    /ZAPIER_WORKFLOW_FAILED/,
  );
});

test('mismatched callback identity fails verification instead of accepting unrelated Zap evidence', async () => {
  const adapter = createZapierActionAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [zapierManifest()] }),
    credentialBroker: broker(),
    receiptPort: receiptPort({
      async waitForReceipt(input) {
        return {
          receiptRef: input.receiptRef,
          providerId: 'zapier',
          executionJobId: 'different-job',
          intentId: 'intent-zap-101',
          actionKey: 'supplier.notify-approved',
          status: 'succeeded',
          evidence: {},
        };
      },
    }),
    transport: {
      async postHook() { return { status: 200, headers: {}, body: {} }; },
    },
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'ZAPIER_VERIFICATION_FAILED');
        assert.equal(error.retryable, false);
        throw error;
      }
    },
    /ZAPIER_VERIFICATION_FAILED/,
  );
});

test('malformed Zap action job is rejected before callback issuance, credentials or transport', async () => {
  let touched = false;
  const credentialBroker = createCredentialBroker({
    async resolveCredential() { touched = true; throw new Error('should not resolve'); },
  });
  const adapter = createZapierActionAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [zapierManifest()] }),
    credentialBroker,
    receiptPort: receiptPort({
      async issue() { touched = true; },
      async waitForReceipt() { touched = true; },
    }),
    transport: {
      async postHook() { touched = true; },
    },
    config: config(),
  });

  await assert.rejects(
    () => adapter.execute(job({ payload: { actionKey: '', input: {} } })),
    /ZAPIER_JOB_INVALID:actionKey/,
  );
  assert.equal(touched, false);
});
