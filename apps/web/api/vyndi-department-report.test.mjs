import test from 'node:test';import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createVyndiDepartmentReportHandler} from './vyndi-department-report.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
const query='?employee=commercial&from=2026-10-01&to=2026-10-15';
const request=(email='shyamsundhar1982@gmail.com',suffix=query,method='GET',env={})=>({
 method,url:'https://vaos.example/api/vyndi-department-report'+suffix,
 headers:{cookie:email?SESSION_COOKIE+'='+createSessionToken(email):''},env
});
function response(){const data={status:200,headers:{},body:null};
 const res={setHeader(k,v){data.headers[k]=v;return res;},status(n){data.status=n;return res;},json(x){data.body=x;return res;}};
 return {res,data};}
test('route is founder only; rejects writes and invalid periods before touching signed source',async()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/vyndi-department-report'],'function');
 const handler=createVyndiDepartmentReportHandler({getStore:()=>{throw Error('SHOULD_NOT_CALL')}});
 for(const [req,status] of [[request(null),401],[request('nobody@example.com'),401],
  [request(undefined,query,'POST'),405],[request(undefined,'?employee=unknown&from=2026-10-01&to=2026-10-15'),422],
  [request(undefined,'?employee=commercial&from=2026-10-20&to=2026-10-21'),422]]){
  const {res,data}=response();await handler(req,res);assert.equal(data.status,status);
 }
});
test('signed source rows are selected without enabling writes',async()=>{
 let signerCalls=0,remoteCalls=0;
 const handler=createVyndiDepartmentReportHandler({getStore:()=>({
  async signVyndiBridgeRequest({keyId}){signerCalls++;return {keyId,signature:'X'.repeat(90)};}
 })});
 const env={VYNDI:{async fetch(_,options){
  remoteCalls++;const input=JSON.parse(options.body);
  assert.equal(input.purpose,'read-observe');assert.equal(input.actionType,'COMMERCIAL.OBSERVE_PIPELINE');
  assert.equal(input.approvalId,null);
  return new Response(JSON.stringify({ok:true,readOnly:true,actionType:input.actionType,
   sourceAuthority:'listSalesOrders',data:{records:[{id:'SO-1',status:'lead',updated_at:'2026-10-11T10:00:00Z'}]}}),{status:200});
 }}};
 const {res,data}=response();await handler(request(undefined,query,'GET',env),res);
 assert.equal(data.status,200);
 assert.equal(data.body.data.datedRecords,1);
 assert.equal(data.body.data.records[0].fields.find(x=>x.field==='id').value,'SO-1');
 assert.equal(data.body.data.readOnly,true);
 assert.equal(signerCalls,1);assert.equal(remoteCalls,1);
});
test('connection failures fail closed without any invented business reports',async()=>{
 const {res,data}=response();await createVyndiDepartmentReportHandler()(
 request(undefined,query,'GET',{}),res);
 assert.equal(data.status,503);
 assert.equal(data.body.data,undefined);
});
