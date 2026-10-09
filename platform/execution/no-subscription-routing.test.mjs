import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoSubscriptionRoutingPolicy } from './no-subscription-routing.mjs';
import { createProviderRuntime } from './provider-runtime.mjs';

const policy = createNoSubscriptionRoutingPolicy();

test('Activepieces is the only no-subscription general workflow option', () => {
  const original = { dataClassification: 'internal', riskClass: 'low', preferredProviderIds: ['n8n', 'activepieces'] };
  const result = policy.apply('workflow.orchestrate', original);
  assert.deepEqual(result.allowedProviderIds, ['activepieces']);
  assert.deepEqual(result.preferredProviderIds, ['activepieces']);
  assert.deepEqual(original.preferredProviderIds, ['n8n', 'activepieces']);
});

test('caller allow-list cannot bypass the no-subscription boundary', () => {
  const result = policy.apply('workflow.orchestrate', { allowedProviderIds: ['n8n'], preferredProviderIds: ['n8n'] });
  assert.deepEqual(result.allowedProviderIds, []);
});

test('Zapier SaaS routing fails closed until a free alternative is qualified', () => {
  const result = policy.apply('integration.saas', { allowedProviderIds: ['zapier'], preferredProviderIds: ['zapier'] });
  assert.deepEqual(result.allowedProviderIds, []);
});

test('Windmill is preferred for governed code execution', () => {
  const result = policy.apply('code.execute', { dataClassification: 'internal' });
  assert.deepEqual(result.allowedProviderIds, ['windmill']);
});

test('unrelated capabilities retain existing policy and constraints', () => {
  const constraints = { deniedProviderIds: ['unqualified-provider'], riskClass: 'high' };
  assert.deepEqual(policy.apply('document.sign', constraints), constraints);
});

test('policy treats frozen inputs without mutation', () => {
  const constraints = Object.freeze({ allowedProviderIds: Object.freeze(['n8n', 'activepieces']) });
  const result = policy.apply('workflow.orchestrate', constraints);
  assert.deepEqual(result.allowedProviderIds, ['activepieces']);
});

test('governed provider runtime applies the no-subscription policy before resolution', async () => {
  let selected;
  const runtime = createProviderRuntime({
    controlPlane: { resolve(capability, constraints) { selected = { capability, constraints }; return null; } },
    routingPolicy: policy,
  });
  await assert.rejects(
    runtime.execute({
      capability: 'workflow.orchestrate',
      dataClassification: 'internal',
      riskClass: 'low',
      preferredProviderIds: ['n8n'],
      executionJob: { id: 'job-free-1', intentId: 'intent-free-1' },
    }),
    /PROVIDER_RUNTIME_NOT_AVAILABLE/,
  );
  assert.equal(selected.capability, 'workflow.orchestrate');
  assert.deepEqual(selected.constraints.allowedProviderIds, ['activepieces']);
  assert.deepEqual(selected.constraints.preferredProviderIds, ['activepieces']);
});

test('runtime fails closed when free integration.saas provider does not exist', async () => {
  let selected;
  const runtime = createProviderRuntime({
    controlPlane: { resolve(_capability, constraints) { selected = constraints; return null; } },
    routingPolicy: policy,
  });
  await assert.rejects(
    runtime.execute({
      capability: 'integration.saas', dataClassification: 'internal', riskClass: 'low',
      preferredProviderIds: ['zapier'],
      executionJob: { id: 'job-free-2', intentId: 'intent-free-2' },
    }),
    /PROVIDER_RUNTIME_NOT_AVAILABLE/,
  );
  assert.deepEqual(selected.allowedProviderIds, []);
});
