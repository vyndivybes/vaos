import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createN8nWorkflowAdapter } from './workflow-adapter.mjs';

function n8nManifest(overrides = {}) {
  return {
    schemaVersion: 'vaos.provider.v1',
    providerId: 'n8n',
    displayName: 'n8n',
    capabilities: ['workflow.orchestrate'],
    deploymentModes: ['self-hosted'],
    qualification: {
      state: 'qualified',
      qualifiedCapabilities: ['workflow.orchestrate'],
      evidenceRefs: ['qualification:n8n:test'],
    },
    security: {
      secretBinding: 'required',
      dataEgress: 'controlled',
      authModes: ['api-key'],
      callbackVerification: 'hmac',
    },
    execution: {
      idempotency: 'hybrid',
      retrySemantics: 'conditional',
      verificationStrategy: 'provider-readback',
      healthProbe: 'required',
    },
    ...overrides,
  };
}

function broker() {
  return createCredentialBroker({
    async resolveCredential(request) {
      if (request.bindingRef === 'secret:n8n:webhook') {
        return {
          kind: 'header',
          value: 'webhook-secret',
          providerId: 'n8n',
          capabilities: ['workflow.orchestrate'],
        };
      }
      if (request.bindingRef === 'secret:n8n:api') {
        return {
          kind: 'api-key',
          value: 'api-secret',
          providerId: 'n8n',
          capabilities: ['workflow.orchestrate'],
        };
      }
      throw new Error('UNKNOWN_BINDING');
    },
  });
}

function job(overrides = {}) {
  return {
    id: 'job-101',
    intentId: 'intent-101',
    actionType: 'AUTOMATION.RUN_WORKFLOW',
    payload: { workflowKey: 'supplier-onboarding', supplierId: 'SUP-9' },
    ...overrides,
  };
}

function config(overrides = {}) {
  return {
    webhookUrl: 'https://n8n.internal.example/webhook/vaos',
    apiBaseUrl: 'https://n8n.internal.example/api/v1',
    webhookSecretBindingRef: 'secret:n8n:webhook',
    apiSecretBindingRef: 'secret:n8n:api',
    webhookAuthHeader: 'X-VAOS-N8N-KEY',
    timeoutMs: 10_000,
    ...overrides,
  };
}

test('n8n adapter dispatches a governed workflow and verifies success by execution readback', async () => {
  const calls = [];
  const transport = {
    async invokeWebhook(request) {
      calls.push({ operation: 'invoke', request });
      return { status: 202, body: { executionId: '9842' } };
    },
    async readExecution(request) {
      calls.push({ operation: 'read', request });
      return { status: 200, body: { id: '9842', status: 'success', finished: true } };
    },
  };

  const adapter = createN8nWorkflowAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [n8nManifest()] }),
    credentialBroker: broker(),
    transport,
    config: config(),
  });

  const result = await adapter.execute(job());

  assert.equal(result.adapterId, 'n8n.workflow.v1');
  assert.equal(result.providerId, 'n8n');
  assert.equal(result.capability, 'workflow.orchestrate');
  assert.equal(result.effect.resourceId, '9842');
  assert.equal(result.effect.state, 'SUCCEEDED');
  assert.equal(result.verification.verified, true);
  assert.equal(result.verification.evidenceSource, 'n8n.api.execution-readback');

  const invoke = calls.find((call) => call.operation === 'invoke').request;
  assert.equal(invoke.headers['X-VAOS-N8N-KEY'], 'webhook-secret');
  assert.equal(invoke.headers['X-VAOS-IDEMPOTENCY-KEY'], 'job-101');
  assert.equal(invoke.body.executionJobId, 'job-101');
  assert.equal(invoke.body.intentId, 'intent-101');
  assert.equal(invoke.body.idempotencyKey, 'job-101');

  const read = calls.find((call) => call.operation === 'read').request;
  assert.equal(read.url, 'https://n8n.internal.example/api/v1/executions/9842');
  assert.equal(read.headers['X-N8N-API-KEY'], 'api-secret');

  assert.equal(JSON.stringify(result).includes('webhook-secret'), false);
  assert.equal(JSON.stringify(result).includes('api-secret'), false);
});

test('n8n adapter fails closed when n8n is not qualified for workflow orchestration', async () => {
  let touched = false;
  const transport = {
    async invokeWebhook() { touched = true; },
    async readExecution() { touched = true; },
  };
  const capabilityRegistry = createCapabilityRegistry({
    providers: [n8nManifest({ qualification: { state: 'evaluation', qualifiedCapabilities: [] } })],
  });
  const adapter = createN8nWorkflowAdapter({
    capabilityRegistry,
    credentialBroker: broker(),
    transport,
    config: config(),
  });

  await assert.rejects(
    () => adapter.execute(job()),
    /N8N_PROVIDER_NOT_QUALIFIED/,
  );
  assert.equal(touched, false);
});

test('n8n adapter uses the execution job identity as a stable idempotency key', async () => {
  const keys = [];
  const transport = {
    async invokeWebhook(request) {
      keys.push(request.headers['X-VAOS-IDEMPOTENCY-KEY']);
      return { status: 202, body: { executionId: `exec-${keys.length}` } };
    },
    async readExecution(request) {
      return {
        status: 200,
        body: {
          id: request.url.split('/').at(-1),
          status: 'success',
          finished: true,
        },
      };
    },
  };
  const adapter = createN8nWorkflowAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [n8nManifest()] }),
    credentialBroker: broker(),
    transport,
    config: config(),
  });

  await adapter.execute(job());
  await adapter.execute(job());

  assert.deepEqual(keys, ['job-101', 'job-101']);
});

test('post-send timeout is classified as unknown outcome and is never blindly retryable', async () => {
  const transport = {
    async invokeWebhook() {
      const error = new Error('socket timeout');
      error.code = 'ETIMEDOUT';
      error.requestSent = true;
      throw error;
    },
    async readExecution() { throw new Error('should not read without an execution id'); },
  };
  const adapter = createN8nWorkflowAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [n8nManifest()] }),
    credentialBroker: broker(),
    transport,
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'N8N_OUTCOME_UNKNOWN');
        assert.equal(error.retryable, false);
        assert.equal(error.outcomeUnknown, true);
        throw error;
      }
    },
    /N8N_OUTCOME_UNKNOWN/,
  );
});

test('pre-send connection failure is retryable because the workflow was not dispatched', async () => {
  const transport = {
    async invokeWebhook() {
      const error = new Error('connection refused');
      error.code = 'ECONNREFUSED';
      error.requestSent = false;
      throw error;
    },
    async readExecution() { throw new Error('should not read'); },
  };
  const adapter = createN8nWorkflowAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [n8nManifest()] }),
    credentialBroker: broker(),
    transport,
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'N8N_DISPATCH_UNAVAILABLE');
        assert.equal(error.retryable, true);
        assert.equal(error.outcomeUnknown, false);
        throw error;
      }
    },
    /N8N_DISPATCH_UNAVAILABLE/,
  );
});

test('n8n authentication failure is terminal and does not attempt verification readback', async () => {
  let reads = 0;
  const transport = {
    async invokeWebhook() { return { status: 401, body: { message: 'unauthorized' } }; },
    async readExecution() { reads += 1; },
  };
  const adapter = createN8nWorkflowAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [n8nManifest()] }),
    credentialBroker: broker(),
    transport,
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'N8N_AUTHENTICATION_FAILED');
        assert.equal(error.retryable, false);
        throw error;
      }
    },
    /N8N_AUTHENTICATION_FAILED/,
  );
  assert.equal(reads, 0);
});

test('n8n server error after dispatch is treated as unknown outcome', async () => {
  const transport = {
    async invokeWebhook() { return { status: 500, body: { message: 'workflow failed' } }; },
    async readExecution() { throw new Error('should not read without execution id'); },
  };
  const adapter = createN8nWorkflowAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [n8nManifest()] }),
    credentialBroker: broker(),
    transport,
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'N8N_OUTCOME_UNKNOWN');
        assert.equal(error.retryable, false);
        assert.equal(error.outcomeUnknown, true);
        throw error;
      }
    },
    /N8N_OUTCOME_UNKNOWN/,
  );
});

test('n8n readback mismatch fails verification instead of fabricating success', async () => {
  const transport = {
    async invokeWebhook() { return { status: 202, body: { executionId: '9842' } }; },
    async readExecution() { return { status: 200, body: { id: '9842', status: 'error', finished: true } }; },
  };
  const adapter = createN8nWorkflowAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [n8nManifest()] }),
    credentialBroker: broker(),
    transport,
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'N8N_VERIFICATION_FAILED');
        assert.equal(error.retryable, false);
        throw error;
      }
    },
    /N8N_VERIFICATION_FAILED/,
  );
});

test('verification transport failure never causes the workflow to be dispatched a second time', async () => {
  let invokes = 0;
  const transport = {
    async invokeWebhook() {
      invokes += 1;
      return { status: 202, body: { executionId: '9842' } };
    },
    async readExecution() {
      const error = new Error('readback unavailable');
      error.code = 'ETIMEDOUT';
      throw error;
    },
  };
  const adapter = createN8nWorkflowAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [n8nManifest()] }),
    credentialBroker: broker(),
    transport,
    config: config(),
  });

  await assert.rejects(
    async () => {
      try {
        await adapter.execute(job());
      } catch (error) {
        assert.equal(error.code, 'N8N_VERIFICATION_UNAVAILABLE');
        assert.equal(error.retryable, false);
        assert.equal(error.outcomeUnknown, true);
        throw error;
      }
    },
    /N8N_VERIFICATION_UNAVAILABLE/,
  );
  assert.equal(invokes, 1);
});

test('malformed governed job is rejected before credentials or transport are touched', async () => {
  let touched = false;
  const credentialBroker = createCredentialBroker({
    async resolveCredential() {
      touched = true;
      throw new Error('should not resolve');
    },
  });
  const transport = {
    async invokeWebhook() { touched = true; },
    async readExecution() { touched = true; },
  };
  const adapter = createN8nWorkflowAdapter({
    capabilityRegistry: createCapabilityRegistry({ providers: [n8nManifest()] }),
    credentialBroker,
    transport,
    config: config(),
  });

  await assert.rejects(
    () => adapter.execute(job({ intentId: '' })),
    /N8N_JOB_INVALID:intentId/,
  );
  assert.equal(touched, false);
});
