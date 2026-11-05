import test from 'node:test';
import assert from 'node:assert/strict';
import {createOntologyHealthHandler} from './ontology-health.mjs';

const founder=()=>({email:'shyamsundhar1982@gmail.com'});
const response=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;return this;},status(n){this.code=n;return this;},json(data){this.body=data;return this;}});
const req=({method='GET',url='https://vaos.local/api/ontology/health'}={})=>({method,url,headers:{cookie:''},env:{}});

const blank={status:'HOLD',sources:[
 {sourceKind:'inventory',objectType:'InventoryItem',status:'HOLD',reason:'NO_SIGNED_RECEIPT',observedCount:null,projectionCount:0,lastExtractedAt:null,receiptAgeSeconds:null,sloSeconds:900},
 {sourceKind:'shortages',objectType:'Shortage',status:'HOLD',reason:'NO_SIGNED_RECEIPT',observedCount:null,projectionCount:0,lastExtractedAt:null,receiptAgeSeconds:null,sloSeconds:900},
 {sourceKind:'purchaseOrders',objectType:'PurchaseOrder',status:'HOLD',reason:'NO_SIGNED_RECEIPT',observedCount:null,projectionCount:0,lastExtractedAt:null,receiptAgeSeconds:null,sloSeconds:3600}
],readOnly:true,sourceCompletenessVerified:false,agentUsable:false,actionAuthorized:false,productionWriteAuthorized:false};

test('founder-only GET denies before touching private store',async()=>{
 let calls=0;const getStore=()=>{calls++;return {getOntologySourceHealth:async()=>blank}};
 for(const [identity,request,code] of [
  [()=>null,req(),401],
  [()=>({email:'other@example.com'}),req(),403],
  [founder,req({method:'POST'}),405],
  [founder,req({url:'https://vaos.local/api/ontology/health?source=../../secret'}),422]
 ]){
  const r=response();await createOntologyHealthHandler({getSession:identity,getStore})(request,r);
  assert.equal(r.code,code);
 }
 assert.equal(calls,0);
});

test('empty signed source store returns HOLD not zero inventory or fabricated objects',async()=>{
 const r=response();await createOntologyHealthHandler({getSession:founder,getStore:()=>({getOntologySourceHealth:async()=>blank})})(req(),r);
 assert.equal(r.code,200);assert.equal(r.body.data.status,'HOLD');
 assert.equal(r.body.data.sources.length,3);
 assert.equal(r.body.data.sources[0].observedCount,null);
 assert.equal(r.body.data.agentUsable,false);
 assert.equal(r.body.data.productionWriteAuthorized,false);
 assert.equal(r.headers['Cache-Control'],'no-store');
});

test('incomplete, self-certified or malformed store responses fail closed and do not leak ERP data',async()=>{
 for(const data of [null,{...blank,agentUsable:true},{...blank,productionWriteAuthorized:true},
  {...blank,sources:[{sourceKind:'inventory',status:'OBSERVED',records:[{supplier:'PRIVATE'}]}]},
  {...blank,sources:[{sourceKind:'inventory',status:'SOURCE_UNVERIFIED',observedCount:1}]}]){
  const r=response();await createOntologyHealthHandler({getSession:founder,getStore:()=>({getOntologySourceHealth:async()=>data})})(req(),r);
  assert.equal(r.code,503);assert.equal(JSON.stringify(r.body).includes('PRIVATE'),false);
 }
});

test('database unavailability is HOLD rather than a healthy blank dashboard',async()=>{
 const r=response();await createOntologyHealthHandler({getSession:founder,getStore:()=>({getOntologySourceHealth:async()=>{throw Error('secret')}})})(req(),r);
 assert.equal(r.code,503);assert.equal(r.body.data.status,'HOLD');
 assert.equal(JSON.stringify(r.body).includes('secret'),false);
});

test('projection drift stays HOLD and contradictory ready-looking metadata is rejected',async()=>{
 const drift={...blank,sources:[
  {...blank.sources[0],status:'HOLD',reason:'PROJECTION_DRIFT',
   observedCount:1,projectionCount:0,lastExtractedAt:'2026-11-05T09:00:00.000Z',receiptAgeSeconds:30},
  ...blank.sources.slice(1),
 ]};
 const handlerFor=data=>createOntologyHealthHandler({getSession:founder,
  getStore:()=>({getOntologySourceHealth:async()=>data})});
 const accepted=response();await handlerFor(drift)(req(),accepted);
 assert.equal(accepted.code,200);
 assert.equal(accepted.body.data.sources[0].status,'HOLD');
 assert.equal(accepted.body.data.sources[0].reason,'PROJECTION_DRIFT');
 for(const wrong of [
  {...drift,sources:[{...drift.sources[0],status:'SOURCE_UNVERIFIED',
   reason:'SOURCE_REVISION_UNVERIFIED'},...drift.sources.slice(1)]},
  {...drift,sources:[{...drift.sources[0],status:'SOURCE_UNVERIFIED'},...drift.sources.slice(1)]},
 ]){
  const denied=response();await handlerFor(wrong)(req(),denied);
  assert.equal(denied.code,503);
  assert.equal(denied.body.data.status,'HOLD');
 }
});
