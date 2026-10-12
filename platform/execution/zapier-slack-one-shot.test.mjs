import test from 'node:test';
import assert from 'node:assert/strict';
import {runZapierOneShot} from './zapier-slack-one-shot.mjs';
const KEY='qualification/zapier/slack-one-shot-20261012-round3.json';
function setup(){
 const map=new Map(),calls=[];
 const env={
  VAOS_ZAPIER_ONESHOT_CONTROL:'approved-synthetic-v1',
  ZAPIER_CATCH_HOOK_URL:'https://hooks.zapier.com/hooks/catch/123456/secureAbC/',
  VAOS_ARTIFACTS:{
   async get(k){return map.has(k)?{async text(){return map.get(k)}}:null},
   async put(k,v,o){if(o?.onlyIf?.get('If-None-Match')==='*'&&map.has(k))return null;map.set(k,v);return {etag:'etag'}}
  }
 };
 const send=async(url,opts)=>{calls.push({url,opts});return new Response('accepted',{status:200})};
 return {map,calls,env,send};
}
test('test remains disabled unless explicitly flagged; no webhook dispatched',async()=>{
 const s=setup();delete s.env.VAOS_ZAPIER_ONESHOT_CONTROL;
 const r=await runZapierOneShot(s.env,{send:s.send});
 assert.equal(r.status,'HOLD');assert.equal(s.calls.length,0);assert.equal(s.map.size,0);
});
test('missing hook or audit bucket fails before external side effects',async()=>{
 const s=setup();delete s.env.ZAPIER_CATCH_HOOK_URL;
 assert.equal((await runZapierOneShot(s.env,{send:s.send})).status,'HOLD');
 assert.equal(s.calls.length,0);
});
test('exactly one constrained webhook attempt and evidence recorded',async()=>{
 const s=setup();
 const r=await runZapierOneShot(s.env,{send:s.send,id:()=> 'd9dbf393-414d-4774-ac9d-2a405497e6c8'});
 assert.equal(r.status,'HOLD');assert.equal(r.acknowledgmentVerified,true);
 assert.match(r.answer,/d9dbf393-414d-4774-ac9d-2a405497e6c8/);
 assert.match(r.answer,/Independent Zap History/);
 assert.equal(s.calls.length,1);
 const payload=JSON.parse(s.calls[0].opts.body);
 assert.equal(payload.eventType,'synthetic_qualification');assert.equal(payload.productionActivation,false);
 assert.equal(s.calls[0].url,s.env.ZAPIER_CATCH_HOOK_URL);
 assert.equal(s.map.has(KEY),true);
 const b=await runZapierOneShot(s.env,{send:s.send});
 assert.equal(b.status,'HOLD');assert.equal(s.calls.length,1);assert.match(b.answer,/already/);
});
test('an uncertain delivery is never retried and never promoted to success',async()=>{
 const s=setup();let calls=0;
 const send=async()=>{calls++;throw Error('timeout')};
 const r=await runZapierOneShot(s.env,{send});
 assert.equal(r.status,'HOLD');assert.equal(r.acknowledgmentVerified,false);
 const b=await runZapierOneShot(s.env,{send});
 assert.equal(calls,1);assert.equal(b.status,'HOLD');
 assert.equal(s.map.has(KEY),true);
});
test('provider rejection still leaves HOLD with non-retryable admission',async()=>{
 const s=setup();
 const r=await runZapierOneShot(s.env,{send:async()=>new Response('bad',{status:401})});
 assert.equal(r.status,'HOLD');
 assert.equal(r.acknowledgmentVerified,false);
 assert.equal(s.map.has(KEY),true);
});

test('fresh round 3 admits one event without modifying previous archival evidence',async()=>{
 const s=setup();
 const oldKey='qualification/zapier/slack-one-shot-20261012-round2.json';
 const oldPayload=JSON.stringify({state:'HOLD',eventId:'d9646403-15e3-4ed2-885b-cb0e0eeb4a4a'});
 s.map.set(oldKey,oldPayload);
 const r=await runZapierOneShot(s.env,{send:s.send,id:()=> 'e7e3a5ce-7ee7-4794-89ba-18d0b7b9f4e6'});
 assert.equal(r.acknowledgmentVerified,true);
 assert.equal(s.calls.length,1);
 assert.equal(s.map.get(oldKey),oldPayload);
 assert.equal(s.map.has(KEY),true);
 const next=await runZapierOneShot(s.env,{send:s.send});
 assert.equal(next.status,'HOLD');assert.equal(s.calls.length,1);
});

test('transport diagnostics surface safe class without leaking webhook',async()=>{
 const s=setup();
 const r=await runZapierOneShot(s.env,{send:async()=>{throw new TypeError('private '+s.env.ZAPIER_CATCH_HOOK_URL)}});
 assert.equal(r.status,'HOLD');assert.match(r.answer,/NETWORK/);
 assert.equal(JSON.stringify(r).includes('hooks.zapier.com'),false);
});
