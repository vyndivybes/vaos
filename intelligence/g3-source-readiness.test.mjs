import test from 'node:test';
import assert from 'node:assert/strict';
import {G3_REQUIRED_READS,assessG3SourceReadiness} from './g3-source-readiness.mjs';
import {createG3ReadinessHandler} from '../apps/web/api/jarvis-g3-readiness.mjs';
import {createSessionToken,SESSION_COOKIE} from '../apps/web/lib/auth.mjs';
const at='2026-10-13T03:20:00.000Z';
const observations=G3_REQUIRED_READS.map(x=>({
 domain:x.domain,actionType:x.actionType,sourceAuthority:x.authority,
 status:'OBSERVED',gatewayReadAt:at
}));
test('G3.1 source matrix pins exactly four governed read routes and disallows writes',()=>{
 assert.deepEqual(G3_REQUIRED_READS.map(x=>x.domain),['PROCUREMENT','INVENTORY','PRODUCTION','ENGINEERING']);
 assert.equal(G3_REQUIRED_READS.length,4);
 assert.equal(G3_REQUIRED_READS.every(x=>x.effectClass==='read'&&x.executionEnabled===true),true);
 assert.equal(G3_REQUIRED_READS.every(x=>typeof x.sourceFile==='string'&&x.sourceFile.length>10),true);
});
test('G3.1 admitted reads are retrieval receipts, never authoritative production parameters',()=>{
 const x=assessG3SourceReadiness(observations,{now:Date.parse(at)+2000});
 assert.equal(x.status,'INPUT_QUALIFICATION_HOLD');
 assert.equal(x.observedSourceCount,4);
 assert.equal(x.gatewayReadCoverage,4);
 assert.equal(x.canRunRealDataOptimizer,false);
 assert.equal(x.productionForecastCertified,false);
 assert.equal(x.actionAuthorized,false);
 assert.equal(x.calibratedWithOutcomes,false);
 assert.equal(x.detailedVedmVibpeProofAvailable,false);
 assert.ok(x.holds.includes('SOURCE_REVISION_PROOF_REQUIRED'));
 assert.ok(x.holds.includes('RESOURCE_CAPACITY_UNITS_REQUIRED'));
 assert.ok(x.holds.includes('BACKTEST_HISTORY_REQUIRED'));
 assert.ok(x.holds.includes('G2B_INDEPENDENT_RECOVERY_HOLD'));
 assert.equal(x.sources.every(v=>v.gatewayReceipt==='RECENT_GATEWAY_READ'),true);
 assert.equal(x.sources.every(v=>v.sourceDataFreshnessVerified===false),true);
 assert.equal(x.sources.every(v=>v.numericInputsQualified===false),true);
 assert.equal(x.modelInvocations,0);
});
test('G3.1 rejects forged contracts, extra content, malformed receipts and unknown status',()=>{
 const alteration=(row)=>[row,...observations.slice(1)];
 for(const evil of [
  {...observations[0],sourceAuthority:'some-other-tenant'},
  {...observations[0],actionType:'PROCUREMENT.CREATE_PO'},
  {...observations[0],rawRecord:{customerEmail:'private@example.com'}},
  {...observations[0],status:'CERTIFIED'},
 ])assert.throws(()=>assessG3SourceReadiness(alteration(evil),{now:Date.parse(at)+2000}),/G3_READINESS_INVALID/);
 const missing=assessG3SourceReadiness(observations.slice(0,3),{now:Date.parse(at)+2000});
 assert.equal(missing.canRunRealDataOptimizer,false);
 assert.ok(missing.holds.includes('ENGINEERING_READ_HOLD'));
 const future=assessG3SourceReadiness(observations.map(x=>({...x,gatewayReadAt:'2099-01-01T00:00:00.000Z'})),{now:Date.parse(at)});
 assert.equal(future.gatewayReadCoverage,0);
 assert.equal(future.canRunRealDataOptimizer,false);
});
test('G3.1 founder-only handler executes no more than 4 signed reads and leaks zero source rows',async()=>{
 const calls=[];
 const getReader=()=>({execute:async request=>{
  calls.push(request);
  const route=G3_REQUIRED_READS.find(x=>x.actionType===request.actionType);
  return {actionType:request.actionType,sourceAuthority:route.authority,
   data:{records:[{email:'secret@vayushastr.com',price:976543,engineeringRelease:'approved'}]},
   gatewayReadAt:'2099-01-01T00:00:00.000Z'};
 }});
 const h=createG3ReadinessHandler({getReader,now:()=>Date.parse(at)+2000});
 const req={method:'GET',url:'https://vaos.test/api/jarvis-g3-readiness',
  headers:{cookie:SESSION_COOKIE+'='+createSessionToken('shyamsundhar1982@gmail.com')},
  env:{VAOS_VOICE_CONTROL:'founder-readonly-browser-v1'}};
 const collect=()=>{const state={code:200,result:null};
  const res={setHeader(){return res},status(n){state.code=n;return res},json(x){state.result=x;return res}};
  return {state,res};};
 for(const [v,code] of [[{...req,headers:{}},401],[{...req,method:'POST'},405],[{...req,env:{}},409]]){
  const {state,res}=collect();await h(v,res);assert.equal(state.code,code);
 }
 assert.equal(calls.length,0);
 const {state,res}=collect();await h(req,res);
 assert.equal(state.code,200);assert.equal(calls.length,4);
 assert.equal(state.result.data.status,'INPUT_QUALIFICATION_HOLD');
 assert.equal(state.result.data.gatewayReadCoverage,4);
 assert.equal(state.result.data.canRunRealDataOptimizer,false);
 assert.equal(state.result.data.actionAuthorized,false);
 assert.doesNotMatch(JSON.stringify(state.result),/secret@|976543|engineeringRelease|2099|rawRecord/);
 assert.equal(calls.every(x=>x.actionType.endsWith('.OBSERVE_SHORTAGE')||
   x.actionType.endsWith('.OBSERVE_STOCK')||x.actionType.endsWith('.OBSERVE_WIP')||
   x.actionType.endsWith('.OBSERVE_CONFIGURATION')),true);
});
test('G3.1 unavailable or authority-mismatched source produces explicit HOLD rather than optimistic scenario',async()=>{
 const calls=[];
 const h=createG3ReadinessHandler({getReader:()=>({execute:async job=>{
   calls.push(job.actionType);
   if(job.actionType==='PRODUCTION.OBSERVE_WIP')throw Error('private data!');
   if(job.actionType==='ENGINEERING.OBSERVE_CONFIGURATION')return {actionType:job.actionType,sourceAuthority:'wrong-source'};
   const route=G3_REQUIRED_READS.find(x=>x.actionType===job.actionType);
   return {actionType:job.actionType,sourceAuthority:route.authority,data:{records:[]}};
  }}),now:()=>Date.parse(at)});
 const req={method:'GET',url:'https://vaos.test/api/jarvis-g3-readiness',
  headers:{cookie:SESSION_COOKIE+'='+createSessionToken('shyamsundhar1982@gmail.com')},
  env:{VAOS_VOICE_CONTROL:'founder-readonly-browser-v1'}};
 const state={code:200,payload:null};
 const res={setHeader(){return res},status(n){state.code=n;return res},json(v){state.payload=v;return res}};
 await h(req,res);
 assert.equal(state.code,200);
 assert.equal(calls.length,4);
 assert.equal(state.payload.data.observedSourceCount,2);
 assert.ok(state.payload.data.holds.includes('ENGINEERING_READ_HOLD'));
 assert.ok(state.payload.data.holds.includes('PRODUCTION_READ_HOLD'));
 assert.doesNotMatch(JSON.stringify(state.payload),/private data|wrong-source/);
});
