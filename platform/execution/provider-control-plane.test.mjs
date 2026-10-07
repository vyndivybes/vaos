import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderControlPlane } from './provider-control-plane.mjs';

function manifest(overrides = {}) {
  return {
    schemaVersion: 'vaos.provider.v2',
    providerId: 'n8n',
    displayName: 'n8n',
    adapterVersion: '1.0.0',
    capabilities: ['workflow.orchestrate'],
    deploymentModes: ['self-hosted'],
    enabled: true,
    qualification: {
      state: 'evaluation',
      qualifiedCapabilities: [],
      evidenceRefs: [],
      validUntil: null,
    },
    routing: {
      dataClassifications: ['public', 'internal', 'confidential'],
      riskClasses: ['low', 'medium', 'high'],
      licensingAllowed: true,
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
      rollbackMethod: 'disable-provider',
    },
    operations: {
      retentionClass: 'provider-default',
      dataResidency: ['IN'],
      costControl: 'bounded',
    },
    ...overrides,
  };
}

test('provider is not routable until capability qualification is explicitly granted', async () => {
  const audit = [];
  const cp = createProviderControlPlane({
    providers: [manifest()],
    recordAudit: async event => audit.push(event),
    now: () => new Date('2026-10-08T00:00:00.000Z'),
  });

  assert.equal(cp.resolve('workflow.orchestrate', {
    dataClassification: 'internal',
    riskClass: 'medium',
  }), null);

  await cp.transitionQualification({
    providerId: 'n8n',
    to: 'qualified',
    capability: 'workflow.orchestrate',
    evidenceRefs: ['qualification:q1'],
    authorityRef: 'approval:123',
    reason: 'test-qualified',
  });

  const resolved = cp.resolve('workflow.orchestrate', {
    dataClassification: 'internal',
    riskClass: 'medium',
  });
  assert.equal(resolved.providerId, 'n8n');
  assert.equal(audit.at(-1).type, 'PROVIDER.QUALIFICATION.TRANSITIONED');
  assert.equal(audit.at(-1).secret, undefined);
});

test('disable and capability kill switch both fail closed immediately', async () => {
  const cp = createProviderControlPlane({
    providers: [manifest({
      qualification: {
        state: 'qualified',
        qualifiedCapabilities: ['workflow.orchestrate'],
        evidenceRefs: ['q'],
        validUntil: null,
      },
    })],
  });

  assert.equal(cp.resolve('workflow.orchestrate', { dataClassification: 'internal', riskClass: 'low' }).providerId, 'n8n');

  await cp.setCapabilityEnabled({ providerId: 'n8n', capability: 'workflow.orchestrate', enabled: false, authorityRef: 'approval:1', reason: 'incident' });
  assert.equal(cp.resolve('workflow.orchestrate', { dataClassification: 'internal', riskClass: 'low' }), null);

  await cp.setCapabilityEnabled({ providerId: 'n8n', capability: 'workflow.orchestrate', enabled: true, authorityRef: 'approval:2', reason: 'restore' });
  await cp.setProviderEnabled({ providerId: 'n8n', enabled: false, authorityRef: 'approval:3', reason: 'emergency-stop' });
  assert.equal(cp.resolve('workflow.orchestrate', { dataClassification: 'internal', riskClass: 'low' }), null);
});

test('routing enforces data classification, risk class, licensing and health freshness', async () => {
  const cp = createProviderControlPlane({
    providers: [manifest({
      qualification: {
        state: 'qualified',
        qualifiedCapabilities: ['workflow.orchestrate'],
        evidenceRefs: ['q'],
        validUntil: null,
      },
      routing: {
        dataClassifications: ['public', 'internal'],
        riskClasses: ['low', 'medium'],
        licensingAllowed: true,
      },
    })],
    now: () => new Date('2026-10-08T00:00:00.000Z'),
    healthTtlMs: 60_000,
  });

  await cp.recordHealth({ providerId: 'n8n', status: 'healthy', checkedAt: '2026-10-08T00:00:00.000Z', evidenceRef: 'health:1' });

  assert.equal(cp.resolve('workflow.orchestrate', { dataClassification: 'confidential', riskClass: 'medium' }), null);
  assert.equal(cp.resolve('workflow.orchestrate', { dataClassification: 'internal', riskClass: 'high' }), null);
  assert.equal(cp.resolve('workflow.orchestrate', { dataClassification: 'internal', riskClass: 'medium' }).providerId, 'n8n');

  await cp.recordHealth({ providerId: 'n8n', status: 'unhealthy', checkedAt: '2026-10-08T00:00:00.000Z', evidenceRef: 'health:2' });
  assert.equal(cp.resolve('workflow.orchestrate', { dataClassification: 'internal', riskClass: 'medium' }), null);
});

test('restricted provider can be scoped to selected capabilities without losing history', async () => {
  const cp = createProviderControlPlane({
    providers: [manifest({
      capabilities: ['workflow.orchestrate', 'integration.saas'],
      qualification: {
        state: 'qualified',
        qualifiedCapabilities: ['workflow.orchestrate', 'integration.saas'],
        evidenceRefs: ['q'],
        validUntil: null,
      },
    })],
  });

  await cp.transitionQualification({
    providerId: 'n8n',
    to: 'restricted',
    restrictedCapabilities: ['integration.saas'],
    evidenceRefs: ['incident:44'],
    authorityRef: 'approval:44',
    reason: 'saas-path-incident',
  });

  assert.equal(cp.resolve('integration.saas', { dataClassification: 'internal', riskClass: 'low' }), null);
  assert.equal(cp.resolve('workflow.orchestrate', { dataClassification: 'internal', riskClass: 'low' }).providerId, 'n8n');

  const history = cp.history('n8n');
  assert.equal(history.length > 0, true);
  assert.equal(history.at(-1).to, 'restricted');
});

test('qualification transition rules reject invalid jumps and require evidence for qualification', async () => {
  const cp = createProviderControlPlane({ providers: [manifest()] });

  await assert.rejects(
    () => cp.transitionQualification({
      providerId: 'n8n',
      to: 'qualified',
      capability: 'workflow.orchestrate',
      evidenceRefs: [],
      authorityRef: 'approval:1',
      reason: 'missing-evidence',
    }),
    /PROVIDER_QUALIFICATION_EVIDENCE_REQUIRED/,
  );

  await assert.rejects(
    () => cp.transitionQualification({
      providerId: 'n8n',
      to: 'candidate',
      evidenceRefs: ['x'],
      authorityRef: 'approval:2',
      reason: 'invalid-backwards-transition',
    }),
    /PROVIDER_QUALIFICATION_TRANSITION_INVALID/,
  );
});

test('expired qualification is not routable', () => {
  const cp = createProviderControlPlane({
    providers: [manifest({
      qualification: {
        state: 'qualified',
        qualifiedCapabilities: ['workflow.orchestrate'],
        evidenceRefs: ['q'],
        validUntil: '2026-10-07T23:59:59.000Z',
      },
    })],
    now: () => new Date('2026-10-08T00:00:00.000Z'),
  });

  assert.equal(cp.resolve('workflow.orchestrate', { dataClassification: 'internal', riskClass: 'low' }), null);
});

test('deterministic routing respects explicit provider order when multiple providers are eligible', () => {
  const qualified = {
    state: 'qualified',
    qualifiedCapabilities: ['workflow.orchestrate'],
    evidenceRefs: ['q'],
    validUntil: null,
  };
  const cp = createProviderControlPlane({
    providers: [
      manifest({ providerId: 'n8n', qualification: qualified }),
      manifest({ providerId: 'activepieces', displayName: 'Activepieces', qualification: qualified }),
    ],
  });

  assert.equal(
    cp.resolve('workflow.orchestrate', {
      dataClassification: 'internal',
      riskClass: 'low',
      preferredProviderIds: ['n8n', 'activepieces'],
    }).providerId,
    'n8n',
  );
  assert.equal(
    cp.resolve('workflow.orchestrate', {
      dataClassification: 'internal',
      riskClass: 'low',
    }).providerId,
    'activepieces',
  );
});
