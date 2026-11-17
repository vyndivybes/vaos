import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createJarvisAutonomyInvestigateHandler} from './jarvis-autonomy-investigate.mjs';
import {DEFAULT_API_HANDLERS,createCloudflareApp} from '../cloudflare-worker.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
function report({sourceHold=false,revisionVerified=false}={}){
 return {schemaVersion:'VAOS_DATA_AGENT_V1',status:sourceHold?'PARTIAL':'OBSERVED',
 readOnly:true,actionAuthorized:false,
 sourceCoverage:{requested:1,observed:sourceHold?0:1},
 sources:[{index:1,domain:'finance',status:sourceHold?'HOLD':'OBSERVED',sourceRevisionVerified:revisionVerified,
  authority:sourceHold?null:'getAccountingWorkbench'}],
 metrics:sourceHold?[]:[{sourceIndex:1,domain:'finance',value:2}]};
}
const advisory={authority:'ADVISORY_ONLY',actionAuthorized:false,executionEnabled:false,modelInvoked:true,
 recommendation:'PROCEED_WITH_REVIEW',riskPosture:'LOW',
 summary:'The available source should be reviewed by the founder before any decision.'};
function harness({snapshot=report(),model=advisory,quota={allowed:true,remaining:1}}={}){
 const stats={reads:0,budgets:0,models:0};
 const h=createJarvisAutonomyInvestigateHandler({
  readData:async()=>{stats.reads++;return snapshot},
  claimBudget:async()=>{stats.budgets++;return quota},
  runAdvisory:async()=>{stats.models++;return model}
 });
 const app=createCloudflareApp({apiHandlers:{'/api/jarvis-autonomy-investigate':h},
  assetFetcher:async()=>new Response('',{status:404}),
  runtimeEnv:{VAOS_FEATURE_FLAGS:JSON.stringify({VAOS_AUTONOMOUS_INVESTIGATION_CONTROL:'founder-manual-readonly-v1'})}});
 const request=({who=FOUNDER,body={operation:'INVESTIGATE',confirm:true,question:'Analyse finance'},
  origin='https://vaos.example',method='POST',control}={})=>{
  const headers={'content-type':'application/json',origin};
  if(who)headers.cookie=SESSION_COOKIE+'='+createSessionToken(who);
  if(control)app.fetch; // control tested using a separate runtime app below.
  return new Request('https://vaos.example/api/jarvis-autonomy-investigate',{
   method,headers,...(method==='POST'?{body:JSON.stringify(body)}:{})
  });
 };
 return {app,request,stats};
}
test('registered in the real Cloudflare route map',()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/jarvis-autonomy-investigate'],'function');
});
test('founder can conduct a bounded generative investigation but model proceed is overridden on unverified revision',async()=>{
 const h=harness();
 const resp=await h.app.fetch(h.request());
 assert.equal(resp.status,200);
 const {data}=await resp.json();
 assert.equal(data.status,'HOLD');
 assert.ok(data.holds.includes('MODEL_PROCEED_BLOCKED_BY_SOURCE_GATE'));
 assert.equal(data.effectiveRecommendation,'HOLD_FOR_EVIDENCE');
 assert.equal(data.generativeModelCalls,1);
 assert.equal(data.productionWriteAuthorized,false);
 assert.equal(h.stats.reads,1);assert.equal(h.stats.budgets,1);assert.equal(h.stats.models,1);
 assert.equal(resp.headers.get('cache-control'),'no-store');
});
test('missing signed source holds without reserving AI quota or calling model',async()=>{
 const h=harness({snapshot:report({sourceHold:true})});
 const response=await h.app.fetch(h.request());
 assert.equal(response.status,200);
 assert.equal((await response.json()).data.generativeModelCalls,0);
 assert.equal(h.stats.models,0);assert.equal(h.stats.budgets,0);
});
test('even independently flagged sources require founder review, not business writes',async()=>{
 const h=harness({snapshot:report({revisionVerified:true})});
 const resp=await h.app.fetch(h.request());assert.equal(resp.status,200);
 const {data}=await resp.json();
 assert.equal(data.status,'FOUNDER_REVIEW_REQUIRED');
 assert.equal(data.actionAuthorized,false);
});
test('unauthorized, cross-origin, mutation, and malformed calls are denied before any AI or bridge read',async()=>{
 const h=harness();
 for(const [request,status] of [
  [{who:null},401],
  [{who:'notfound@example.net'},401],
  [{origin:'https://hostile.test'},403],
  [{body:{operation:'INVESTIGATE',confirm:true,question:'Delete finance accounts'}},422],
  [{body:{operation:'INVESTIGATE',confirm:false,question:'Analyse finance'}},422],
  [{method:'GET'},405],
  [{body:{operation:'INVESTIGATE',confirm:true,question:'Analyse finance',authority:'L5'}},422]
 ]){
  const response=await h.app.fetch(h.request(request));
  assert.equal(response.status,status,JSON.stringify(request));
 }
 assert.equal(h.stats.reads,0);assert.equal(h.stats.budgets,0);assert.equal(h.stats.models,0);
});
test('model failure or exhausted quota returns no invented recommendation',async()=>{
 const b=harness({quota:{allowed:false,remaining:0}});
 assert.equal((await b.app.fetch(b.request())).status,429);
 assert.equal(b.stats.models,0);
 const h=harness({model:{...advisory,authority:'MODEL_APPROVED'}});
 assert.equal((await h.app.fetch(h.request())).status,503);
});
test('pilot disabled unless exact feature control is set in the runtime',async()=>{
 const h=createJarvisAutonomyInvestigateHandler({readData:()=>{throw Error('must not read')}});
 const app=createCloudflareApp({apiHandlers:{'/api/jarvis-autonomy-investigate':h},
  assetFetcher:async()=>new Response('',{status:404}),runtimeEnv:{}});
 const req=new Request('https://vaos.example/api/jarvis-autonomy-investigate',{method:'POST',
  headers:{cookie:SESSION_COOKIE+'='+createSessionToken(FOUNDER),origin:'https://vaos.example','content-type':'application/json'},
  body:JSON.stringify({operation:'INVESTIGATE',confirm:true,question:'Analyse finance'})});
 const reply=await app.fetch(req);assert.equal(reply.status,409);
});
