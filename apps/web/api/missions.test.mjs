import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken, SESSION_COOKIE } from '../lib/auth.mjs';
import { createMissionsHandler, planFounderInstruction } from './missions.mjs';
import { routeJob } from '../../../platform/runtime/vaos-eight-operating-model.mjs';
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

function req(method, { body, url = 'https://vaos.example/api/missions', authenticated = true, email = 'kaaviyam1519@gmail.com', origin = 'https://vaos.example' } = {}) {
  return {
    method,
    url,
    body,
    headers: {
      cookie: authenticated ? `${SESSION_COOKIE}=${createSessionToken(email)}` : '',
      origin,
      'content-type': 'application/json',
    },
    env: { VAOS_FOUNDER_INBOX_CONTROL: 'record-only-v1' },
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


const founder = 'shyamsundhar1982@gmail.com';
const sourceId = '52a8a9bd-3706-4d05-8941-045bfb64c661';

test('founder startup instruction routes recorded evidence into all fifteen departmental job families, with Orchestrator coordinating', async () => {
  const instruction = 'Prepare Vāyú Shastr company startup and launch. Coordinate all sixteen employees.';
  const callLog = [];
  let assigned = 0;
  let planned;
  const handler = createMissionsHandler({
    getInboxStore: () => ({
      async list(input) {
        assert.deepEqual(input, { agentId: 'orchestrator', actorEmail: founder });
        return { messages: [{ messageId: sourceId, recipientAgentId: 'orchestrator',
          kind: 'INSTRUCTION', status: 'RECORDED_NOT_ROUTED', instruction }] };
      },
    }),
    getService: () => ({
      async planMission(input) {
        planned = input; callLog.push('PLAN');
        return { outcome: 'CREATED', mission: { id: input.missionId } };
      },
      async dispatchMission(id, options) {
        assert.equal(id, planned.missionId);
        assert.deepEqual(options, { maxAssignments: 8 });
        callLog.push('DISPATCH');
        const count = Math.min(8, 15 - assigned);
        assigned += count;
        return { outcome: count ? 'DISPATCHED' : 'NO_READY_WORK', count };
      },
      async snapshot(id) {
        assert.equal(id, planned.missionId);
        return { mission: { id, status: 'ACTIVE' },
          workPackages: Array.from({ length: 15 }, (_, i) => ({ id: 'wp-' + i })),
          handoffs: Array.from({ length: assigned }, (_, i) => ({ id: 'h-' + i })) };
      },
    }),
  });
  const result = response();
  await handler(req('POST', { email: founder,
    body: { operation: 'ROUTE_FOUNDER_INSTRUCTION', messageId: sourceId } }), result.res);
  assert.equal(result.result.code, 200);
  assert.equal(result.result.body.data.missionId, 'founder-52a8a9bd37064d058941045bfb64c661');
  assert.equal(result.result.body.data.assignedWorkPackages, 15);
  assert.equal(result.result.body.data.businessEffectsExecuted, false);
  assert.deepEqual(callLog, ['PLAN', 'DISPATCH', 'DISPATCH']);
  const roles = new Set(planned.requestedJobs.map(job => routeJob(job).ownerAgentId));
  assert.equal(planned.requestedJobs.length, 15);
  assert.equal(roles.size, 15);
  assert.equal(roles.has('orchestrator'), false);
  assert.equal(planned.objective, instruction);
  for (const job of planned.requestedJobs) {
    const route = routeJob(job);
    assert.equal(route.humanApprovalRequired, false);
    assert.ok(['ANALYSE', 'PREPARE'].includes(route.executionMode));
  }
});

test('founder mission selection stays read-only and deterministic for targeted requests', () => {
  const mission = planFounderInstruction(sourceId, 'Review supplier procurement and stock availability');
  assert.equal(mission.missionId, 'founder-52a8a9bd37064d058941045bfb64c661');
  assert.ok(mission.requestedJobs.includes('PROCUREMENT.OBSERVE_SHORTAGE'));
  assert.ok(mission.requestedJobs.includes('INVENTORY.OBSERVE_STOCK'));
  assert.ok(mission.requestedJobs.includes('PROJECT.TRACK_DEPENDENCY'));
  assert.ok(!mission.requestedJobs.includes('PROCUREMENT.CREATE_PO'));
  assert.ok(!mission.requestedJobs.includes('INVENTORY.ISSUE_MATERIAL'));
  assert.deepEqual(planFounderInstruction(sourceId, mission.objective), mission);
});

test('founder routing rejects unrecorded instructions, spoofed input and non-founder users before mission creation', async () => {
  const calls = [];
  const handler = createMissionsHandler({
    getInboxStore: () => ({ async list() { calls.push('READ'); return { messages: [] }; } }),
    getService: () => ({ async planMission() { calls.push('PLAN'); } }),
  });
  for (const [options, expected] of [
    [{ body: { operation: 'ROUTE_FOUNDER_INSTRUCTION', messageId: sourceId } }, 403],
    [{ email: founder, origin: 'https://evil.example', body: { operation: 'ROUTE_FOUNDER_INSTRUCTION', messageId: sourceId } }, 403],
    [{ email: founder, body: { operation: 'ROUTE_FOUNDER_INSTRUCTION', messageId: sourceId, requestedJobs: ['FINANCE.PREPARE_PAYMENT'] } }, 422],
    [{ email: founder, body: { operation: 'ROUTE_FOUNDER_INSTRUCTION', messageId: sourceId } }, 409],
  ]) {
    const r = response();
    await handler(req('POST', options), r.res);
    assert.equal(r.result.code, expected);
  }
  assert.deepEqual(calls, ['READ']);
});

test('replayed founder mission reports persisted assignments without duplicating handoffs', async () => {
  const calls = [];
  const handler = createMissionsHandler({
    getInboxStore: () => ({ async list() {
      return { messages: [{ messageId: sourceId, recipientAgentId: 'orchestrator',
        kind: 'INSTRUCTION', status: 'RECORDED_NOT_ROUTED',
        instruction: 'Review engineering configuration records' }] };
    } }),
    getService: () => ({
      async planMission() { calls.push('PLAN'); return { outcome: 'REPLAY' }; },
      async dispatchMission() { calls.push('DISPATCH'); return { outcome: 'NO_READY_WORK', count: 0 }; },
      async snapshot(id) { return { mission: { id, status: 'ACTIVE' },
        workPackages: [{ id: 'wp-1' }, { id: 'wp-2' }, { id: 'wp-3' }],
        handoffs: [{ id: 'h-1' }, { id: 'h-2' }] }; },
    }),
  });
  const r = response();
  await handler(req('POST', { email: founder,
    body: { operation: 'ROUTE_FOUNDER_INSTRUCTION', messageId: sourceId } }), r.res);
  assert.equal(r.result.code, 200);
  assert.equal(r.result.body.data.assignedWorkPackages, 2);
  assert.equal(r.result.body.data.status, 'PARTIALLY_ASSIGNED');
  assert.deepEqual(calls, ['PLAN', 'DISPATCH']);
});


test('founder may read persisted mission results using the existing mission GET with no writes',async()=>{
 const calls=[];
 const handler=createMissionsHandler({
  getService:()=>({
   async snapshot(id){calls.push(['snapshot',id]);return {mission:{id,status:'ACTIVE'},workPackages:[{id:'wp-1'}],handoffs:[]};},
   async getWorkEvidence(id){calls.push(['evidence',id]);return null;}
  }),
  getFounderResults:async ({snapshot,getWorkEvidence})=>{
   assert.equal(snapshot.mission.id,'mission-001');
   assert.equal(await getWorkEvidence('handoff-version:hand-1:2'),null);
   return {schemaVersion:'VAOS_FOUNDER_MISSION_RESULTS_V1',missionId:'mission-001',
    readOnly:true,actionAuthorized:false,summary:{total:1},jobs:[]};
  },
 });
 const responsePair=response();
 await handler(req('GET',{email:founder,url:'https://vaos.example/api/missions?missionId=mission-001&view=results'}),responsePair.res);
 assert.equal(responsePair.result.code,200);
 assert.equal(responsePair.result.body.data.readOnly,true);
 assert.equal(responsePair.result.body.data.actionAuthorized,false);
 assert.equal(responsePair.result.body.data.snapshot.mission.id,'mission-001');
 assert.deepEqual(calls,[['snapshot','mission-001'],['evidence','handoff-version:hand-1:2']]);
 assert.equal(responsePair.result.headers['Cache-Control'],'no-store');
});
test('saved results are founder-only; unknown query keys and views fail closed',async()=>{
 const f=fixture();
 for(const options of [
  {url:'https://vaos.example/api/missions?missionId=mission-001&view=results',email:'kaaviyam1519@gmail.com',expected:403},
  {url:'https://vaos.example/api/missions?missionId=mission-001&view=results',authenticated:false,expected:401},
  {url:'https://vaos.example/api/missions?missionId=mission-001&view=execute',email:founder,expected:422},
  {url:'https://vaos.example/api/missions?missionId=mission-001&view=results&agentId=finance',email:founder,expected:422},
 ]){
  const x=response();
  await f.handler(req('GET',options),x.res);
  assert.equal(x.result.code,options.expected);
 }
 assert.deepEqual(f.calls,[]);
});
test('evidence read failures are redacted and cannot be presented as completed departments',async()=>{
 const h=createMissionsHandler({
  getService:()=>({async snapshot(id){return {mission:{id},workPackages:[],handoffs:[]};},async getWorkEvidence(){throw Error('private-secret');}}),
  getFounderResults:async ({getWorkEvidence})=>getWorkEvidence('vaos-evidence:missing'),
 });
 const v=response();
 await h(req('GET',{email:founder,url:'https://vaos.example/api/missions?missionId=mission-001&view=results'}),v.res);
 assert.equal(v.result.code,503);
 assert.doesNotMatch(JSON.stringify(v.result.body),/private-secret/);
});
