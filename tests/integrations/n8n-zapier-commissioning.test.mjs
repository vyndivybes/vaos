import test from 'node:test';
import assert from 'node:assert/strict';
import { createN8nWorkflowAdapter } from '../../integrations/n8n/workflow-adapter.mjs';
import { createZapierActionAdapter } from '../../integrations/zapier/action-adapter.mjs';

const capabilityRegistry = { resolve: () => null };
const credentialBroker = { withCredential: async () => { throw Error('credential must not be requested'); } };

test('n8n rejects unqualified routing before reading credentials or dispatch', async () => {
  let requests = 0;
  const adapter = createN8nWorkflowAdapter({
    capabilityRegistry,
    credentialBroker,
    config: {
      webhookUrl: 'https://example.com/webhook/qualification',
      apiBaseUrl: 'https://example.com/api/v1',
      webhookSecretBindingRef: 'test-webhook',
      apiSecretBindingRef: 'test-api',
      webhookAuthHeader: 'X-Webhook-Secret',
    },
    transport: {
      invokeWebhook: async () => { requests++; return {}; },
      readExecution: async () => { requests++; return {}; },
    },
  });
  await assert.rejects(adapter.execute({
    id: 'synthetic-job', intentId: 'synthetic-intent', actionType: 'QUALIFY', payload: { synthetic: true },
  }), { code: 'N8N_PROVIDER_NOT_QUALIFIED' });
  assert.equal(requests, 0);
});

test('Zapier rejects unqualified routing before issuing callback or dispatch', async () => {
  let effects = 0;
  const adapter = createZapierActionAdapter({
    capabilityRegistry,
    credentialBroker,
    config: { hookSecretBindingRef: 'test-hook' },
    receiptPort: {
      issue: async () => { effects++; return {}; },
      waitForReceipt: async () => { effects++; return {}; },
    },
    transport: { postHook: async () => { effects++; return {}; } },
  });
  await assert.rejects(adapter.execute({
    id: 'synthetic-job', intentId: 'synthetic-intent', actionType: 'QUALIFY',
    payload: { actionKey: 'synthetic', input: { synthetic: true } },
  }), { code: 'ZAPIER_PROVIDER_NOT_QUALIFIED' });
  assert.equal(effects, 0);
});
