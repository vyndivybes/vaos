import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from './capability-registry.mjs';

function provider(overrides = {}) {
  return {
    schemaVersion: 'vaos.provider.v1',
    providerId: 'n8n',
    displayName: 'n8n',
    capabilities: ['workflow.orchestrate'],
    deploymentModes: ['self-hosted'],
    qualification: {
      state: 'qualified',
      qualifiedCapabilities: ['workflow.orchestrate'],
      evidenceRefs: ['qualification:n8n:workflow:v1'],
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

test('registry registers and resolves only explicitly qualified capabilities', () => {
  const registry = createCapabilityRegistry({ providers: [provider()] });
  assert.equal(registry.has('n8n'), true);
  assert.equal(registry.supports('workflow.orchestrate'), true);
  assert.equal(registry.resolve('workflow.orchestrate').providerId, 'n8n');
  assert.equal(registry.resolve('document.extract'), null);
});

test('registry rejects duplicate provider identities', () => {
  assert.throws(
    () => createCapabilityRegistry({ providers: [provider(), provider()] }),
    /CAPABILITY_PROVIDER_DUPLICATE:n8n/,
  );
});

test('candidate provider is not eligible until the requested capability is qualified', () => {
  const registry = createCapabilityRegistry({
    providers: [provider({ qualification: { state: 'candidate', qualifiedCapabilities: [] } })],
  });
  assert.equal(registry.supports('workflow.orchestrate'), false);
  assert.equal(registry.resolve('workflow.orchestrate'), null);
});

test('provider qualification is capability-specific and fails closed', () => {
  const registry = createCapabilityRegistry({
    providers: [provider({
      capabilities: ['workflow.orchestrate', 'integration.saas'],
      qualification: {
        state: 'qualified',
        qualifiedCapabilities: ['workflow.orchestrate'],
      },
    })],
  });
  assert.equal(registry.supports('workflow.orchestrate'), true);
  assert.equal(registry.supports('integration.saas'), false);
  assert.throws(
    () => registry.require('integration.saas'),
    /CAPABILITY_PROVIDER_NOT_AVAILABLE:integration.saas/,
  );
});

test('eligibility filters by deployment mode and data-egress policy', () => {
  const external = provider({
    providerId: 'zapier',
    displayName: 'Zapier',
    capabilities: ['integration.saas'],
    deploymentModes: ['managed-saas'],
    qualification: { state: 'qualified', qualifiedCapabilities: ['integration.saas'] },
    security: {
      secretBinding: 'required',
      dataEgress: 'external',
      authModes: ['oauth2'],
      callbackVerification: 'provider-specific',
    },
  });
  const registry = createCapabilityRegistry({ providers: [external] });

  assert.equal(registry.resolve('integration.saas', { deploymentMode: 'self-hosted' }), null);
  assert.equal(registry.resolve('integration.saas', { allowExternalDataEgress: false }), null);
  assert.equal(registry.resolve('integration.saas', { deploymentMode: 'managed-saas' }).providerId, 'zapier');
});

test('provider selection is deterministic by provider identity', () => {
  const registry = createCapabilityRegistry({
    providers: [
      provider({ providerId: 'windmill', displayName: 'Windmill' }),
      provider({ providerId: 'n8n', displayName: 'n8n' }),
    ],
  });
  assert.equal(registry.resolve('workflow.orchestrate').providerId, 'n8n');
  assert.deepEqual(registry.eligible('workflow.orchestrate').map((item) => item.providerId), ['n8n', 'windmill']);
});

test('registered provider identity and manifest are immutable snapshots', () => {
  const source = provider();
  const registry = createCapabilityRegistry({ providers: [source] });
  source.providerId = 'tampered';
  source.capabilities.push('document.extract');

  const stored = registry.get('n8n');
  assert.equal(stored.providerId, 'n8n');
  assert.deepEqual(stored.capabilities, ['workflow.orchestrate']);
  assert.equal(Object.isFrozen(stored), true);
  assert.equal(Object.isFrozen(stored.qualification), true);
});

test('invalid provider manifests are rejected at the boundary', () => {
  assert.throws(
    () => createCapabilityRegistry({ providers: [provider({ providerId: 'N8N' })] }),
    /CAPABILITY_PROVIDER_INVALID:providerId/,
  );
  assert.throws(
    () => createCapabilityRegistry({ providers: [provider({ capabilities: [] })] }),
    /CAPABILITY_PROVIDER_INVALID:capabilities/,
  );
});
