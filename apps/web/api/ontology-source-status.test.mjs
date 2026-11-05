import test from 'node:test';
import assert from 'node:assert/strict';
import {createOntologySourceStatusHandler} from './ontology-source-status.mjs';
const founder=()=>({email:'shyamsundhar1982@gmail.com'});
const response=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(n){this.code=n;return this},json(x){this.body=x;return this}});
const req=({query='?source=inventory',flag='founder-readonly-v1',method='GET'}={})=>({method,url:'https://vaos.local/api/ontology/source-status'+query,headers:{cookie:''},env:{VAOS_ONTOLOGY_SOURCE_CONTROL:flag}});
const observed={actionType:'INVENTORY.OBSERVE_STOCK',sourceAuthority:'getAuthoritativeInventory',readOnly:true,effectClass:'read',sourceReceiptChecked:true,sourceCompletenessVerified:false,
 data:{schemaVersion:'VYNDI_ONTOLOGY_READ_RECEIPT_V1',sourceKind:'inventory',sourceScope:'vyndi_inventory_balance:all',sourceCount:1,records:[{sku:'SECRET',unit:'pc',quantity_balance:1}],
 complete:true,hasMore:false,asOf:'2026-11-05T04:30:00.000Z',asOfAuthority:'EXTRACT_TIME_NOT_SOURCE_CHANGE_TIME',sourceRevision:'a'.repeat(64),sourceRevisionAuthority:'CONTENT_DIGEST_ONLY',sourceCompletenessVerified:false}};
test('founder GET + explicit flag and allowed source required before transport',async()=>{
 let calls=0;const getReader=()=>{calls++;return {execute(){}}};
 const a=response();await createOntologySourceStatusHandler({getSession:()=>null,getReader})(req(),a);assert.equal(a.code,401);
 const b=response();await createOntologySourceStatusHandler({getSession:()=>({email:'other@example.com'}),getReader})(req(),b);assert.equal(b.code,403);
 const c=response();await createOntologySourceStatusHandler({getSession:founder,getReader})(req({method:'POST'}),c);assert.equal(c.code,405);
 const d=response();await createOntologySourceStatusHandler({getSession:founder,getReader})(req({flag:'off'}),d);assert.equal(d.code,409);
 for(const query of ['','?source=../../credentials','?source=inventory&url=http://evil','?source=inventory&source=shortages','?source=unknown']){
 const e=response();await createOntologySourceStatusHandler({getSession:founder,getReader})(req({query}),e);assert.equal(e.code,422);
 }assert.equal(calls,0);
});
test('source status reveals metadata only; never authorizes a PO action',async()=>{
 let job;const h=createOntologySourceStatusHandler({getSession:founder,getReader:()=>({execute:async x=>{job=x;return observed}})});
 const r=response();await h(req(),r);assert.equal(r.code,200);assert.equal(job.actionType,'INVENTORY.OBSERVE_STOCK');
 assert.equal(r.body.data.sourceCount,1);assert.equal(r.body.data.readOnly,true);
 assert.equal(r.body.data.sourceCompletenessVerified,false);assert.equal(r.body.data.productionWriteAuthorized,false);
 assert.equal(JSON.stringify(r.body).includes('SECRET'),false);assert.equal(r.body.data.status,'SOURCE_UNVERIFIED');
});
test('incomplete pages and unqualified receipts remain HOLD',async()=>{
 for(const invalid of [{...observed,sourceReceiptChecked:false},{...observed,data:{...observed.data,complete:false,hasMore:true,sourceCount:110}}]){
 const h=createOntologySourceStatusHandler({getSession:founder,getReader:()=>({execute:async()=>invalid})});
 const r=response();await h(req(),r);assert.equal(r.code,409);assert.equal(r.body.data.status,'HOLD');
 }
});
test('open POs are a typed read-only source, with no exposed PO records',async()=>{
 const po={...observed,actionType:'PROCUREMENT.OBSERVE_OPEN_POS',sourceAuthority:'listOpenPurchaseOrders',
  data:{...observed.data,sourceKind:'purchaseOrders',sourceScope:'vyndi_purchase_orders:open_status_v1',
   sourceCount:47,records:[{id:'CONFIDENTIAL-PO'}],complete:true,hasMore:false}};
 let request;
 const h=createOntologySourceStatusHandler({getSession:founder,getReader:()=>({execute:async job=>{request=job;return po}})});
 const r=response();await h(req({query:'?source=purchaseOrders'}),r);
 assert.equal(r.code,200);assert.equal(request.actionType,'PROCUREMENT.OBSERVE_OPEN_POS');
 assert.equal(r.body.data.sourceCount,47);
 assert.equal(r.body.data.productionWriteAuthorized,false);
 assert.ok(!JSON.stringify(r.body).includes('CONFIDENTIAL-PO'));
});
test('upstream errors are masked without inventing zero inventory',async()=>{
 const h=createOntologySourceStatusHandler({getSession:founder,getReader:()=>({execute:async()=>{throw Error('private DB secret')}})});
 const r=response();await h(req(),r);assert.equal(r.code,503);assert.equal(JSON.stringify(r.body).includes('private DB secret'),false);
});
