import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchInfisicalWatchdog, infisicalDispatchFailureCode } from '../execution/cloudflare-infisical-dispatch.mjs';

test('missing Cloudflare scoped dispatch token cannot access GitHub', async () => {
  let calls = 0;
  const result = await dispatchInfisicalWatchdog({token: '', fetchImpl: async () => { calls++; throw Error('should not call'); }});
  assert.deepEqual(result, {status:'unconfigured'});
  assert.equal(calls, 0);
});

test('Cloudflare cron dispatches one fixed main-only Infisical health check', async () => {
  const requests = [];
  const result = await dispatchInfisicalWatchdog({
    token:'fake-secret-value',
    fetchImpl:async (url, options) => {requests.push({url,options}); return {status:204};},
  });
  assert.deepEqual(result, {status:'accepted'});
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,'https://api.github.com/repos/vyndivybes/vaos/actions/workflows/infisical-scoped-commissioning.yml/dispatches');
  assert.equal(requests[0].options.method,'POST');
  assert.equal(requests[0].options.redirect,'error');
  assert.deepEqual(JSON.parse(requests[0].options.body),{ref:'main',inputs:{action:'record-health'}});
  assert.equal(requests[0].options.headers.Authorization,'Bearer fake-secret-value');
  assert.equal(requests[0].options.headers['User-Agent'],'vaos-infisical-watchdog');
  assert.ok(requests[0].options.signal);
});

test('a non-204 GitHub response fails closed without retries or response-body logging',async()=>{
  let calls=0;
  await assert.rejects(
    dispatchInfisicalWatchdog({token:'private',fetchImpl:async()=>{calls++;return {status:403, text:async()=> 'sensitive error response'};}}),
    /VAOS_GITHUB_DISPATCH_HTTP_403/
  );
  assert.equal(calls,1);
});

test('an unexpected success response is not accepted as workflow dispatch proof',async()=>{
  await assert.rejects(dispatchInfisicalWatchdog({token:'private',fetchImpl:async()=>({status:200})}),/VAOS_GITHUB_DISPATCH_HTTP_200/);
});

test('network errors are sanitized without leaking scoped token or retrying',async()=>{
  let calls=0;
  await assert.rejects(dispatchInfisicalWatchdog({
    token:'private',
    fetchImpl:async()=>{calls++;throw Error('private network detail');},
  }),err=>{assert.equal(err.message,'VAOS_GITHUB_DISPATCH_NETWORK_FAILED_UNKNOWN');return true;});
  assert.equal(calls,1);
});

test('dispatch diagnostics allow only fixed error codes', () => {
  for (const code of ['VAOS_GITHUB_DISPATCH_HTTP_403', 'VAOS_GITHUB_DISPATCH_NETWORK_FAILED']) {
    assert.equal(infisicalDispatchFailureCode(new Error(code)), code);
  }
  for (const error of [new Error('secret'), new Error('VAOS_GITHUB_DISPATCH_HTTP_403 secret'), new Error('VAOS_GITHUB_DISPATCH_HTTP_999'), 'secret', null]) {
    assert.equal(infisicalDispatchFailureCode(error), 'VAOS_GITHUB_DISPATCH_UNKNOWN_FAILED');
  }
});
