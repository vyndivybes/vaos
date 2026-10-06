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

test('submitIntent calls the durable RPC with server-only credentials', async () => {
  const fake = fakeFetch([{ body: { outcome: 'CREATED', intent: { status: 'AWAIT_APPROVAL' }, approvalId: 'apr-1' } }]);
  const store = createSupabaseControlStore({
    url: 'https://example.supabase.co',
    publishableKey: 'pub-key',
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
  assert.equal(fake.calls[0].url, 'https://example.supabase.co/rest/v1/rpc/vaos_submit_intent');
  assert.equal(fake.calls[0].options.headers.apikey, 'pub-key');
  assert.equal(fake.calls[0].body.p_server_key, 'server-secret');
  assert.equal(fake.calls[0].body.p_idempotency_key, 'qa:capa:024');
});

test('snapshot and approval decision use dedicated RPCs', async () => {
  const fake = fakeFetch([
    { body: { mode: 'DURABLE_POSTGRES', approvals: [], events: [], metrics: {} } },
    { body: { outcome: 'DECIDED', approval: { id: 'apr-1', status: 'APPROVED' } } },
  ]);
  const store = createSupabaseControlStore({
    url: 'https://example.supabase.co',
    publishableKey: 'pub-key',
    serverSecret: 'server-secret',
    fetchImpl: fake.fetchImpl,
  });

  const snapshot = await store.snapshot();
  const decision = await store.decideApproval('apr-1', {
    decision: 'APPROVED',
    decidedBy: 'founder@example.com',
  });

  assert.equal(snapshot.mode, 'DURABLE_POSTGRES');
  assert.equal(decision.approval.status, 'APPROVED');
  assert.match(fake.calls[0].url, /vaos_control_snapshot$/);
  assert.match(fake.calls[1].url, /vaos_decide_approval$/);
});

test('RPC failures are surfaced without leaking response internals', async () => {
  const fake = fakeFetch([{ ok: false, status: 401, body: { message: 'database internals here' } }]);
  const store = createSupabaseControlStore({
    url: 'https://example.supabase.co',
    publishableKey: 'pub-key',
    serverSecret: 'server-secret',
    fetchImpl: fake.fetchImpl,
  });

  await assert.rejects(() => store.snapshot(), /SUPABASE_RPC_FAILED:401/);
});
