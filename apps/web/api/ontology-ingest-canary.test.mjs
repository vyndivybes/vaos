import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createOntologyIngestCanaryHandler} from './ontology-ingest-canary.mjs';
import {createSupabaseControlStore} from '../../../platform/persistence/supabase-store.mjs';

const response=()=>({code:200,headers:{},
 setHeader(k,v){this.headers[k]=v;return this;},
 status(n){this.code=n;return this;},
 json(body){this.body=body;return this;}});
const req=({method='POST',source='inventory',flag='founder-canary-v1',
 origin='https://vaos.local',body=undefined}={})=>({
 method,url:'https://vaos.local/api/ontology/ingest-canary'+(source===null?'':'?source='+source),
 headers:{origin,'sec-fetch-site':'same-origin'},body,env:{VAOS_ONTOLOGY_INGEST_CONTROL:flag}});
const founder=()=>({email:'shyamsundhar1982@gmail.com'});

async function observation(){
 const records=[{sku:'SECRET-SKU',unit:'pcs',quantity_balance:3}];
 const fields={sourceKind:'inventory',sourceScope:'vyndi_inventory_balance:all',sourceCount:1,records};
 const canonical=JSON.stringify({records:[{quantity_balance:3,sku:'SECRET-SKU',unit:'pcs'}],
  sourceCount:1,sourceKind:fields.sourceKind,sourceScope:fields.sourceScope});
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
 const sourceRevision=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
 return {actionType:'INVENTORY.OBSERVE_STOCK',sourceAuthority:'getAuthoritativeInventory',
  readOnly:true,effectClass:'read',sourceReceiptChecked:true,sourceCompletenessVerified:false,
  data:{...fields,schemaVersion:'VYNDI_ONTOLOGY_READ_RECEIPT_V1',sourceRevision,
   asOf:'2026-11-05T04:00:00.000Z',sourceRevisionAuthority:'CONTENT_DIGEST_ONLY',
   asOfAuthority:'EXTRACT_TIME_NOT_SOURCE_CHANGE_TIME',
   complete:true,hasMore:false,sourceCompletenessVerified:false,readOnly:true,
   actionAuthorized:false,productionWriteAuthorized:false}};
}

test('auth, origin, gate, method and source deny before upstream I/O',async()=>{
 let called=0;
 const getStore=()=>{called++;throw Error('never call this');};
 for(const [input,identity,code] of [
  [{method:'GET'},founder,405],
  [{},()=>null,401],
  [{},()=>({email:'guest@example.org'}),403],
  [{origin:'https://evil.example'},founder,403],
  [{flag:'disabled'},founder,409],
  [{source:'../../env'},founder,422],
  [{source:null},founder,422],
  [{source:'inventory&source=shortages'},founder,422],
  [{body:{url:'https://evil.example'}},founder,422],
 ]){
  const r=response();
  await createOntologyIngestCanaryHandler({getSession:identity,getStore})(req(input),r);
  assert.equal(r.code,code,JSON.stringify(input));
 }
 assert.equal(called,0);
});

test('signed complete receipt persists once; response hides ERP records and all action rights',async()=>{
 const signed=await observation();
 let reads=0,writes=0,saved;
 const store={ingestOntologySourceReceipt:async receipt=>{
  writes++;saved=receipt;
  return {status:'SOURCE_UNVERIFIED',sourceKind:'inventory',receiptId:'receipt-1',
   durableReceiptStored:true,sourceCompletenessVerified:false,agentUsable:false,
   actionAuthorized:false,productionWriteAuthorized:false};
 }};
 const handler=createOntologyIngestCanaryHandler({getSession:founder,getStore:()=>store,
  getReader:()=>({execute:async job=>{
   assert.equal(job.actionType,'INVENTORY.OBSERVE_STOCK');
   reads++;return signed;
  }})});
 const r=response();await handler(req(),r);
 assert.equal(r.code,200);assert.equal(reads,1);assert.equal(writes,1);
 assert.equal(saved.sourceRevision,signed.data.sourceRevision);
 assert.equal(r.body.data.status,'SOURCE_UNVERIFIED');
 assert.equal(r.body.data.durableReceiptStored,true);
 for(const key of ['agentUsable','actionAuthorized','productionWriteAuthorized',
  'durableHydrationVerified','sourceCompletenessVerified'])assert.equal(r.body.data[key],false);
 assert.ok(!JSON.stringify(r.body).includes('SECRET-SKU'));
 assert.equal(r.headers['Cache-Control'],'no-store');
});

test('invalid receipt or source authority never reaches durable storage',async()=>{
 const good=await observation();let writes=0;
 const store={ingestOntologySourceReceipt:async()=>{writes++;return {}}};
 for(const value of [
  {...good,sourceAuthority:'wrong'},
  {...good,sourceReceiptChecked:false},
  {...good,data:{...good.data,complete:false,hasMore:true}},
  {...good,data:{...good.data,records:[{sku:'SECRET-SKU',unit:'pcs',quantity_balance:999}]}},
 ]){
  const handler=createOntologyIngestCanaryHandler({
   getSession:founder,getStore:()=>store,
   getReader:()=>({execute:async()=>value})});
  const r=response();await handler(req(),r);
  assert.equal(r.code,409);assert.equal(r.body.data.status,'HOLD');
 }
 assert.equal(writes,0);
});

test('upstream errors and storage exceptions are masked and fail closed',async()=>{
 const good=await observation();
 for(const [getStore,getReader,code] of [
  [()=>{throw Error('PRIVATE_SERVER_KEY');},()=>({}),503],
  [()=>({ingestOntologySourceReceipt:async()=>{throw Error('PRIVATE_SERVER_KEY');}}),
   ()=>({execute:async()=>good}),409],
 ]){
  const r=response();
  await createOntologyIngestCanaryHandler({getSession:founder,getStore,getReader})(req(),r);
  assert.equal(r.code,code);assert.equal(r.body.data.status,'HOLD');
  assert.ok(!JSON.stringify(r.body).includes('PRIVATE_SERVER_KEY'));
 }
});

test('the existing Supabase control store forwards only one guarded RPC operation',async()=>{
 let request;
 const store=createSupabaseControlStore({
  url:'https://example.supabase.co',serverSecret:'test-only',
  fetchImpl:async (url,init)=>{
   request={url,init};return new Response(JSON.stringify({status:'SOURCE_UNVERIFIED'}));
  }});
 const input={schemaVersion:'VYNDI_ONTOLOGY_READ_RECEIPT_V1'};
 await store.ingestOntologySourceReceipt(input);
 assert.equal(request.url,'https://example.supabase.co/functions/v1/vaos-control');
 assert.equal(request.init.method,'POST');
 assert.deepEqual(JSON.parse(request.init.body),{operation:'ingestOntologySourceReceipt',
  payload:{receipt:input}});
 assert.equal(request.init.headers['x-vaos-server-key'],'test-only');
 assert.ok(!request.init.body.includes('test-only'));
 const source=await readFile(new URL('../../../supabase/functions/vaos-control/index.ts',import.meta.url),'utf8');
 assert.match(source,/operation === 'ingestOntologySourceReceipt'/);
 assert.match(source,/rpcName = 'vaos_ontology_ingest_read_receipt_v1'/);
 assert.match(source,/p_server_key: serverKey, p_receipt: payload\.receipt/);
});
