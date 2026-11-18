import test from 'node:test';
import assert from 'node:assert/strict';
import {runA03SignedReadCanary} from '../../../intelligence/jarvis-a03-read-canary.mjs';
import {createJarvisA03ReadCanaryHandler} from './jarvis-a03-read-canary.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';

const NOW='2026-11-19T00:12:00.000Z';
const SCOPE={
 inventory:['INVENTORY.OBSERVE_STOCK','getAuthoritativeInventory','vyndi_inventory_balance:all'],
 shortages:['PROCUREMENT.OBSERVE_SHORTAGE','getConfiguredDemandShortages','vyndi_live_job_card_requirements:released_in_progress_positive_shortage'],
 purchaseOrders:['PROCUREMENT.OBSERVE_OPEN_POS','listOpenPurchaseOrders','vyndi_purchase_orders:open_status_v1']
};
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?
 Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])):x;
const hash=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
 new TextEncoder().encode(JSON.stringify(stable(x))))),b=>b.toString(16).padStart(2,'0')).join('');
async function sample(kind,{sourceCount=1,records=[{sku:'PRIVATE-SECRET-SKU',unit:'pcs'}],at='2026-11-19T00:11:30.000Z'}={}){
 const [actionType,sourceAuthority,sourceScope]=SCOPE[kind];
 const sourceRevision=await hash({sourceKind:kind,sourceScope,sourceCount,records});
 return {actionType,sourceAuthority,effectClass:'read',readOnly:true,
  sourceReceiptChecked:true,sourceCompletenessVerified:false,
  actionAuthorized:false,productionWriteAuthorized:false,
  data:{schemaVersion:'VYNDI_ONTOLOGY_READ_RECEIPT_V1',
   sourceKind:kind,sourceScope,sourceCount,records,sourceRevision,
   sourceRevisionAuthority:'CONTENT_DIGEST_ONLY',asOf:at,
   asOfAuthority:'EXTRACT_TIME_NOT_SOURCE_CHANGE_TIME',
   complete:records.length===sourceCount,hasMore:records.length<sourceCount,
   sourceCompletenessVerified:false,readOnly:true,
   actionAuthorized:false,productionWriteAuthorized:false}};
}
async function samples(){
 return {inventory:await sample('inventory'),
  shortages:await sample('shortages',{sourceCount:0,records:[]}),
  purchaseOrders:await sample('purchaseOrders',{sourceCount:2,records:[{id:'PRIVATE-PO-1'},{id:'PRIVATE-PO-2'}]})};
}
function fakeReader(rows,spy=[]){return {execute:async job=>{
 spy.push(job);const kind=Object.keys(SCOPE).find(k=>SCOPE[k][0]===job.actionType);
 if(!kind)throw Error('READ_SCOPE_INVALID');
 return structuredClone(rows[kind]);
}}}
const capture=()=>{const state={status:200,headers:{},body:null};
 return {state,res:{setHeader(k,v){state.headers[k]=v;return this;},
 status(v){state.status=v;return this;},json(v){state.body=v;return this;}}};
};
const request=(o={})=>({method:o.method||'POST',url:'https://vaos.local/api/jarvis-a03-read-canary'+(o.query||''),
 env:{VAOS_A03_READ_CANARY_CONTROL:o.flag===undefined?'founder-manual-readonly-v1':o.flag},
 headers:{cookie:'',origin:o.origin===undefined?'https://vaos.local':o.origin,
 'content-type':o.type||'application/json'},
 body:o.body===undefined?{operation:'VERIFY_SIGNED_SOURCE_READS',confirm:true}:o.body});

test('A03 bounded runtime calls only canonical existing signed read actions; no commercial mutation or private rows',async()=>{
 const rows=await samples(),calls=[];
 const out=await runA03SignedReadCanary({reader:fakeReader(rows,calls),now:()=>Date.parse(NOW)});
 assert.equal(out.schemaVersion,'VAOS_JARVIS_A03_SIGNED_READ_CANARY_V1');
 assert.equal(out.status,'BOUNDED_READ_COMPLETE');
 assert.equal(out.qualificationStatus,'HOLD');
 assert.deepEqual(calls.map(c=>c.actionType),Object.values(SCOPE).map(x=>x[0]));
 assert.equal(calls.length,3);
 assert.ok(calls.every(c=>c.payload.limit===100&&c.payload.missionId==='jarvis:a03:founder-read-canary'));
 assert.ok(calls.every(c=>typeof c.id==='string'&&typeof c.intentId==='string'));
 assert.equal(new Set(calls.map(c=>c.id)).size,3);
 assert.deepEqual(out.sources.map(x=>x.sourceCount),[1,0,2]);
 assert.ok(out.sources.every(x=>x.status==='SIGNED_BOUNDED_OBSERVATION'&&x.authoritativeRevisionVerified===false));
 assert.equal(out.businessWritesExecuted,0);
 assert.equal(out.externalReadInvocations,3);
 assert.equal(out.independentBusinessFactsCertified,false);
 assert.equal(out.sourceCompletenessVerified,false);
 assert.equal(out.productionWriteAuthorized,false);
 assert.equal(out.agentDispatchAuthorized,false);
 assert.ok(!JSON.stringify(out).includes('PRIVATE-'));
});
test('A03 fails closed and stops remaining reads on tampering, stale receipts, incomplete page or write claims',async()=>{
 const original=await samples();
 for(const failure of ['TAMPER','STALE','INCOMPLETE','WRITE','AUTHORITY']){
  const rows=structuredClone(original);
  if(failure==='TAMPER')rows.inventory.data.records[0].sku='PRIVATE-TAMPER';
  if(failure==='STALE')rows.inventory.data.asOf='2026-11-15T00:11:30.000Z';
  if(failure==='INCOMPLETE'){rows.inventory.data.sourceCount=2;rows.inventory.data.complete=false;rows.inventory.data.hasMore=true;}
  if(failure==='WRITE')rows.inventory.productionWriteAuthorized=true;
  if(failure==='AUTHORITY')rows.inventory.sourceAuthority='FORGED';
  const calls=[],out=await runA03SignedReadCanary({reader:fakeReader(rows,calls),now:()=>Date.parse(NOW)});
  assert.equal(out.status,'HOLD',failure);
  assert.equal(out.businessWritesExecuted,0,failure);
  assert.equal(out.externalReadInvocations,1,failure);
  assert.equal(out.sources[0].status,'HOLD',failure);
  assert.equal(out.sources[1].status,'NOT_ATTEMPTED',failure);
  assert.equal(out.sources[2].status,'NOT_ATTEMPTED',failure);
  assert.ok(!JSON.stringify(out).includes('PRIVATE-'),failure);
 }
});
test('A03 unavailable reader or bridge error cannot turn into an execution PASS',async()=>{
 const absent=await runA03SignedReadCanary({reader:null,now:()=>Date.parse(NOW)});
 assert.equal(absent.status,'HOLD');
 assert.equal(absent.externalReadInvocations,0);
 const fails=await runA03SignedReadCanary({reader:{execute:async()=>{throw Error('PRIVATE-CREDENTIAL')}} ,now:()=>Date.parse(NOW)});
 assert.equal(fails.status,'HOLD');
 assert.ok(!JSON.stringify(fails).includes('PRIVATE-CREDENTIAL'));
 assert.equal(fails.businessWritesExecuted,0);
});
test('A03 founder-only POST route is registered and refuses unauthorized, CSRF, invalid body or feature off before any reads',async()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/jarvis-a03-read-canary'],'function');
 let reads=0;
 const h=createJarvisA03ReadCanaryHandler({
  getSession:req=>req.fakeSession??null,
  getReader:()=>{reads++;return {execute:async()=>{throw Error('should not execute');}}}
 });
 for(const [session,opts,expected] of [
  [null,{},401],
  [{email:'untrusted@example.org'}, {},403],
  [{email:'shyamsundhar1982@gmail.com'},{flag:'off'},409],
  [{email:'shyamsundhar1982@gmail.com'},{method:'GET'},405],
  [{email:'shyamsundhar1982@gmail.com'},{origin:'https://evil.example.org'},403],
  [{email:'shyamsundhar1982@gmail.com'},{query:'?execute=true'},422],
  [{email:'shyamsundhar1982@gmail.com'},{type:'text/plain'},415],
  [{email:'shyamsundhar1982@gmail.com'},{body:{operation:'VERIFY_SIGNED_SOURCE_READS',confirm:false}},422],
  [{email:'shyamsundhar1982@gmail.com'},{body:{operation:'PAY_VENDOR',confirm:true}},422],
  [{email:'shyamsundhar1982@gmail.com'},{body:{operation:'VERIFY_SIGNED_SOURCE_READS',confirm:true,write:true}},422]
 ]){
  const {state,res}=capture();await h({...request(opts),fakeSession:session},res);
  assert.equal(state.status,expected);
  assert.equal(state.headers['Cache-Control'],'no-store');
 }
 assert.equal(reads,0);
});
test('A03 route displays scoped read-only receipts after explicit founder confirmation',async()=>{
 const rows=await samples(),calls=[];
 const h=createJarvisA03ReadCanaryHandler({
  getSession:()=>({email:'shyamsundhar1982@gmail.com'}),
  getReader:()=>fakeReader(rows,calls),now:()=>Date.parse(NOW)
 });
 const {state,res}=capture();
 await h(request(),res);
 assert.equal(state.status,200);
 assert.equal(state.body.data.status,'BOUNDED_READ_COMPLETE');
 assert.equal(state.body.data.qualificationStatus,'HOLD');
 assert.equal(calls.length,3);
 assert.equal(state.body.data.productionWriteAuthorized,false);
});
