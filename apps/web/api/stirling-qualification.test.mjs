import test from 'node:test';
import assert from 'node:assert/strict';
import {createStirlingQualificationHandler} from './stirling-qualification.mjs';
const url='https://vaos.vayushastr.workers.dev';
const runPath='/api/stirling-qualification/run',statusPath='/api/stirling-qualification/status';
const mock=({verify=async()=>({runId:'123'}),execute=async()=>({status:'PASS',outputSha256:'a'.repeat(64),auditVerified:true}),
  getEvidence=async()=>({status:'HOLD',reason:'STIRLING_NOT_EXECUTED',productionActivation:false})}={})=>
    createStirlingQualificationHandler({verify,execute,getEvidence});
const request=(path,method,headers={},body)=>({url:url+path,method,headers,body,env:{}});
test('untrusted callers cannot start Stirling Cloud transformations',async()=>{
  let touched=false;
  const handler=mock({execute:async()=>{touched=true;return {status:'PASS'}}});
  const unauth=await handler(request(runPath,'POST',{'content-type':'application/json'},
    {confirm:'run-synthetic-stirling-cloud-once'}));
  assert.equal(unauth.status,403);
  const invalid=mock({verify:async()=>{throw new Error('invalid signature')},
    execute:async()=>{touched=true}});
  const bad=await invalid(request(runPath,'POST',{authorization:'Bearer bad',
    'content-type':'application/json'},{confirm:'run-synthetic-stirling-cloud-once'}));
  assert.equal(bad.status,403);
  assert.equal(touched,false);
});
test('authorized exact synthetic request returns redacted verified evidence and no production activation',async()=>{
  let calls=0;
  const handler=mock({execute:async input=>{calls++;assert.equal(input.githubRunId,'123');return {
    providerId:'stirling-pdf',status:'PASS',outputSha256:'b'.repeat(64),auditVerified:true,
    productionActivation:false};}});
  const response=await handler(request(runPath,'POST',{authorization:'Bearer signed.oidc.token',
    'content-type':'application/json'},{confirm:'run-synthetic-stirling-cloud-once'}));
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.status,'PASS');assert.equal(result.productionActivation,false);
  assert.equal(calls,1);
});
test('invalid payload cannot cause authenticated transform; status reader is read-only',async()=>{
  let calls=0;
  const handler=mock({execute:async()=>{calls++;return {status:'PASS'}}});
  const bad=await handler(request(runPath,'POST',{authorization:'Bearer signed.token',
    'content-type':'application/json'},{confirm:'wrong'}));
  assert.equal(bad.status,422);
  const status=await handler(request(statusPath,'GET'));
  assert.equal((await status.json()).reason,'STIRLING_NOT_EXECUTED');
  assert.equal(calls,0);
});
