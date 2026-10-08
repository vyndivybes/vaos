import test from 'node:test';
import assert from 'node:assert/strict';
import { createWindmillSyntheticHttpTransport } from './synthetic-http-transport.mjs';
const base = 'https://app.windmill.dev/api/w/vaos';
const jobId = '019f-1111-2222-3333-444455556666';
const runRequest = () => ({
  url: base + '/jobs/run/p/f/vaos/qualification_ping',
  method: 'POST',
  timeoutMs: 15000,
  headers: { Authorization: 'Bearer NOT_FOR_LOGS', 'Content-Type': 'application/json' },
  body: { challenge: 'abcdefabcdefabcdefabcdefabcdefab' },
});
const getRequest = () => ({ jobId, url: base + '/jobs_u/get/' + jobId, headers: { Authorization: 'Bearer NOT_FOR_LOGS' } });
test('dispatches only the approved path and never retries POST', async () => {
  const calls = [];
  const t = createWindmillSyntheticHttpTransport({httpTransport: {
    async request(input) { calls.push(input); return {status:201,body:jobId}; },
  }});
  const response = await t.runScript(runRequest());
  assert.equal(response.body, jobId);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, runRequest().url);
});
test('rejects arbitrary script paths before any transport call', async () => {
  let touched = false;
  const t = createWindmillSyntheticHttpTransport({httpTransport:{ async request(){touched=true;} }});
  await assert.rejects(t.runScript({...runRequest(), url:base+'/jobs/run/p/f/vaos/engineering_mass_estimate'}), {code:'WINDMILL_SYNTHETIC_DISPATCH_REJECTED'});
  assert.equal(touched, false);
});
test('polls a queued job and verifies completed response without redispatch', async () => {
  let calls = 0;
  const t = createWindmillSyntheticHttpTransport({
    maxPolls:3,
    sleep:async()=>{},
    httpTransport:{async request(input){
      calls++;
      assert.equal(input.method,'GET');
      return calls===1?{status:404,body:null}:{status:200,body:{id:jobId,success:true,script_path:'f/vaos/qualification_ping',result:{}}};
    }},
  });
  assert.equal((await t.waitForJob(getRequest())).success,true);
  assert.equal(calls,2);
});
test('fails closed when job readback is forbidden', async () => {
  const t=createWindmillSyntheticHttpTransport({maxPolls:2,httpTransport:{async request(){return {status:403};}}});
  await assert.rejects(t.waitForJob(getRequest()),{code:'WINDMILL_SYNTHETIC_READBACK_FORBIDDEN'});
});
test('fails closed if job never completes', async () => {
  const t=createWindmillSyntheticHttpTransport({maxPolls:2,sleep:async()=>{},httpTransport:{async request(){return {status:202};}}});
  await assert.rejects(t.waitForJob(getRequest()),{code:'WINDMILL_SYNTHETIC_JOB_NOT_COMPLETE'});
});
