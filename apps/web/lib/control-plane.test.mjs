import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken, SESSION_COOKIE } from './auth.mjs';
import { getControlPlanePayload } from './control-plane.mjs';

const service = {
  async snapshot() {
    return {
      mode: 'DURABLE_POSTGRES',
      agents: [
        { id: 'qa', name: 'QA / CAPA Agent', domain: 'Quality', status: 'approval', confidence: 91, task: 'Awaiting approval', capabilities: { 'QA.OPEN_CAPA': 4 } },
      ],
      approvals: [
        { id: 'apr-1', status: 'PENDING', agentId: 'qa', actionType: 'QA.OPEN_CAPA', risk: 'medium', authority: 4, reason: 'Recurring NCR' },
      ],
      events: [
        { id: 'evt-1', sequence: 1, type: 'GOVERNANCE.APPROVAL_REQUIRED', source: 'qa', payload: { actionType: 'QA.OPEN_CAPA' } },
      ],
      metrics: { pendingApprovals: 1, eventCount: 1, intentCount: 1 },
    };
  },
};

test('control plane rejects requests without a signed session', async () => {
  assert.equal(await getControlPlanePayload('', service), null);
  assert.equal(await getControlPlanePayload(`${SESSION_COOKIE}=tampered`, service), null);
});

test('control plane returns identity and durable model for an authorised signed session', async () => {
  const token = createSessionToken('shyamsundhar1982@gmail.com');
  const payload = await getControlPlanePayload(`${SESSION_COOKIE}=${encodeURIComponent(token)}`, service);
  assert.equal(payload.session.email, 'shyamsundhar1982@gmail.com');
  assert.equal(payload.model.modules[0].id, 'command');
  assert.equal(payload.model.runtimeMode, 'DURABLE_POSTGRES');
  assert.equal(payload.model.approvals.length, 1);
});


test('control plane carries durable domain records through the authenticated workspace model', async () => {
  const token = createSessionToken('shyamsundhar1982@gmail.com');
  const domainService = {
    async snapshot() {
      return {
        mode: 'DURABLE_POSTGRES',
        agents: [],
        approvals: [],
        events: [],
        metrics: { pendingApprovals: 0, eventCount: 0, intentCount: 1 },
        domains: {
          qaCapa: [{
    id: 'domain-1',
    resourceId: 'CAPA-024',
    status: 'OPEN',
    recordedAt: '2026-10-07T00:10:00.000Z',
    intentId: 'intent-1',
    intentStatus: 'EXECUTED',
    intentRisk: 'medium',
    approvalId: 'approval-1',
    approvalStatus: 'APPROVED',
    decidedBy: 'founder@example.com',
    decidedAt: '2026-10-07T00:05:00.000Z',
    executionJobId: 'job-1',
    executionStatus: 'SUCCEEDED',
    attemptCount: 2,
    maxAttempts: 5,
    adapterId: 'supabase.qa-capa.v1',
    evidenceCount: 1,
    evidenceVerifiedAt: '2026-10-07T00:11:00.000Z',
    latestEventType: 'EVIDENCE.VERIFIED',
    latestEventAt: '2026-10-07T00:11:00.000Z',
  }],
          engineering: [],
          projectRisk: [],
        },
      };
    },
  };

  const payload = await getControlPlanePayload(`${SESSION_COOKIE}=${encodeURIComponent(token)}`, domainService);
  assert.equal(payload.model.domainWorkspaces['qa-capa'].records.length, 1);
  assert.equal(payload.model.domainWorkspaces['qa-capa'].records[0].resourceId, 'CAPA-024');
});
