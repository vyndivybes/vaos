import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseControlStore } from './supabase-store.mjs';

function fakeFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    const next = responses.shift();
    return {
      ok: next.ok ?? true,
      status: next.status ?? 200,
      async json() { return next.body; },
    };
  };
  return { fetchImpl, calls };
}

test('submitIntent uses the service-role Edge bridge with only the VAOS server credential', async () => {
  const fake = fakeFetch([{ body: { outcome: 'CREATED', intent: { status: 'AWAIT_APPROVAL' }, approvalId: 'apr-1' } }]);
  const store = createSupabaseControlStore({
    url: 'https://example.supabase.co',
    serverSecret: 'server-secret',
    fetchImpl: fake.fetchImpl,
  });

  const result = await store.submitIntent({
    idempotencyKey: 'qa:capa:024',
    requestHash: 'hash-1',
    agentId: 'qa',
    actionType: 'QA.OPEN_CAPA',
    risk: 'medium',
    reason: 'Recurring NCR',
    payload: { capaId: 'CAPA-024' },
    authority: 4,
    result: { status: 'AWAIT_APPROVAL', effectExecuted: false },
    eventType: 'GOVERNANCE.APPROVAL_REQUIRED',
  });

  assert.equal(result.outcome, 'CREATED');
  assert.equal(fake.calls[0].url, 'https://example.supabase.co/functions/v1/vaos-control');
  assert.equal(fake.calls[0].options.headers['x-vaos-server-key'], 'server-secret');
  assert.equal(fake.calls[0].options.headers.apikey, undefined);
  assert.equal(fake.calls[0].body.operation, 'submitIntent');
  assert.equal(fake.calls[0].body.payload.idempotencyKey, 'qa:capa:024');
});

test('snapshot and approval decision use the same authenticated Edge bridge', async () => {
  const fake = fakeFetch([
    { body: { mode: 'DURABLE_POSTGRES', approvals: [], events: [], metrics: {} } },
    { body: { outcome: 'DECIDED', approval: { id: 'apr-1', status: 'APPROVED' } } },
  ]);
  const store = createSupabaseControlStore({
    url: 'https://example.supabase.co',
    serverSecret: 'server-secret',
    fetchImpl: fake.fetchImpl,
  });

  const snapshot = await store.snapshot();
  const decision = await store.decideApproval('apr-1', { decision: 'APPROVED', decidedBy: 'founder@example.com' });

  assert.equal(snapshot.mode, 'DURABLE_POSTGRES');
  assert.equal(decision.approval.status, 'APPROVED');
  assert.equal(fake.calls[0].body.operation, 'snapshot');
  assert.equal(fake.calls[1].body.operation, 'decideApproval');
  assert.equal(fake.calls[1].body.payload.approvalId, 'apr-1');
});

test('Edge bridge failures are surfaced without leaking response internals', async () => {
  const fake = fakeFetch([{ ok: false, status: 401, body: { message: 'internal detail' } }]);
  const store = createSupabaseControlStore({
    url: 'https://example.supabase.co',
    serverSecret: 'server-secret',
    fetchImpl: fake.fetchImpl,
  });
  await assert.rejects(() => store.snapshot(), /SUPABASE_EDGE_FAILED:401/);
});
