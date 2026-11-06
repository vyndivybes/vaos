import test from 'node:test';
import assert from 'node:assert/strict';
import {createNvidiaOntologyReadinessHandler} from './nvidia-ontology-readiness.mjs';
const founder={email:'shyamsundhar1982@gmail.com'};
const result={schemaVersion:'VAOS_NVIDIA_ONTOLOGY_READINESS_V1',status:'READY',reason:'READINESS_OBSERVED',readOnly:true,
 semanticLayerBuilt:true,connectionPresent:true,catalogPresent:true,sourceDataTransferred:false,
 modelAnswersVerified:false,productionWriteAuthorized:false};
const response=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(n){this.code=n;return this},json(v){this.body=v;return this}});
const request=(method='GET',search='',mode='founder-readonly-v1')=>({
 method,url:'https://vaos.example/api/nvidia/ontology/readiness'+search,headers:{cookie:''},
 env:{VAOS_FEATURE_FLAGS:JSON.stringify({VAOS_NVIDIA_ONTOLOGY_CONTROL:mode})},
});
test('only the founder can check metadata with GET and no arguments',async()=>{
 let called=0;
 for(const [principal,method,search,expected] of [
  [null,'GET','',401],[{email:'other@example.com'},'GET','',403],
  [founder,'POST','',405],[founder,'GET','?url=https://example.com',422]
 ]){
  const handler=createNvidiaOntologyReadinessHandler({getSession:()=>principal,inspect:()=>{called++;return result}});
  const out=response();await handler(request(method,search),out);assert.equal(out.code,expected);
 }
 assert.equal(called,0);
});
test('feature gate disables outbound connection checks',async()=>{
 let called=0;
 const handler=createNvidiaOntologyReadinessHandler({getSession:()=>founder,inspect:()=>{called++;return result}});
 const out=response();await handler(request('GET','','off'),out);
 assert.equal(out.code,200);assert.equal(out.body.data.status,'HOLD');
 assert.equal(out.body.data.reason,'ONTOLOGY_CONTROL_DISABLED');assert.equal(called,0);
});
test('qualified readiness returns metadata only and is never cached',async()=>{
 const handler=createNvidiaOntologyReadinessHandler({getSession:()=>founder,inspect:async()=>result});
 const out=response();await handler(request(),out);
 assert.equal(out.code,200);assert.deepEqual(out.body.data,result);
 assert.equal(out.headers['Cache-Control'],'no-store');
 assert.equal(out.headers['X-Content-Type-Options'],'nosniff');
});
test('provider faults are masked into an explicit HOLD',async()=>{
 const handler=createNvidiaOntologyReadinessHandler({getSession:()=>founder,inspect:async()=>{throw Error('sensitive-detail')}});
 const out=response();await handler(request(),out);
 assert.equal(out.code,200);assert.equal(out.body.data.reason,'ONTOLOGY_PROBE_FAILED');
 assert.doesNotMatch(JSON.stringify(out.body),/sensitive-detail/);
});
