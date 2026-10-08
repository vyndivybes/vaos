import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyWindmillSyntheticExecution } from './synthetic-qualification.mjs';

const secret = 'NEVER-PRINT-WINDMILL-TOKEN';
function broker() {
  return {
    async withCredential(req, operation) {
      assert.equal(req.providerId, 'windmill');
      assert.equal(req.bindingRef, 'secret:windmill:synthetic-qualification');
      return operation({ kind: 'bearer', value: secret });
    },
  };
}
const challenge = 'c1a233dd44ee55ff66bb77cc88dd99aa';
const scriptPath = 'f/vaos/qualification_ping';
function transport({ jobId = '019f-1111-2222-3333-444455556666', scriptPath: returnedPath = scriptPath, success = true, result = { qualification: 'VAOS_WINDMILL_SYNTHETIC_V1', challenge } } = {}) {
  const calls = [];
  return {
    calls,
    async runScript(request) {
      calls.push({ phase: 'dispatch', url: request.url, method: request.method, body: request.body });
      assert.equal(request.body.challenge, challenge);
      assert.equal(request.url, 'https://app.windmill.dev/api/w/vaos/jobs/run/p/f/vaos/qualification_ping');
      assert.equal(request.headers.Authorization, 'Bearer ' + secret);
      return { status: 201, headers: {}, body: jobId };
    },
    async waitForJob(request) {
      calls.push({ phase: 'readback', url: request.url });
      return { id: jobId, success, script_path: returnedPath, result };
    },
  };
}
function params(t, overrides = {}) {
  return { credentialBroker: broker(), transport: t, challenge, ...overrides };
}
test('verifies exact synthetic marker, job identity and script path without disclosing the token', async () => {
  const t = transport();
  const result = await qualifyWindmillSyntheticExecution(params(t));
  assert.equal(result.status, 'PASS');
  assert.equal(result.scriptPath, scriptPath);
  assert.equal(result.jobId, '019f-1111-2222-3333-444455556666');
  assert.equal(result.productionActivation, false);
  assert.equal(result.scriptExecuted, true);
  assert.deepEqual(t.calls.map(c => c.phase), ['dispatch', 'readback']);
  assert.doesNotMatch(JSON.stringify(result), /NEVER-PRINT|c1a233dd44/);
});
test('refuses to dispatch unexpected script paths', async () => {
  const t = transport();
  await assert.rejects(qualifyWindmillSyntheticExecution(params(t, { scriptPath: 'f/vaos/engineering_mass_estimate' })), { code: 'WINDMILL_SYNTHETIC_SCRIPT_NOT_ALLOWED' });
  assert.equal(t.calls.length, 0);
});
test('fails if response challenge does not match', async () => {
  const t = transport({ result: { qualification: 'VAOS_WINDMILL_SYNTHETIC_V1', challenge: 'WRONG' } });
  await assert.rejects(qualifyWindmillSyntheticExecution(params(t)), { code: 'WINDMILL_SYNTHETIC_OUTPUT_INVALID' });
});
test('fails if response marker is incorrect', async () => {
  const t = transport({ result: { qualification: 'UNTRUSTED', challenge } });
  await assert.rejects(qualifyWindmillSyntheticExecution(params(t)), { code: 'WINDMILL_SYNTHETIC_OUTPUT_INVALID' });
});
test('fails if job id, script path or success differs from dispatch', async () => {
  for (const value of [
    { scriptPath: 'f/admin/other' },
    { success: false },
  ]) {
    const t = transport(value);
    await assert.rejects(qualifyWindmillSyntheticExecution(params(t)));
  }
});
test('fails on malformed challenge before any outbound request', async () => {
  const t = transport();
  await assert.rejects(qualifyWindmillSyntheticExecution(params(t, { challenge: 'hi' })), { code: 'WINDMILL_SYNTHETIC_CHALLENGE_INVALID' });
  assert.equal(t.calls.length, 0);
});
test('preserves no-retry-on-unknown-outcome semantics', async () => {
  let dispatches = 0;
  await assert.rejects(qualifyWindmillSyntheticExecution(params({
    async runScript() { dispatches++; const e = new Error('unknown'); e.requestSent = true; throw e; },
    async waitForJob() { throw new Error('must not call'); },
  })), { code: 'WINDMILL_OUTCOME_UNKNOWN' });
  assert.equal(dispatches, 1);
});
