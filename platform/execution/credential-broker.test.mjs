import test from 'node:test';
import assert from 'node:assert/strict';
import { createCredentialBroker } from './credential-broker.mjs';

function request(overrides = {}) {
  return {
    bindingRef: 'secret-binding:n8n:prod',
    providerId: 'n8n',
    capability: 'workflow.orchestrate',
    executionJobId: 'job-42',
    intentId: 'intent-42',
    ...overrides,
  };
}

test('broker resolves a scoped credential only inside the execution callback', async () => {
  const calls = [];
  const broker = createCredentialBroker({
    async resolveCredential(input) {
      calls.push({ operation: 'resolve', input });
      return {
        kind: 'bearer',
        value: 'super-secret-token',
        expiresAt: '2030-01-01T00:00:00.000Z',
        providerId: 'n8n',
        capabilities: ['workflow.orchestrate'],
      };
    },
    now: () => new Date('2026-10-08T00:00:00.000Z'),
  });

  const result = await broker.withCredential(request(), async (credential) => {
    calls.push({ operation: 'execute', kind: credential.kind, value: credential.value });
    return { ok: true, providerStatus: 202 };
  });

  assert.deepEqual(result, { ok: true, providerStatus: 202 });
  assert.equal(calls[0].input.bindingRef, 'secret-binding:n8n:prod');
  assert.deepEqual(calls.map((item) => item.operation), ['resolve', 'execute']);
  assert.equal('resolveCredential' in broker, false);
});

test('audit metadata never contains credential material', async () => {
  const audit = [];
  const broker = createCredentialBroker({
    async resolveCredential() {
      return {
        kind: 'api-key',
        value: 'TOP-SECRET',
        providerId: 'n8n',
        capabilities: ['workflow.orchestrate'],
      };
    },
    async recordAudit(event) { audit.push(event); },
  });

  await broker.withCredential(request(), async () => ({ ok: true }));

  assert.equal(audit.length, 2);
  assert.deepEqual(audit.map((event) => event.eventType), ['CREDENTIAL.ACQUIRED', 'CREDENTIAL.RELEASED']);
  assert.equal(JSON.stringify(audit).includes('TOP-SECRET'), false);
  assert.equal(audit[0].bindingRef, 'secret-binding:n8n:prod');
  assert.equal(audit[0].executionJobId, 'job-42');
});

test('broker rejects an expired credential before provider execution', async () => {
  let executed = false;
  const broker = createCredentialBroker({
    async resolveCredential() {
      return {
        kind: 'bearer',
        value: 'expired',
        expiresAt: '2026-10-07T23:59:59.000Z',
        providerId: 'n8n',
        capabilities: ['workflow.orchestrate'],
      };
    },
    now: () => new Date('2026-10-08T00:00:00.000Z'),
  });

  await assert.rejects(
    () => broker.withCredential(request(), async () => { executed = true; }),
    /CREDENTIAL_EXPIRED/,
  );
  assert.equal(executed, false);
});

test('broker fails closed on provider or capability scope mismatch', async () => {
  const broker = createCredentialBroker({
    async resolveCredential() {
      return {
        kind: 'api-key',
        value: 'scoped-secret',
        providerId: 'paperwork',
        capabilities: ['document.extract'],
      };
    },
  });

  await assert.rejects(
    () => broker.withCredential(request(), async () => ({ ok: true })),
    /CREDENTIAL_SCOPE_MISMATCH/,
  );
});

test('broker rejects malformed execution context before resolving a credential', async () => {
  let resolved = false;
  const broker = createCredentialBroker({
    async resolveCredential() { resolved = true; },
  });

  await assert.rejects(
    () => broker.withCredential(request({ executionJobId: '' }), async () => ({ ok: true })),
    /CREDENTIAL_REQUEST_INVALID:executionJobId/,
  );
  assert.equal(resolved, false);
});

test('broker records release even when provider execution fails', async () => {
  const audit = [];
  const broker = createCredentialBroker({
    async resolveCredential() {
      return {
        kind: 'api-key',
        value: 'secret',
        providerId: 'n8n',
        capabilities: ['workflow.orchestrate'],
      };
    },
    async recordAudit(event) { audit.push(event); },
  });

  await assert.rejects(
    () => broker.withCredential(request(), async () => { throw new Error('PROVIDER_FAILED'); }),
    /PROVIDER_FAILED/,
  );
  assert.deepEqual(audit.map((event) => event.eventType), ['CREDENTIAL.ACQUIRED', 'CREDENTIAL.RELEASED']);
  assert.equal(audit[1].outcome, 'failed');
});
