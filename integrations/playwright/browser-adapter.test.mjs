import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createPlaywrightBrowserAdapter } from './browser-adapter.mjs';

function playwrightManifest(overrides = {}) {
  return {
    schemaVersion: 'vaos.provider.v1',
    providerId: 'playwright',
    displayName: 'Playwright',
    capabilities: ['browser.automate'],
    deploymentModes: ['self-hosted'],
    qualification: {
      state: 'qualified',
      qualifiedCapabilities: ['browser.automate'],
      evidenceRefs: ['qualification:playwright:browser:test'],
    },
    security: {
      secretBinding: 'required',
      dataEgress: 'controlled',
      authModes: ['session'],
      callbackVerification: 'none',
    },
    execution: {
      idempotency: 'not-supported',
      retrySemantics: 'conditional',
      verificationStrategy: 'artifact-hash',
      healthProbe: 'required',
    },
    ...overrides,
  };
}

function broker() {
  return createCredentialBroker({
    async resolveCredential() {
      return {
        kind: 'browser-session',
        value: 'opaque-session-material',
        providerId: 'playwright',
        capabilities: ['browser.automate'],
      };
    },
  });
}

function job(overrides = {}) {
  return {
    id: 'job-browser-101',
    intentId: 'intent-browser-101',
    actionType: 'BROWSER.RUN_TASK',
    payload: {
      taskKey: 'supplier.portal.status-read',
      targetUrl: 'https://supplier.example.com/orders/PO-42',
      input: { purchaseOrder: 'PO-42' },
      credentialBindingRef: 'secret:browser:supplier-portal',
      effectClass: 'read',
    },
    ...overrides,
  };
}

function config(overrides = {}) {
  return {
    allowedOrigins: ['https://supplier.example.com'],
    timeoutMs: 45_000,
    allowDownloads: false,
    requireTrace: true,
    ...overrides,
  };
}

function successResult(overrides = {}) {
  return {
    status: 'succeeded',
    finalUrl: 'https://supplier.example.com/orders/PO-42',
    output: { supplierStatus: 'accepted' },
    verification: {
      verified: true,
      evidenceRef: 'evidence:browser:job-browser-101',
      traceRef: 'artifact:trace:job-browser-101',
      screenshotRef: 'artifact:screenshot:job-browser-101',
      artifactHash: 'sha256:abc123',
    },
    ...overrides,
  };
}

test('Playwright adapter runs an allow-listed browser task with scoped session material and sealed evidence refs', async () => {
  const calls = [];
  const adapter = createPlaywrightBrowserAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [playwrightManifest()] }),
    credentialBroker: broker(),
    browserExecutor: {
      async runTask(request) {
        calls.push(request);
        return successResult();
      },
    },
    config: config(),
  });

  const result = await adapter.execute(job());

  assert.equal(result.adapterId, 'playwright.browser.v1');
  assert.equal(result.providerId, 'playwright');
  assert.equal(result.capability, 'browser.automate');
  assert.equal(result.effect.resourceId, 'evidence:browser:job-browser-101');
  assert.equal(result.effect.state, 'SUCCEEDED');
  assert.deepEqual(result.effect.output, { supplierStatus: 'accepted' });
  assert.equal(result.verification.verified, true);
  assert.equal(result.verification.traceRef, 'artifact:trace:job-browser-101');
  assert.equal(result.verification.artifactHash, 'sha256:abc123');

  const request = calls[0];
  assert.equal(request.executionJobId, 'job-browser-101');
  assert.equal(request.intentId, 'intent-browser-101');
  assert.equal(request.targetUrl, 'https://supplier.example.com/orders/PO-42');
  assert.equal(request.effectClass, 'read');
  assert.equal(request.session.kind, 'browser-session');
  assert.equal(request.session.value, 'opaque-session-material');
  assert.equal(request.allowDownloads, false);
  assert.equal(request.trace, true);
  assert.equal(JSON.stringify(result).includes('opaque-session-material'), false);
});

test('browser target outside the governed origin allow-list fails before credentials or browser execution', async () => {
  let touched = false;
  const credentialBroker = createCredentialBroker({
    async resolveCredential() { touched = true; throw new Error('should not resolve'); },
  });
  const adapter = createPlaywrightBrowserAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [playwrightManifest()] }),
    credentialBroker,
    browserExecutor: {
      async runTask() { touched = true; },
    },
    config: config(),
  });

  await assert.rejects(
    () => adapter.execute(job({
      payload: { ...job().payload, targetUrl: 'https://evil.example.net/steal' },
    })),
    /PLAYWRIGHT_TARGET_NOT_ALLOWED/,
  );
  assert.equal(touched, false);
});

test('browser target rejects non-http schemes before execution', async () => {
  let touched = false;
  const adapter = createPlaywrightBrowserAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [playwrightManifest()] }),
    credentialBroker: broker(),
    browserExecutor: {
      async runTask() { touched = true; },
    },
    config: config(),
  });

  await assert.rejects(
    () => adapter.execute(job({
      payload: { ...job().payload, targetUrl: 'file:///etc/passwd' },
    })),
    /PLAYWRIGHT_TARGET_INVALID/,
  );
  assert.equal(touched, false);
});

test('Playwright adapter fails closed when browser automation capability is not qualified', async () => {
  let touched = false;
  const adapter = createPlaywrightBrowserAdapter({
    capabilityRegistry: createCapabilityRegistry({
      providers: [playwrightManifest({ qualification: { state: 'evaluation', qualifiedCapabilities: [] } })],
    }),
    credentialBroker: broker(),
    browserExecutor: {
      async runTask() { touched = true; },
    },
    config: config(),
  });

  await assert.rejects(() => adapter.execute(job()), /PLAYWRIGHT_PROVIDER_NOT_QUALIFIED/);
  assert.equal(touched, false);
});

test('state-changing browser timeout after task start is unknown outcome and never blindly retryable', async () => {
  const adapter = createPlaywrightBrowserAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [playwrightManifest()] }),
    credentialBroker: broker(),
    browserExecutor: {
      async runTask() {
        const error = new Error('browser worker timeout');
        error.started = true;
        throw error;
      },
    },
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job({
          payload: { ...job().payload, taskKey: 'supplier.portal.submit-confirmation', effectClass: 'write' },
        }));
      } catch (error) {
        assert.equal(error.code, 'PLAYWRIGHT_OUTCOME_UNKNOWN');
        assert.equal(error.retryable, false);
        assert.equal(error.outcomeUnknown, true);
        throw error;
      }
    },
    /PLAYWRIGHT_OUTCOME_UNKNOWN/,
  );
});

test('browser worker failure before navigation starts is retryable', async () => {
  const adapter = createPlaywrightBrowserAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [playwrightManifest()] }),
    credentialBroker: broker(),
    browserExecutor: {
      async runTask() {
        const error = new Error('browser unavailable');
        error.started = false;
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
        assert.equal(error.code, 'PLAYWRIGHT_EXECUTOR_UNAVAILABLE');
        assert.equal(error.retryable, true);
        assert.equal(error.outcomeUnknown, false);
        throw error;
      }
    },
    /PLAYWRIGHT_EXECUTOR_UNAVAILABLE/,
  );
});

test('successful browser result must remain on an allow-listed origin', async () => {
  const adapter = createPlaywrightBrowserAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [playwrightManifest()] }),
    credentialBroker: broker(),
    browserExecutor: {
      async runTask() {
        return successResult({ finalUrl: 'https://attacker.example.net/done' });
      },
    },
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'PLAYWRIGHT_VERIFICATION_FAILED');
        assert.equal(error.retryable, false);
        throw error;
      }
    },
    /PLAYWRIGHT_VERIFICATION_FAILED/,
  );
});

test('browser result without trace evidence fails when trace is required', async () => {
  const result = successResult();
  delete result.verification.traceRef;
  const adapter = createPlaywrightBrowserAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [playwrightManifest()] }),
    credentialBroker: broker(),
    browserExecutor: {
      async runTask() { return result; },
    },
    config: config({ requireTrace: true }),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'PLAYWRIGHT_VERIFICATION_FAILED');
        throw error;
      }
    },
    /PLAYWRIGHT_VERIFICATION_FAILED/,
  );
});

test('download evidence is rejected when downloads are disabled', async () => {
  const adapter = createPlaywrightBrowserAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [playwrightManifest()] }),
    credentialBroker: broker(),
    browserExecutor: {
      async runTask() {
        return successResult({
          downloads: [{ artifactRef: 'artifact:download:invoice.pdf', artifactHash: 'sha256:def456' }],
        });
      },
    },
    config: config({ allowDownloads: false }),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'PLAYWRIGHT_DOWNLOAD_NOT_ALLOWED');
        assert.equal(error.retryable, false);
        throw error;
      }
    },
    /PLAYWRIGHT_DOWNLOAD_NOT_ALLOWED/,
  );
});

test('browser session material and storage state never appear in returned effect or evidence', async () => {
  const adapter = createPlaywrightBrowserAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [playwrightManifest()] }),
    credentialBroker: broker(),
    browserExecutor: {
      async runTask() {
        return successResult({
          sessionState: { cookies: [{ name: 'session', value: 'secret-cookie' }] },
        });
      },
    },
    config: config(),
  });

  const result = await adapter.execute(job());
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('secret-cookie'), false);
  assert.equal(serialized.includes('opaque-session-material'), false);
  assert.equal('sessionState' in result.effect, false);
  assert.equal('sessionState' in result.verification, false);
});

test('malformed browser job is rejected before credential or executor access', async () => {
  let touched = false;
  const credentialBroker = createCredentialBroker({
    async resolveCredential() { touched = true; throw new Error('should not resolve'); },
  });
  const adapter = createPlaywrightBrowserAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [playwrightManifest()] }),
    credentialBroker,
    browserExecutor: {
      async runTask() { touched = true; },
    },
    config: config(),
  });

  await assert.rejects(
    () => adapter.execute(job({
      payload: { ...job().payload, taskKey: '', targetUrl: 'https://supplier.example.com' },
    })),
    /PLAYWRIGHT_JOB_INVALID:taskKey/,
  );
  assert.equal(touched, false);
});
