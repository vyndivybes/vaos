import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createCloudflareApp,DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
import {createJarvisA01EvidenceHandler} from './jarvis-a01-evidence.mjs';

const founder='shyamsundhar1982@gmail.com';
const report=()=>({
 schemaVersion:'VAOS_JARVIS_A01_SOURCE_RECONCILIATION_V1',mission:'JARVIS-A01',
 status:'HOLD',consistencyGate:'HOLD',businessSourceAuthorityVerified:false,
 readOnly:true,actionAuthorized:false,productionWriteAuthorized:false,aiModelInvocations:0,
 holds:['AUTHORITATIVE_DATABASE_REVISION_REQUIRED'],
 sources:['inventory','shortages','purchaseOrders'].map(sourceKind=>({
  sourceKind,consistency:'HOLD',observationCount:null,contentDigest:null,secondReadDigest:null,
  checkedAt:'2026-11-18T01:00:00.000Z',sourceRevisionAuthority:'CONTENT_DIGEST_ONLY',
  authoritativeRevisionVerified:false,sourceCompletenessVerified:false,
  projectionReconciled:false,readOnly:true,productionWriteAuthorized:false,
  holds:['SIGNED_READ_UNAVAILABLE']
 })),
 specialistReview:{status:'NOT_RUN_SOURCE_GATE_HOLD',readOnly:true,actionAuthorized:false,
 productionWriteAuthorized:false,aiModelInvocations:0,holds:[],findings:[]}
});
function harness({enabled=true,readA01=async()=>report(),store=null}={}){
 const writes=new Map();
 const bucket=store||{async put(k,v,o){if(writes.has(k)||o?.onlyIf?.etagDoesNotMatch!=='*')return null;writes.set(k,v);return {etag:'1'};},
  async get(k){return writes.has(k)?{text:async()=>writes.get(k)}:null;}};
 const app=createCloudflareApp({
  apiHandlers:{'/api/jarvis-a01-evidence':createJarvisA01EvidenceHandler({readA01})},
  runtimeEnv:{VAOS_A01_ARCHIVE_CONTROL:enabled?'founder-manual-archive-v1':'off',VAOS_ARTIFACTS:bucket},
  assetFetcher:async()=>new Response('',{status:404})
 });
 const req=({method='POST',email=founder,origin='https://vaos.local',body={operation:'CAPTURE',confirm:true},url='/api/jarvis-a01-evidence'}={})=>{
  const headers={'content-type':'application/json',origin};
  if(email)headers.cookie=SESSION_COOKIE+'='+createSessionToken(email);
  return new Request('https://vaos.local'+url,{method,headers,...(method==='POST'?{body:JSON.stringify(body)}:{})});
 };
 return {app,req,writes};
}

test('capture API is registered in the Cloudflare worker',()=>{assert.equal(typeof DEFAULT_API_HANDLERS['/api/jarvis-a01-evidence'],'function')});
test('only explicitly consented, same-origin founder captures a HOLD receipt and can replay it',async()=>{
 const h=harness();
 const created=await h.app.fetch(h.req());
 assert.equal(created.status,200);
 const data=(await created.json()).data;
 assert.equal(data.stored,true);
 assert.equal(data.actionAuthorized,false);
 assert.equal(h.writes.size,1);
 assert.equal(created.headers.get('cache-control'),'no-store');
 const read=await h.app.fetch(h.req({method:'GET',url:'/api/jarvis-a01-evidence?receipt='+encodeURIComponent(data.receipt)}));
 assert.equal(read.status,200);
 const v=(await read.json()).data;
 assert.equal(v.evidence.status,'HOLD');
 assert.equal(v.businessSourceAuthorityVerified,false);
 assert.equal(v.integrityVerified,true);
});
test('not logged in, non-founder, CSRF, invalid shape and disabled archive cannot access writer',async()=>{
 const h=harness();
 for(const [opts,status] of [
  [{email:null},401],[{email:'other@example.com'},403],
  [{origin:'https://evil.test'},403],
  [{body:{operation:'CAPTURE',confirm:false}},422],
  [{body:{operation:'APPROVE',confirm:true}},422],
  [{body:{operation:'CAPTURE',confirm:true,raw:'secret'}},422],
  [{url:'/api/jarvis-a01-evidence?execute=true'},422]
 ]){
  const r=await h.app.fetch(h.req(opts));assert.equal(r.status,status,JSON.stringify(opts));
 }
 assert.equal(h.writes.size,0);
 const off=harness({enabled:false});
 assert.equal((await off.app.fetch(off.req())).status,409);
});
test('unavailable independent signed report never records evidence',async()=>{
 const h=harness({readA01:async()=>{throw Error('SOURCE_UNAVAILABLE_PRIVATE')}});
 const x=await h.app.fetch(h.req());
 assert.equal(x.status,503);
 assert.equal(h.writes.size,0);
 assert.doesNotMatch(await x.text(),/PRIVATE/);
});
