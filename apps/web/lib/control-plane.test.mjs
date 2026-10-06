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
