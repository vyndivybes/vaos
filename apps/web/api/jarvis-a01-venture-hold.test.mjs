import test from 'node:test';
import assert from 'node:assert/strict';
import {createVyndiReadBridgeClient} from '../../../platform/execution/vyndi-read-bridge-client.mjs';
import {createJarvisA01Handler} from './jarvis-a01.mjs';

test('signed VYNDI HTTP 409 venture scope HOLD maps to terminal sanitized VAOS code',async()=>{
 const client=createVyndiReadBridgeClient({
  signer:{async signVyndiBridgeRequest(){return {keyId:'vyndi-primary-p256-v1',signature:'synthetic-signer'}}},
  serviceBinding:{async fetch(){return new Response(
   JSON.stringify({ok:false,error:'source_venture_scope_unverified'}),{status:409})}},
  now:()=>Date.parse('2026-11-19T09:00:00.000Z'),nonce:()=> 'a01-synthetic-venture-hold-nonce',
 });
 await assert.rejects(
  ()=>client.execute({id:'synthetic-job',intentId:'synthetic-intent',actionType:'INVENTORY.OBSERVE_STOCK',payload:{limit:100}}),
  e=>e?.code==='VYNDI_BRIDGE_SOURCE_VENTURE_SCOPE_UNVERIFIED'&&e.retryable===false
     &&!String(e.message).includes('synthetic-'));
});

test('founder-only A01 reports explicit venture scope HOLD, never business approval',async()=>{
 const capture={code:0,headers:{},body:null};
 const res={
  setHeader(k,v){capture.headers[k]=v;return this;},
  status(v){capture.code=v;return this;},
  json(v){capture.body=v;return this;},
 };
 const handler=createJarvisA01Handler({
  getSession:()=>({email:'shyamsundhar1982@gmail.com'}),
  getReader:()=>({async execute(job){
    if(job.actionType==='INVENTORY.OBSERVE_STOCK'||job.actionType==='PROCUREMENT.OBSERVE_SHORTAGE'){
      const e=Error('synthetic hidden ledger details');e.code='VYNDI_BRIDGE_SOURCE_VENTURE_SCOPE_UNVERIFIED';e.retryable=false;throw e;
    }
    throw Error('synthetic other source is unavailable');
  }}),
  getHealth:async()=>({status:'HOLD',readOnly:true,actionAuthorized:false,
    sourceCompletenessVerified:false,agentUsable:false,productionWriteAuthorized:false,sources:[]}),
  now:()=>Date.parse('2026-11-19T09:00:00.000Z'),
 });
 await handler({method:'GET',url:'https://vaos.invalid/api/jarvis-a01',headers:{cookie:''},
  env:{VAOS_ONTOLOGY_SOURCE_CONTROL:'founder-readonly-v1'}},res);
 assert.equal(capture.code,200);
 assert.equal(capture.body?.data?.status,'HOLD');
 assert.equal(capture.body?.data?.consistencyGate,'HOLD');
 assert.equal(capture.body?.data?.productionWriteAuthorized,false);
 assert.equal(capture.body?.data?.businessSourceAuthorityVerified,false);
 assert.ok(capture.body.data.holds.includes('inventory:SOURCE_VENTURE_SCOPE_UNVERIFIED'));
 assert.ok(capture.body.data.holds.includes('shortages:SOURCE_VENTURE_SCOPE_UNVERIFIED'));
 assert.ok(!JSON.stringify(capture.body).includes('synthetic hidden ledger details'));
});
