import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken, SESSION_COOKIE } from '../lib/auth.mjs';
import { createLangGraphHandler } from './langgraph.mjs';
import { createCloudflareApp, DEFAULT_API_HANDLERS } from '../cloudflare-worker.mjs';

const cookie = () => `${SESSION_COOKIE}=${createSessionToken('kaaviyam1519@gmail.com')}`;
function response() {
  const result = { code: 200, body: null, headers: {} };
  return { result, res: { setHeader(k, v) { result.headers[k] = v; },
    status(code) { result.code = code; return this; }, json(body) { result.body = body; } } };
}
function fixture() {
  const calls = [];
  return { calls, handler: createLangGraphHandler({ getControlService: () => ({}), getMissionService: () => ({}),
    loadSupervisor: async () => { calls.push('load'); return {
      createAgentSupervisor: opts => ({ async run(input) { calls.push(input); return { status: 'OBSERVED', enabled: opts.isControlEnabled() }; } }),
    }; } }) };
}
const req = (method, props = {}) => ({ method, url: 'https://vaos.example/api/langgraph',
  headers: { cookie: cookie(), origin: 'https://vaos.example' }, env: {}, ...props });

test('registered Worker route refuses unauthenticated access before loading graph or data', async () => {
  assert.equal(typeof DEFAULT_API_HANDLERS['/api/langgraph'], 'function');
  const f = fixture(), r = response();
  await f.handler(req('GET', { headers: {} }), r.res);
  assert.equal(r.result.code, 401); assert.deepEqual(f.calls, []);
});

test('fleet and mission monitor reads are authenticated and uncached', async () => {
  const f = fixture();
  for (const url of ['https://vaos.example/api/langgraph', 'https://vaos.example/api/langgraph?missionId=mission-001']) {
    const r = response(); await f.handler(req('GET', { url }), r.res);
    assert.equal(r.result.code, 200); assert.equal(r.result.headers['Cache-Control'], 'no-store');
    assert.equal(r.result.body.data.enabled, false);
  }
  assert.equal(f.calls[1].operation, 'MONITOR'); assert.equal(f.calls[3].missionId, 'mission-001');
});

test('control needs exact commissioning flag, valid session and same origin', async () => {
  const f = fixture(), body = { operation: 'RUN_SAFE', missionId: 'mission-001' };
  const disabled = response(); await f.handler(req('POST', { body }), disabled.res);
  assert.equal(disabled.result.code, 409); assert.deepEqual(f.calls, []);
  const foreign = response(); await f.handler(req('POST', { body, headers: { cookie: cookie(), origin: 'https://evil.example' },
    env: { VAOS_LANGGRAPH_CONTROL: 'read-only-v1' } }), foreign.res);
  assert.equal(foreign.result.code, 403); assert.deepEqual(f.calls, []);
  const enabled = response(); await f.handler(req('POST', { body, env: { VAOS_LANGGRAPH_CONTROL: 'read-only-v1' } }), enabled.res);
  assert.equal(enabled.result.code, 200); assert.equal(enabled.result.body.data.enabled, true);
});

test('impersonation, writes, unbounded controls and malformed input are refused', async () => {
  const f = fixture();
  for (const body of [null, [], '{bad', { operation: 'ACTIVATE', missionId: 'mission-001' },
    { operation: 'RUN_SAFE', missionId: 'mission-001', byAgentId: 'orchestrator' },
    { operation: 'RUN_SAFE', missionId: 'mission-001', maxHandoffs: 8 },
    { operation: 'RUN_SAFE', missionId: '../escape' }, { operation: 'RUN_SAFE' }]) {
    const r = response(); await f.handler(req('POST', { body, env: { VAOS_LANGGRAPH_CONTROL: 'read-only-v1' } }), r.res);
    assert.equal(r.result.code, 422);
  }
  const invalidGet = response();
  await f.handler(req('GET', { url: 'https://vaos.example/api/langgraph?missionId=mission-001&operation=RUN_SAFE' }), invalidGet.res);
  assert.equal(invalidGet.result.code, 422); assert.deepEqual(f.calls, []);
});

test('source failure returns HOLD without credentials in errors', async () => {
  const handler = createLangGraphHandler({ getControlService: () => { throw new Error('secret:do-not-expose'); } });
  const r = response(); await handler(req('GET'), r.res);
  assert.equal(r.result.code, 503); assert.equal(JSON.stringify(r.result).includes('do-not-expose'), false);
});

test('real supervisor executes through Cloudflare adapter using persisted-service fixture', async () => {
  const handler = createLangGraphHandler({
    getControlService: () => ({ async snapshot() { return { agents: [{ id: 'project', name: 'Project' }],
      workforce: { digitalEmployees: [{ id: 'project', status: 'RESTRICTED', qualificationLevel: 2 }] }, approvals: [] }; } }),
    getMissionService: () => ({ async snapshot() { throw new Error('Fleet monitor must not read mission'); } }),
  });
  const app = createCloudflareApp({ apiHandlers: { '/api/langgraph': handler }, assetFetcher: () => new Response('', { status: 404 }), runtimeEnv: {} });
  const res = await app.fetch(new Request('https://vaos.example/api/langgraph', { headers: { cookie: cookie() } }));
  assert.equal(res.status, 200);
  const body = await res.json(); assert.equal(body.data.engine, 'langgraph');
  assert.equal(body.data.monitor.agents[0].qualified, false);
  assert.equal(body.data.monitor.controls.runSafeEnabled, false);
});
