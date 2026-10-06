import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken, SESSION_COOKIE } from './auth.mjs';
import { getControlPlanePayload } from './control-plane.mjs';

test('control plane rejects requests without a signed session', () => {
  assert.equal(getControlPlanePayload(''), null);
  assert.equal(getControlPlanePayload(`${SESSION_COOKIE}=tampered`), null);
});

test('control plane returns identity and model for an authorised signed session', () => {
  const token = createSessionToken('shyamsundhar1982@gmail.com');
  const payload = getControlPlanePayload(`${SESSION_COOKIE}=${encodeURIComponent(token)}`);
  assert.equal(payload.session.email, 'shyamsundhar1982@gmail.com');
  assert.equal(payload.model.modules[0].id, 'command');
  assert.ok(payload.model.agents.length >= 6);
  assert.ok(payload.model.approvals.length >= 2);
});
