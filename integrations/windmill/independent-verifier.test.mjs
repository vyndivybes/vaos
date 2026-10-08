import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyWindmillJobIndependently } from './independent-verifier.mjs';

const jobId = '019effff-aaaa-7bbb-8ccc-0123456789ab';
const expected = {
  schemaVersion: 'vaos.windmill.synthetic-qualification.v1',
  providerId: 'windmill',
  status: 'PASS',
  jobId,
  scriptPath: 'f/vaos/qualification_ping',
  scriptExecuted: true,
  productionActivation: false,
  source: {
    repository: 'vyndivybes/vaos',
    runId: '37847337453',
    commitSha: 'd1ac39e71bd2ad2c9008916db1c4f8edbbdfe24b',
  },
};
const response = {
  id: jobId,
  script_path: expected.scriptPath,
  success: true,
  result: { qualification: 'VAOS_WINDMILL_SYNTHETIC_V1', challenge: 'sample' },
};
function reader(body = response, status = 200) {
  const calls = [];
  return { calls, request: async q => { calls.push(q); return { status, body }; } };
}
test('separate read-only verifier authenticates one GET and returns sanitized evidence', async () => {
  const t = reader();
  const value = await verifyWindmillJobIndependently({
    httpTransport: t, readToken: 'test-only', sourceEvidence: expected, sourceRunId: expected.source.runId,
  });
  assert.equal(value.status, 'PASS');
  assert.equal(value.sourceRunId, expected.source.runId);
  assert.equal(value.jobId, jobId);
  assert.equal(value.productionActivation, false);
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].method, 'GET');
  assert.doesNotMatch(JSON.stringify(value), /test-only|sample/);
});
test('rejects changed source IDs and script paths before any network I/O', async () => {
  for (const edited of [{ jobId: '../invalid' }, { scriptPath: 'f/admin/other' }, { productionActivation: true }]) {
    const t = reader();
    await assert.rejects(verifyWindmillJobIndependently({
      httpTransport: t, readToken: 'test-only', sourceEvidence: { ...expected, ...edited }, sourceRunId: expected.source.runId,
    }));
    assert.equal(t.calls.length, 0);
  }
});
test('does not accept mismatched or unsuccessful Windmill job readback', async () => {
  for (const altered of [
    { id: '019effff-aaaa-7bbb-8ccc-999999999999' },
    { script_path: 'f/admin/other' },
    { success: false },
    { result: { qualification: 'INVALID' } },
  ]) {
    await assert.rejects(verifyWindmillJobIndependently({
      httpTransport: reader({ ...response, ...altered }), readToken: 'test-only',
      sourceEvidence: expected, sourceRunId: expected.source.runId,
    }));
  }
});
test('fails closed for denial and untrusted prior run', async () => {
  await assert.rejects(verifyWindmillJobIndependently({
    httpTransport: reader(response, 403), readToken: 'test-only',
    sourceEvidence: expected, sourceRunId: expected.source.runId,
  }));
  await assert.rejects(verifyWindmillJobIndependently({
    httpTransport: reader(), readToken: 'test-only',
    sourceEvidence: expected, sourceRunId: '123',
  }));
});
