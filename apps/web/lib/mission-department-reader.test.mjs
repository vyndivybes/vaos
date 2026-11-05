import test from 'node:test';
import assert from 'node:assert/strict';
import {createMissionDepartmentReader} from './mission-department-reader.mjs';
import {getVyndiBridgeRoute} from '../../../packages/contracts/vyndi-write-bridge.mjs';

const work={missionId:'mission-001',handoffId:'hnd-001',handoffVersion:2,workPackageId:'wp-001'};
const actionType='INVENTORY.OBSERVE_STOCK';
const receipt={actionType,sourceAuthority:'getAuthoritativeInventory',nonce:'a'.repeat(32),
 bodySha256:'b'.repeat(64),data:{records:[{id:'private-asset-1'}]}};

test('department reader sends only an existing bridge read job and exposes bounded receipt metadata, no raw records',async()=>{
 const calls=[];
 const read=createMissionDepartmentReader({getReader:env=>{
  assert.equal(env.mode,'test');
  return {async execute(job){calls.push(job);return receipt;}};
 },now:()=>new Date('2026-10-15T09:00:00.000Z')});
 const report=await read({...work,actionType,env:{mode:'test'}});
 assert.equal(calls.length,1);
 assert.equal(calls[0].actionType,actionType);
 assert.equal(calls[0].payload.missionId,'mission-001');
 assert.equal(calls[0].payload.limit,50);
 assert.deepEqual(report,{status:'OBSERVED',sourceAuthority:'getAuthoritativeInventory',
  recordsObserved:1,requestNonce:'a'.repeat(32),requestBodySha256:'b'.repeat(64),
  gatewayReceivedAt:'2026-10-15T09:00:00.000Z'});
 assert.equal(JSON.stringify(report).includes('private-asset'),false);
});

test('all eight VYNDI read departments have an exact live read contract without effect authorization',async()=>{
 const read=createMissionDepartmentReader({getReader:()=>({async execute(job){
   const source=getVyndiBridgeRoute(job.actionType);
   let data={records:[]};
   if(job.actionType==='FINANCE.OBSERVE_LEDGER')data={ledger:[],journals:[]};
   if(job.actionType==='PEOPLE.OBSERVE_WORKFORCE')data={people:[],authority:[]};
   if(job.actionType==='MAINTENANCE.OBSERVE_ASSET')data={equipment:[],workOrders:[]};
   if(job.actionType==='ENGINEERING.OBSERVE_CONFIGURATION')data={changeOrders:[],baselines:[]};
   return {actionType:job.actionType,sourceAuthority:source.authority,
    nonce:'c'.repeat(32),bodySha256:'d'.repeat(64),data};
 }})});
 for(const action of [
  'COMMERCIAL.OBSERVE_PIPELINE','PROCUREMENT.OBSERVE_SHORTAGE',
  'INVENTORY.OBSERVE_STOCK','PRODUCTION.OBSERVE_WIP',
  'MAINTENANCE.OBSERVE_ASSET','FINANCE.OBSERVE_LEDGER',
  'PEOPLE.OBSERVE_WORKFORCE','ENGINEERING.OBSERVE_CONFIGURATION']){
  const result=await read({...work,actionType:action});
  assert.equal(result.recordsObserved,0);
  assert.equal(result.sourceAuthority,getVyndiBridgeRoute(action).authority);
 }
});

test('department reader refuses write contracts, wrong source authorities and invalid schemas without fabricating evidence',async()=>{
 const read=createMissionDepartmentReader({getReader:()=>({async execute(){return receipt;}})});
 for(const action of ['PRODUCTION.RELEASE_JOB','FINANCE.PREPARE_PAYMENT','ENGINEERING.BASELINE_CHANGE']){
  await assert.rejects(read({...work,actionType:action}),/DEPARTMENT_READ_NOT_ALLOWED/);
 }
 await assert.rejects(read({...work,actionType:'FINANCE.OBSERVE_LEDGER'}),/DEPARTMENT_READ_AUTHORITY_MISMATCH/);
 const broken=createMissionDepartmentReader({getReader:()=>({async execute(){
  return {...receipt,data:{records:'forged'}};
 }})});
 await assert.rejects(broken({...work,actionType}),/SOURCE_SCHEMA_UNVERIFIED/);
});

test('governed open-PO mission reads an exact signed content receipt without exposing PO rows',async()=>{
 const action='PROCUREMENT.OBSERVE_OPEN_POS';
 const records=[{id:'PO-PRIVATE-11',status:'draft',record_revision:1,supplier_name:'PRIVATE SUPPLIER'}];
 const sourceKind='purchaseOrders',sourceScope='vyndi_purchase_orders:open_status_v1',sourceCount=1;
 const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'
  ?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])):x;
 const canonical=JSON.stringify(stable({records,sourceCount,sourceKind,sourceScope}));
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
 const sourceRevision=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 const data={records,sourceCount,sourceKind,sourceScope,sourceRevision,
  schemaVersion:'VYNDI_ONTOLOGY_READ_RECEIPT_V1',
  sourceRevisionAuthority:'CONTENT_DIGEST_ONLY',sourceCompletenessVerified:false,
  asOf:'2026-11-05T12:00:00.000Z',asOfAuthority:'EXTRACT_TIME_NOT_SOURCE_CHANGE_TIME',
  complete:true,hasMore:false,readOnly:true,actionAuthorized:false,productionWriteAuthorized:false};
 const valid={actionType:action,sourceAuthority:getVyndiBridgeRoute(action).authority,
  nonce:'a'.repeat(32),bodySha256:'b'.repeat(64),readOnly:true,effectClass:'read',
  sourceReceiptChecked:true,sourceCompletenessVerified:false,
  actionAuthorized:false,productionWriteAuthorized:false,data};
 const calls=[];
 const readerFor=payload=>createMissionDepartmentReader({getReader:()=>({async execute(job){
  calls.push(job);return payload;
 }})});
 const observed=await readerFor(valid)({...work,actionType:action});
 assert.equal(calls.at(-1).actionType,action);
 assert.equal(observed.status,'OBSERVED');
 assert.equal(observed.recordsObserved,1);
 assert.equal(observed.sourceAuthority,valid.sourceAuthority);
 assert.equal(JSON.stringify(observed).includes('PRIVATE'),false);
 assert.equal(JSON.stringify(observed).includes('PO-PRIVATE-11'),false);
 for(const payload of [
  {...valid,sourceReceiptChecked:false},
  {...valid,actionAuthorized:true},
  {...valid,data:{...data,records:[{...records[0],status:'approved'}]}},
  {...valid,data:{...data,complete:false,hasMore:true}},
  {...valid,data:{...data,sourceScope:'vyndi_purchase_orders:all'}},
 ])await assert.rejects(readerFor(payload)({...work,actionType:action}),
  /DEPARTMENT_READ_SOURCE_INVALID|VYNDI_SOURCE_RECEIPT_INVALID/);
});
