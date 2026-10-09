import test from 'node:test';
import assert from 'node:assert/strict';
import {createDifyQualificationClient} from './qualification-client.mjs';

const payload={provider:'activepieces',event_type:'synthetic_qualification',evidence_url:'https://github.com/vyndivybes/vaos/actions/runs/37918328806',commit_sha:'381b41493b5b103b1cc48715abda0de4e44ec7cd',run_id:'37918328806'};
const success={data:{outputs:{result:'status: PASS'}},workflow_run_id:'dify-run-1'};
function client(fetchImpl,env={DIFY_API_KEY:'test-secret'}){return createDifyQualificationClient({fetchImpl,env});}
test('fails closed when secret is absent',async()=>{const x=await client(()=>{throw Error('must not fetch')},{}).qualify(payload);assert.equal(x.status,'HOLD');assert.equal(x.reason,'DIFY_NOT_CONFIGURED')});
test('rejects non-success HTTP response without leaking credentials',async()=>{const x=await client(async()=>new Response('unauthorized',{status:401})).qualify(payload);assert.equal(x.status,'HOLD');assert.equal(x.reason,'DIFY_HTTP_ERROR')});
test('rejects invalid provider response',async()=>{const x=await client(async()=>new Response('{',{status:200})).qualify(payload);assert.equal(x.status,'HOLD')});
test('does not treat unverified model PASS as qualified',async()=>{const x=await client(async()=>Response.json(success)).qualify(payload);assert.equal(x.status,'HOLD');assert.equal(x.reason,'INDEPENDENT_VERIFICATION_REQUIRED');assert.equal(x.difyRunId,'dify-run-1')});
test('rejects missing payload fields',async()=>{const x=await client(()=>{throw Error('must not fetch')}).qualify({provider:'activepieces'});assert.equal(x.status,'HOLD');assert.equal(x.reason,'INVALID_PAYLOAD')});
test('does not send secrets in response',async()=>{const x=await client(async()=>Response.json(success)).qualify(payload);assert.equal(JSON.stringify(x).includes('test-secret'),false)});

// Regression for the 2026-10-09 12-second Cloudflare Dify cancellation.
test('classifies aborted upstream workflow as timeout rather than generic outage',async()=>{
  const fetchUntilAbort=(_url,options)=>new Promise((_resolve,reject)=>{
    options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
  });
  const x=await createDifyQualificationClient({env:{DIFY_API_KEY:'test-secret'},fetchImpl:fetchUntilAbort,timeoutMs:5}).qualify(payload);
  assert.equal(x.status,'HOLD');
  assert.equal(x.reason,'DIFY_TIMEOUT');
});

test('network exceptions are classified independently from timeout',async()=>{
  const x=await client(async()=>{throw new TypeError('network unreachable')}).qualify(payload);
  assert.equal(x.reason,'DIFY_NETWORK_ERROR');
});

test('HTTP 200 with invalid JSON is a response parse HOLD, not network unavailable',async()=>{
  const x=await client(async()=>new Response('<html>',{status:200,headers:{'content-type':'text/html'}})).qualify(payload);
  assert.equal(x.reason,'DIFY_RESPONSE_NOT_JSON');
});
