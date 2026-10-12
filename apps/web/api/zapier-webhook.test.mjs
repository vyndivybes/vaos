import test from 'node:test';
import assert from 'node:assert/strict';
import { createZapierWebhookHandler } from './zapier-webhook.mjs';

const URL = 'https://hooks.zapier.com/hooks/catch/123456/AbC789/';
const ORIGIN = 'https://vaos.vayushastr.workers.dev';
const makeRequest = ({ method='POST', origin=ORIGIN, body={confirm:'run-synthetic-zapier-once'}, env={} }={}) => ({
  method, url: ORIGIN+'/api/zapier-webhook', env,
  headers: { origin, 'content-type':'application/json' },
  body,
});
const activeEnv = (writes=[]) => ({
  ZAPIER_CATCH_HOOK_URL: URL,
  VAOS_ARTIFACTS: { async put(key, value) { writes.push({key, value:JSON.parse(value)}); } },
});
const handler = (options={}) => createZapierWebhookHandler({
  isMaker:()=>true, id:()=> 'synthetic-event-001',
  send: async () => new Response('', {status:200}),
  ...options,
});

test('GET only reports readiness; never discloses catch hook URL', async () => {
  const result=await handler()(makeRequest({method:'GET',env:activeEnv()}));
  const data=await result.json();
  assert.equal(result.status,200);
  assert.equal(data.providerId,'zapier');
  assert.equal(data.hookConfigured,true);
  assert.equal(data.productionActivation,false);
  assert.equal(JSON.stringify(data).includes(URL),false);
});
test('missing maker permission prevents all queries and dispatch', async () => {
  let dispatched=0;
  const h=handler({isMaker:()=>false,send:async()=>{dispatched++;}});
  for(const method of ['GET','POST']){
    const r=await h(makeRequest({method,env:activeEnv()}));
    assert.equal(r.status,403);
  }
  assert.equal(dispatched,0);
});
test('POST requires exact same-site origin and deliberate confirmation', async () => {
  let calls=0;
  const h=handler({send:async()=>{calls++;}});
  const env=activeEnv();
  assert.equal((await h(makeRequest({origin:'https://evil.example',env}))).status,403);
  assert.equal((await h(makeRequest({body:{confirm:'yes'},env}))).status,422);
  assert.equal((await h(makeRequest({body:{confirm:'run-synthetic-zapier-once',extra:'x'},env}))).status,422);
  assert.equal(calls,0);
});
test('rejects missing or foreign webhook and missing durable audit before sending', async () => {
  let calls=0;
  const h=handler({send:async()=>{calls++;}});
  for(const env of [{},{ZAPIER_CATCH_HOOK_URL:'https://example.com/hooks/catch/1/a/',VAOS_ARTIFACTS:{put:async()=>{}}},{ZAPIER_CATCH_HOOK_URL:URL}]){
    const r=await h(makeRequest({env}));
    assert.equal(r.status,503);
  }
  assert.equal(calls,0);
});
test('sends one bounded synthetic payload and records independent verification as pending', async () => {
  const writes=[], sent=[];
  const h=handler({send:async (url,opts)=>{sent.push({url,opts});return new Response('ok',{status:200});}});
  const r=await h(makeRequest({env:activeEnv(writes)}));
  const data=await r.json();
  assert.equal(r.status,200);
  assert.equal(data.status,'HOLD');
  assert.equal(data.reason,'INDEPENDENT_ZAPIER_READBACK_REQUIRED');
  assert.equal(data.acknowledgmentVerified,true);
  assert.equal(data.independentReadbackVerified,false);
  assert.equal(data.productionActivation,false);
  assert.equal(sent.length,1);
  assert.equal(sent[0].url,URL);
  assert.equal(sent[0].opts.method,'POST');
  assert.equal(sent[0].opts.redirect,'manual');
  assert.equal(JSON.parse(sent[0].opts.body).schemaVersion,'vaos.zapier.synthetic.v1');
  assert.equal(JSON.parse(sent[0].opts.body).eventId,'synthetic-event-001');
  assert.equal(writes.length,2);
  assert.equal(writes[0].value.status,'DISPATCH_STARTED');
  assert.equal(writes[1].value.status,'ACKNOWLEDGED_UNVERIFIED');
  assert.equal(JSON.stringify(data).includes(URL),false);
  assert.equal(JSON.stringify(writes).includes(URL),false);
});
test('remote rejection and ambiguous error hold without automatic retry', async () => {
  for (const send of [async()=>new Response('',{status:429}),async()=>{throw new Error('socket timeout');}]){
    const writes=[],r=await handler({send})(makeRequest({env:activeEnv(writes)}));
    const body=await r.json();
    assert.equal(r.status,503);
    assert.equal(body.status,'HOLD');
    assert.equal(body.productionActivation,false);
    assert.equal(writes.length,2);
  }
});

test('Zapier HTTP redirect is not accepted and must not be followed',async()=>{
 const calls=[],writes=[];
 const r=await handler({send:async(url,init)=>{calls.push({url,init});return new Response(null,{status:302,headers:{location:'https://example.invalid/steal'}})}})(makeRequest({env:activeEnv(writes)}));
 const body=await r.json();
 assert.equal(r.status,503);
 assert.equal(body.acknowledgmentVerified,false);
 assert.equal(body.providerStatus,302);
 assert.equal(writes[1].value.status,'PROVIDER_REJECTED');
 assert.equal(calls[0].init.redirect,'manual');
});
test('network exception is classified safely without exposing provider URL or stack',async()=>{
 const writes=[];
 const h=handler({send:async()=>{throw new TypeError('secret-url '+URL)}});
 const r=await h(makeRequest({env:activeEnv(writes)}));
 const body=await r.json();
 assert.equal(body.status,'HOLD');assert.equal(body.transportFailureCode,'NETWORK');
 assert.equal(writes[1].value.transportFailureCode,'NETWORK');
 assert.doesNotMatch(JSON.stringify(body),/secret-url|123456\/AbC789/);
});
