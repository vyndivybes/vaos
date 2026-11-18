import test from 'node:test';
import assert from 'node:assert/strict';
import { routeInference, assessIndependence } from './provider-router.mjs';

const publicTask = { classification: 'PUBLIC', capability: 'text', input: 'Explain this public dataset' };
const remote = (overrides = {}) => ({
  id: 'gemini-free', kind: 'external', costTier: 'free', available: true,
  capabilities: ['text', 'vision'], invoke: async () => 'remote-result', ...overrides,
});
const local = (overrides = {}) => ({
  id: 'local-small', kind: 'local', costTier: 'free', available: true,
  capabilities: ['text'], invoke: async () => 'local-result', ...overrides,
});

test('external inference is disabled by default', async () => {
  let calls = 0;
  const result = await routeInference({ task: publicTask, providers: [remote({ invoke: async () => { calls++; } })] });
  assert.equal(result.status, 'HOLD');
  assert.equal(result.reason, 'NO_PERMITTED_PROVIDER');
  assert.equal(calls, 0);
});

test('development permits explicitly opted-in free external inference for public data', async () => {
  const result = await routeInference({ task: publicTask, providers: [remote()], allowExternal: true });
  assert.deepEqual(result, { status: 'OK', providerId: 'gemini-free', output: 'remote-result' });
});

test('confidential information cannot cross the external boundary even with opt-in', async () => {
  let calls = 0;
  const result = await routeInference({ task: { ...publicTask, classification: 'CONFIDENTIAL' }, providers: [remote({ invoke: async () => { calls++; } })], allowExternal: true });
  assert.equal(result.status, 'HOLD');
  assert.equal(calls, 0);
});

test('independence mode selects only local inference and never invokes the external engine', async () => {
  let remoteCalls = 0;
  const result = await routeInference({ task: publicTask, mode: 'independence', allowExternal: true, providers: [remote({ invoke: async () => { remoteCalls++; } }), local()] });
  assert.equal(result.providerId, 'local-small');
  assert.equal(result.output, 'local-result');
  assert.equal(remoteCalls, 0);
});

test('paid inference is never routed and unavailable providers cannot be selected', async () => {
  const result = await routeInference({ task: publicTask, allowExternal: true, providers: [remote({costTier: 'paid'}), local({ available: false })] });
  assert.equal(result.reason, 'NO_PERMITTED_PROVIDER');
});

test('missing capabilities fail closed instead of hallucinating a multimodal result', async () => {
  const result = await routeInference({ task: { ...publicTask, capability: 'audio' }, providers: [local()] });
  assert.equal(result.status, 'HOLD');
  assert.equal(result.reason, 'NO_PERMITTED_PROVIDER');
});

test('provider errors fail closed without leaking a token or silently switching providers', async () => {
  let called = false;
  const result = await routeInference({ task: publicTask, allowExternal: true, providers: [local({ invoke: async () => { throw new Error('secret-api-key'); } }), remote({ invoke: async () => { called = true; } })] });
  assert.deepEqual(result, { status: 'HOLD', reason: 'PROVIDER_ERROR', providerId: 'local-small' });
  assert.equal(called, false);
  assert.ok(!JSON.stringify(result).includes('secret-api-key'));
});

test('unrecognized task classification is rejected before calling a model', async () => {
  const result = await routeInference({ task: { ...publicTask, classification: 'unknown' }, providers: [local()] });
  assert.deepEqual(result, { status: 'HOLD', reason: 'INVALID_REQUEST' });
});

const completeEvidence = {
  evidenceRef: 'qualification/independence-2026-11-18.json',
  hoursDisconnected: 72,
  externalInferenceCalls: 0,
  paidInferenceCalls: 0,
  evaluatedMissions: 40,
  successfulMissions: 39,
  criticalPolicyViolations: 0,
  offlineRuntimeVerified: true,
  multimodalBenchmarksPassed: true,
  memoryBenchmarksPassed: true,
  learningHeldoutSamples: 40,
  learningBaselineCorrect: 28,
  learningCandidateCorrect: 33,
};

test('missing independent field evidence always holds qualification', () => {
  const result = assessIndependence({ evaluatedMissions: 200, successfulMissions: 200 });
  assert.equal(result.state, 'HOLD');
  assert.ok(result.holds.includes('DISCONNECTION_TRIAL_UNVERIFIED'));
  assert.ok(result.holds.includes('LEARNING_IMPROVEMENT_UNVERIFIED'));
  assert.equal(result.autoDisconnectAuthorized, false);
});

test('completed offline/multimodal/memory/learning trial is only ready for human approval', () => {
  const result = assessIndependence(completeEvidence);
  assert.equal(result.state, 'READY_FOR_HUMAN_REVIEW');
  assert.deepEqual(result.holds, []);
  assert.equal(result.autoDisconnectAuthorized, false);
});

test('independence assessment holds for any remote calls, unsafe actions or lack of measured learning improvement', () => {
  const result = assessIndependence({ ...completeEvidence, externalInferenceCalls: 1, criticalPolicyViolations: 1, learningCandidateCorrect: 28 });
  assert.equal(result.state, 'HOLD');
  assert.ok(result.holds.includes('EXTERNAL_DEPENDENCY_DETECTED'));
  assert.ok(result.holds.includes('POLICY_VIOLATION_DETECTED'));
  assert.ok(result.holds.includes('LEARNING_IMPROVEMENT_UNVERIFIED'));
});

test('invalid mission denominators fail closed and cannot exaggerate success', () => {
  const result = assessIndependence({ ...completeEvidence, successfulMissions: 41 });
  assert.equal(result.state, 'HOLD');
  assert.ok(result.holds.includes('MISSION_SUCCESS_GATE_FAILED'));
});
