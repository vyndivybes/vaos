import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createCloudflareApp,DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
import {createJarvisA03EvidenceHandler} from './jarvis-a03-evidence.mjs';
const founder='shyamsundhar1982@gmail.com';
function report(){
 return {schemaVersion:'VAOS_JARVIS_A03_SIGNED_READ_CANARY_V1',mission:'JARVIS-A03-MANUAL-READ',
  mode:'FOUNDER_MANUAL_SIGNED_READ',status:'BOUNDED_READ_COMPLETE',qualificationStatus:'HOLD',
  independentBusinessFactsCertified:false,sourceCompletenessVerified:false,
  sameTransactionSnapshotVerified:false,businessSourceAuthorityVerified:false,
  businessWritesExecuted:0,modelCalls:0,productionWriteAuthorized:false,
  actionAuthorized:false,agentDispatchAuthorized:false,readOnly:true,externalReadInvocations:3,
  sources:['inventory','shortages','purchaseOrders'].map((sourceKind,i)=>({
   sourceKind,status:'SIGNED_BOUNDED_OBSERVATION',sourceCount:[1,0,47][i],
   verifiedContentDigest:'a'.repeat(64),asOf:'2026-11-19T06:10:00.000Z',
   authoritativeRevisionVerified:false,sourceCompletenessVerified:false,
   sameTransactionSnapshotVerified:false,productionWriteAuthorized:false})),
  holds:['INDEPENDENT_SOURCE_REVISION_REQUIRED']};
}
function harness({enabled=true,readerFails=false}={}){
 const data=new Map();let calls=0;
 const bucket={
  async put(key,value,o){if(data.has(key)||o?.onlyIf?.etagDoesNotMatch!=='*')return null;data.set(key,value);return {etag:'ok'};},
  async get(key){return data.has(key)?{text:async()=>data.get(key)}:null;}
 };
 const api=createJarvisA03EvidenceHandler({runTrial:async({reader})=>{
  calls++;if(readerFails)throw Error('PRIVATE_CREDENTIAL');
  return report();
 },getReader:()=>({execute:async()=>{throw Error('DO_NOT_EXECUTE')}})});
 const app=createCloudflareApp({apiHandlers:{'/api/jarvis-a03-evidence':api},
  runtimeEnv:{VAOS_ARTIFACTS:bucket,
   VAOS_A03_ARCHIVE_CONTROL:enabled?'founder-manual-archive-v1':'off'},
  assetFetcher:async()=>new Response('not found',{status:404})});
 const request=({method='POST',email=founder,origin='https://vaos.test',
  contentType='application/json',url='/api/jarvis-a03-evidence',
  body={operation:'CAPTURE_FRESH_SIGNED_READ',confirm:true}}={})=>{
  const headers={'content-type':contentType,origin};
  if(email)headers.cookie=SESSION_COOKIE+'='+createSessionToken(email);
  return new Request('https://vaos.test'+url,{method,headers,
   ...(method==='POST'?{body:JSON.stringify(body)}:{})});
 };
 return {app,request,data,get calls(){return calls;}};
}
test('A03 durable capture is a separate registered founder-only route and reads SERVER evidence, not client claims',async()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/jarvis-a03-evidence'],'function');
 const h=harness();
 const response=await h.app.fetch(h.request({body:{confirm:true,operation:'CAPTURE_FRESH_SIGNED_READ'}}));
 assert.equal(response.status,200);
 const saved=(await response.json()).data;
 assert.equal(saved.stored,true);
 assert.equal(saved.status,'HOLD');
 assert.equal(saved.boundedReadCompleted,true);
 assert.equal(saved.actionAuthorized,false);
 assert.equal(saved.productionWriteAuthorized,false);
 assert.equal(h.calls,1);
 assert.equal(h.data.size,1);
 assert.equal(response.headers.get('cache-control'),'no-store');
 const read=await h.app.fetch(h.request({method:'GET',url:'/api/jarvis-a03-evidence?receipt='+encodeURIComponent(saved.receipt)}));
 assert.equal(read.status,200);
 const result=(await read.json()).data;
 assert.equal(result.integrityVerified,true);
 assert.equal(result.independentSignatureVerified,false);
 assert.deepEqual(result.evidence.sources.map(s=>s.sourceCount),[1,0,47]);
 assert.equal(result.businessSourceAuthorityVerified,false);
 assert.equal(h.calls,1,'GET must not execute another signed bridge read');
});
test('A03 archive rejects unauthenticated, wrong principal, unconsented, CSRF, and oversized/shaped inputs before source execution',async()=>{
 const h=harness();
 for(const [args,status] of [
  [{email:null},401],[{email:'other@example.org'},401],
  [{origin:'https://evil.example.org'},403],
  [{contentType:'text/plain'},415],
  [{url:'/api/jarvis-a03-evidence?write=true'},422],
  [{body:{operation:'CAPTURE_FRESH_SIGNED_READ',confirm:false}},422],
  [{body:{operation:'CAPTURE_FRESH_SIGNED_READ',confirm:true,purchaseOrderId:'PRIVATE-PO'}},422],
  [{body:{operation:'CERTIFY_DATABASE',confirm:true}},422],
  [{method:'PUT'},405]
 ]){
  const x=await h.app.fetch(h.request(args));
  assert.equal(x.status,status,JSON.stringify(args));
 }
 assert.equal(h.data.size,0);assert.equal(h.calls,0);
 const off=harness({enabled:false});assert.equal((await off.app.fetch(off.request())).status,409);
 assert.equal(off.calls,0);assert.equal(off.data.size,0);
});
test('A03 archive cannot claim success when fresh server-side read fails and must not leak secrets',async()=>{
 const h=harness({readerFails:true});
 const r=await h.app.fetch(h.request());
 assert.equal(r.status,503);
 const body=await r.text();
 assert.ok(!body.includes('PRIVATE_CREDENTIAL'));
 assert.equal(h.data.size,0);
});
test('A03 archive refuses unauthorized, malformed and unrecognised GET receipt lookups',async()=>{
 const h=harness();
 for(const [args,status] of [
  [{method:'GET',email:null,url:'/api/jarvis-a03-evidence?receipt=x'},401],
  [{method:'GET',email:'other@example.org',url:'/api/jarvis-a03-evidence?receipt=x'},401],
  [{method:'GET',url:'/api/jarvis-a03-evidence?receipt=../private'},422],
  [{method:'GET',url:'/api/jarvis-a03-evidence?receipt=abc'},422],
  [{method:'GET',url:'/api/jarvis-a03-evidence?receipt=abc&execute=true'},422]
 ])assert.equal((await h.app.fetch(h.request(args))).status,status);
 assert.equal(h.calls,0);
});
