import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createSlackQualificationHandler} from './slack-qualification.mjs';

const url='https://vaos.vayushastr.workers.dev/api/slack-qualification';
const validCookie=SESSION_COOKIE+'='+createSessionToken('shyamsundhar1982@gmail.com');
const token='xoxb-test-qual-secret';
function req(method='POST',head={},body={confirm:'run-synthetic-slack-once'},env={SLACK_BOT_TOKEN:token}){
  return {url,method,headers:head,body,env};
}
const headers={cookie:validCookie,origin:new URL(url).origin,'content-type':'application/json'};
test('unauthenticated status and delivery are rejected',async()=>{
  let sends=0;
  const h=createSlackQualificationHandler({makeAdapter:()=>({execute:async()=>{sends++}})});
  assert.equal((await h(req('GET'))).status,403);
  assert.equal((await h(req())).status,403);
  assert.equal(sends,0);
});
test('GET status only confirms presence of binding without exposing token',async()=>{
  const r=await createSlackQualificationHandler()(req('GET',{cookie:validCookie}));
  assert.equal(r.status,200);
  const b=await r.json();
  assert.equal(b.productionActivation,false);
  assert.equal(b.botTokenConfigured,true);
  assert.equal(JSON.stringify(b).includes(token),false);
});
test('requires same-origin maker POST with explicit confirmation',async()=>{
  let sends=0;
  const h=createSlackQualificationHandler({makeAdapter:()=>({execute:async()=>{sends++}})});
  for(const q of [
    req('POST',{...headers,origin:'https://evil.example'}),
    req('POST',{...headers,'content-type':'text/plain'}),
    req('POST',headers,{confirm:'bad'}),
    req('POST',headers,{confirm:'run-synthetic-slack-once',token:'secret'}),
  ]){
    const r=await h(q);assert.ok(r.status>=400);
  }
  assert.equal(sends,0);
});
test('missing bot credential fails closed',async()=>{
  const b=await (await createSlackQualificationHandler()(req('POST',headers,undefined,{}))).json();
  assert.equal(b.status,'HOLD');assert.equal(b.reason,'SLACK_BOT_TOKEN_MISSING');
});
test('one bounded synthetic delivery returns HOLD pending independent readback',async()=>{
  const jobs=[];
  const handler=createSlackQualificationHandler({makeAdapter:()=>({async execute(job){
    jobs.push(job);
    return {providerId:'slack',capability:'notification.send',providerRunId:'1791580000.000001',verification:{verified:true}};
  }})});
  const r=await handler(req('POST',headers));
  assert.equal(r.status,200);
  const body=await r.json();
  assert.equal(body.status,'HOLD');
  assert.equal(body.acknowledgmentVerified,true);
  assert.equal(body.productionActivation,false);
  assert.equal(jobs.length,1);
  assert.equal(jobs[0].payload.kind,'qualification.passed');
  assert.equal(JSON.stringify(body).includes(token),false);
});
test('masked provider errors do not leak token',async()=>{
  const handler=createSlackQualificationHandler({makeAdapter:()=>({async execute(){throw new Error('xoxb-test-qual-secret')}})});
  const r=await handler(req('POST',headers));
  assert.equal(r.status,503);
  const b=await r.json();
  assert.equal(b.reason,'SLACK_QUALIFICATION_FAILED');
  assert.equal(JSON.stringify(b).includes(token),false);
});
