import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createEnterpriseBiHandler} from './enterprise-bi.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
const query='?employee=all&from=2026-10-01&to=2026-10-15';
function request(email='shyamsundhar1982@gmail.com',suffix=query,method='GET',env={}){
 return {method,url:'https://vaos.example/api/enterprise-bi'+suffix,
  headers:{cookie:email?SESSION_COOKIE+'='+createSessionToken(email):''},env};
}
function response(){
 const state={status:200,body:null,headers:{}};
 const res={setHeader(k,v){state.headers[k]=v;return res;},
 status(n){state.status=n;return res;},json(v){state.body=v;return res;}};
 return {state,res};
}
test('read-only BI exists and refuses unauthenticated identities or invalid date scope',async()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/enterprise-bi'],'function');
 const handler=createEnterpriseBiHandler({getStore:()=>{throw Error('SIGNER_NOT_ALLOWED')}});
 for(const [req,status] of [
  [request(null),401],[request('someone@example.com'),401],
  [request(undefined,query,'POST'),405],
  [request(undefined,'?employee=wrong&from=2026-10-01&to=2026-10-15'),422],
  [request(undefined,'?employee=finance&from=2024-01-01&to=2026-10-15'),422]
 ]){
  const {state,res}=response();await handler(req,res);
  assert.equal(state.status,status);
 }
});
test('founder queries full-period VYNDI authority via signed read-only service binding',async()=>{
 let signed=0,requested=0;
 const handler=createEnterpriseBiHandler({getStore:()=>({
  async signVyndiBridgeRequest({keyId}){signed++;return {keyId,signature:'X'.repeat(90)};}
 })});
 const env={VYNDI:{async fetch(_,options){
  requested++;
  const input=JSON.parse(options.body);
  assert.equal(input.actionType,'ORCHESTRATOR.OBSERVE_ENTERPRISE_BI');
  assert.equal(input.employeeId,'orchestrator');
  assert.equal(input.input.from,'2026-10-01');
  assert.equal(input.input.to,'2026-10-15');
  assert.equal(input.input.employeeId,'all');
  assert.equal(input.purpose,'read-observe');
  assert.equal(input.approvalId,null);
  return new Response(JSON.stringify({ok:true,readOnly:true,
   actionType:input.actionType,sourceAuthority:'getEnterpriseBusinessIntelligence',
   data:{schemaVersion:'VYNDI_ENTERPRISE_BI_V1',readOnly:true,
    period:{from:'2026-10-01',to:'2026-10-15'},scope:'all',departments:[]}
  }),{status:200});
 }}};
 const {res,state}=response();
 await handler(request(undefined,query,'GET',env),res);
 assert.equal(state.status,200);
 assert.equal(state.body.data.schemaVersion,'VYNDI_ENTERPRISE_BI_V1');
 assert.equal(signed,1);assert.equal(requested,1);
});
test('missing VYNDI bridge cannot produce fabricated BI metrics',async()=>{
 const {state,res}=response();await createEnterpriseBiHandler()(request(undefined,query,'GET',{}),res);
 assert.equal(state.status,503);assert.equal(state.body.data,undefined);
});
