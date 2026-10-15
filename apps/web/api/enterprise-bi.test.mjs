import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnterpriseBiHandler} from './enterprise-bi.mjs';
function res(){
 return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},
  status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};
}
const query='?from=2026-10-01&to=2026-10-15';
function req(q=query,env={VYNDI:{fetch(){}}}){
 return {method:'GET',url:'https://vaos.local/api/enterprise-bi'+q,headers:{cookie:''},env};
}
const founder=()=>({email:'shyamsundhar1982@gmail.com'});
test('strict founder boundary rejects unauthenticated and nonfounder',async()=>{
 const a=res(),b=res();
 await createEnterpriseBiHandler({sessionVerifier:()=>null})(req(),a);
 await createEnterpriseBiHandler({sessionVerifier:()=>({email:'other@example.com'})})(req(),b);
 assert.equal(a.statusCode,401);assert.equal(b.statusCode,403);
});
test('invalid reporting scope rejected before bridge access',async()=>{
 let called=false;
 const handler=createEnterpriseBiHandler({sessionVerifier:founder,
  bridgeFactory:()=>({execute(){called=true;throw Error('unexpected')}})});
 for(const q of ['?from=2026-02-30&to=2026-10-15',
  '?from=2026-10-01&to=2026-10-15&employee=malicious',
  '?from=2026-10-01&to=2026-10-15&offset=-1',
  '?from=2024-10-01&to=2026-10-15']){
  const r=res();await handler(req(q),r);assert.equal(r.statusCode,422);
 }
 assert.equal(called,false);
});
test('missing VYNDI binding remains unavailable, not zero',async()=>{
 const r=res();await createEnterpriseBiHandler({sessionVerifier:founder})(req(query,{}),r);
 assert.equal(r.statusCode,503);
 assert.equal(r.body?.error?.code,'VYNDI_SOURCE_UNAVAILABLE');
});
test('signed date scope and all employee ledgers are returned without fictional projections',async()=>{
 let job;
 const response={schemaVersion:'VYNDI_ENTERPRISE_BI_V1',readOnly:true,
  period:{from:'2026-10-01',to:'2026-10-15'},scope:'all',
  departments:[{employeeId:'finance',status:'UNAVAILABLE'}]};
 const handler=createEnterpriseBiHandler({sessionVerifier:founder,getStore:()=>({}),
  bridgeFactory:()=>({execute:async x=>{job=x;return {data:response};}})});
 const r=res();await handler(req(),r);
 assert.equal(r.statusCode,200);assert.deepEqual(r.body.data,response);
 assert.equal(job.actionType,'ORCHESTRATOR.OBSERVE_ENTERPRISE_BI');
 assert.equal(job.payload.employeeId,'all');
});
test('invalid or tampered signed bridge response fails closed',async()=>{
 const handler=createEnterpriseBiHandler({sessionVerifier:founder,getStore:()=>({}),
  bridgeFactory:()=>({execute:async()=>({data:{readOnly:true,departments:[]}})})});
 const r=res();await handler(req(),r);assert.equal(r.statusCode,503);
});
