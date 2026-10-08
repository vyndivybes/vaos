import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken, SESSION_COOKIE } from '../lib/auth.mjs';
import { createMissionsHandler } from './missions.mjs';
import { DEFAULT_API_HANDLERS } from '../cloudflare-worker.mjs';

function response() {
  const result = { code: 200, headers: {}, body: null };
  const res = {
    setHeader(name, value) { result.headers[name] = value; return res; },
    status(code) { result.code = code; return res; },
    json(body) { result.body = body; return res; },
  };
  return { res, result };
}

function req(method, { body, url = 'https://vaos.example/api/missions', authenticated = true } = {}) {
  return {
    method,
    url,
    body,
    headers: {
      cookie: authenticated ? `${SESSION_COOKIE}=${createSessionToken('kaaviyam1519@gmail.com')}` : '',
    },
    env: {},
  };
}

function fixture() {
  const calls = [];
  const service = {
    async planMission(input) {
      calls.push(['plan', input]);
      return { outcome: 'CREATED', mission: { id: input.missionId } };
    },
    async dispatchMission(missionId, opts) {
      calls.push(['dispatch', missionId, opts]);
      return { outcome: 'DISPATCHED', count: 2 };
    },
    async snapshot(id) {
      calls.push(['snapshot', id]);
      return { mission: { id }, workPackages: [] };
    },
  };
  return { calls, handler: createMissionsHandler({ getService: () => service }) };
}

test('Cloudflare registers the authenticated missions route', () => {
  assert.equal(DEFAULT_API_HANDLERS['/api/missions'], undefined === 1 ? null : DEFAULT_API_HANDLERS['/api/missions']);
  assert.equal(typeof DEFAULT_API_HANDLERS['/api/missions'], 'function');
});

test('GET returns only a validated mission snapshot to an authorized session', async () => {
  const f = fixture();
  const { res, result } = response();
  await f.handler(req('GET', { url: 'https://vaos.example/api/missions?missionId=mission-001' }), res);
  assert.equal(result.code, 200);
  assert.equal(result.body.data.mission.id, 'mission-001');
  assert.deepEqual(f.calls, [['snapshot', 'mission-001']]);
  assert.equal(result.headers['Cache-Control'], 'no-store');
});

test('mission creation validates its catalog jobs, rejects extra spoofed actor fields, and uses orchestrator', async () => {
  const f = fixture();
  const { res, result } = response();
  await f.handler(req('POST', {
    body: {
      operation: 'PLAN',
      missionId: 'mission-001',
      objective: 'Assess engineering change readiness',
      requestedJobs: ['ENGINEERING.ASSESS_CHANGE', 'RELEASE.ASSESS_GATE'],
      createdByAgentId: 'security',
    },
  }), res);
  assert.equal(result.code, 422);
  assert.deepEqual(f.calls, []);

  const r = response();
  await f.handler(req('POST', { body: {
    operation: 'PLAN',
    missionId: 'mission-001',
    objective: 'Assess engineering change readiness',
    requestedJobs: ['ENGINEERING.ASSESS_CHANGE', 'RELEASE.ASSESS_GATE'],
  } }), r.res);
  assert.equal(r.result.code, 201);
  assert.equal(f.calls[0][1].missionId, 'mission-001');
  assert.deepEqual(f.calls[0][1].requestedJobs, ['ENGINEERING.ASSESS_CHANGE', 'RELEASE.ASSESS_GATE']);
});

test('dispatch is operator-controlled and limited to bounded batches', async () => {
  const f = fixture();
  const r = response();
  await f.handler(req('POST', { body: { operation: 'DISPATCH', missionId: 'mission-001', maxAssignments: 4 } }), r.res);
  assert.equal(r.result.code, 200);
  assert.deepEqual(f.calls, [['dispatch', 'mission-001', { maxAssignments: 4 }]]);

  const full = response();
  await f.handler(req('POST', { body: { operation: 'DISPATCH', missionId: 'mission-001', maxAssignments: 16 } }), full.res);
  assert.equal(full.result.code, 200);
  assert.deepEqual(f.calls[1], ['dispatch', 'mission-001', { maxAssignments: 16 }]);

  const invalid = response();
  await f.handler(req('POST', { body: { operation: 'DISPATCH', missionId: 'mission-001', maxAssignments: 17 } }), invalid.res);
  assert.equal(invalid.result.code, 422);
  assert.equal(f.calls.length, 2);
});

test('agent impersonation and unknown mission operations are denied', async () => {
  const f = fixture();
  for (const body of [
    { operation: 'TRANSITION', missionId: 'mission-001', byAgentId: 'qa', outcome: 'VERIFY' },
    { operation: 'CLOSE', missionId: 'mission-001' },
    { operation: 'DISPATCH', missionId: 'mission-001', byAgentId: 'release' },
    { operation: 'PLAN', missionId: 'mission-001', objective: 'x', requestedJobs: ['ENGINEERING.BASELINE_CHANGE', 'INVALID.JOB'] },
  ]) {
    const r = response();
    await f.handler(req('POST', { body }), r.res);
    assert.equal(r.result.code, 422);
  }
  assert.equal(f.calls.length, 0);
});

test('unauthenticated mission access is refused before any durable side effect', async () => {
  const f = fixture();
  for (const method of ['GET', 'POST']) {
    const r = response();
    await f.handler(req(method, { authenticated: false, body: { operation: 'DISPATCH', missionId: 'mission-001' } }), r.res);
    assert.equal(r.result.code, 401);
  }
  assert.deepEqual(f.calls, []);
});


test('authenticated RUN_SAFE uses bounded consumer and independent review, without agent impersonation fields', async () => {
  const called = [];
  const handler = createMissionsHandler({
    getService: () => ({}),
    createConsumer: () => ({
      async consume(missionId, options) {
        called.push(['consume', missionId, options.maxHandoffs]);
        return { submitted: 1, unsupported: 0 };
      },
      async review(missionId, options) {
        called.push(['review', missionId, options.maxHandoffs]);
        return { verified: 1, returned: 0 };
      },
    }),
  });
  const yes = response();
  await handler(req('POST', { body: {
    operation: 'RUN_SAFE',
    missionId: 'mission-001',
    maxHandoffs: 2,
  } }), yes.res);
  assert.equal(yes.result.code, 200);
  assert.equal(yes.result.body.data.consumed.submitted, 1);
  assert.deepEqual(called, [
    ['consume', 'mission-001', 2],
    ['review', 'mission-001', 2],
  ]);

  const no = response();
  await handler(req('POST', { body: {
    operation: 'RUN_SAFE', missionId: 'mission-001',
    maxHandoffs: 2, byAgentId: 'security',
  } }), no.res);
  assert.equal(no.result.code, 422);
  assert.equal(called.length, 2);
});
