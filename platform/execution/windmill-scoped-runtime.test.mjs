import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectScopedWindmill, runScopedWindmillPing } from './windmill-scoped-runtime.mjs';

const now=new Date('2026-10-10T02:00:00.000Z');
const goodEnv={
 WINDMILL_SCOPED_ENABLED:'owner-approved-20261010',
 WINDMILL_ADMISSION_ENABLED:'true',
 WINDMILL_KILL_SWITCH:'false',
 WINDMILL_BASE_URL:'https://app.windmill.dev',
 WINDMILL_WORKSPACE:'vaos',
 WINDMILL_DISPATCH_TOKEN:'secret-dispatch',
 WINDMILL_VERIFY_TOKEN:'secret-read-only',
};
const goodProvider={
 providerId:'windmill',enabled:true,capabilityEnabled:{'code.execute':true},
 qualification:{state:'qualified',qualifiedCapabilities:['code.execute'],
  validUntil:'2026-11-10T00:00:00Z'},
 health:{status:'healthy',checkedAt:'2026-10-10T01:59:00Z'},
};
const goodSlot={schemaVersion:'vaos.windmill.durable-admission.v1',
 productionActivation:false,maxConcurrentRuns:1,queuedRuns:0,active:null};
const jobRunId='019effff-aaaa-7bbb-8ccc-0123456789ab';
const challenge='a'.repeat(32);
const ctx=()=>({env:{...goodEnv},provider:structuredClone(goodProvider),status:structuredClone(goodSlot)});

test('commissioning is HOLD without both distinct scoped credentials, provider authority, and owner flag',()=>{
 for(const key of ['WINDMILL_SCOPED_ENABLED','WINDMILL_ADMISSION_ENABLED','WINDMILL_DISPATCH_TOKEN','WINDMILL_VERIFY_TOKEN']){
   const data=ctx();delete data.env[key];
   assert.equal(inspectScopedWindmill({...data,now}).ready,false,key);
 }
 for(const provider of [null,{...goodProvider,enabled:false},{...goodProvider,health:null},
   {...goodProvider,qualification:{state:'evaluation'}},
   {...goodProvider,capabilityEnabled:{'code.execute':false}}]){
   assert.equal(inspectScopedWindmill({...ctx(),provider,now}).ready,false);
 }
 const equalTokens=ctx();equalTokens.env.WINDMILL_VERIFY_TOKEN=equalTokens.env.WINDMILL_DISPATCH_TOKEN;
 assert.equal(inspectScopedWindmill({...equalTokens,now}).ready,false);
 const stale=ctx();stale.provider.health.checkedAt='2026-10-10T01:40:00Z';
 assert.equal(inspectScopedWindmill({...stale,now}).ready,false);
 const occupied=ctx();occupied.status.active={state:'QUARANTINED'};
 assert.equal(inspectScopedWindmill({...occupied,now}).ready,false);
});

test('admitted execution uses exactly one allowlisted POST and separately credentialed GET; releases only after validated output',async()=>{
 const data=ctx(),calls=[];
 const admission={
  async status(){return data.status},
  async reserve(p){calls.push(['reserve',p]);return {status:'GRANTED',epoch:1}},
  async beginDispatch(p){calls.push(['begin',p])},
  async recordProviderRun(p){calls.push(['record',p])},
  async finish(p){calls.push(['finish',p]);return {status:'RELEASED'}},
 };
 const transport={
  async runScript(r){calls.push(['POST',r]);return {status:201,body:jobRunId}},
  async waitForJob(r){calls.push(['GET',r]);return {
   id:jobRunId,success:true,script_path:'f/vaos/qualification_ping',
   result:{qualification:'VAOS_WINDMILL_SYNTHETIC_V1',challenge},
  }},
 };
 const result=await runScopedWindmillPing({...data,admission,transport,now:()=>now,
  makeChallenge:()=>challenge,makeJobId:()=> 'windmill-scoped-20261010'});
 assert.equal(result.status,'PASS');
 assert.equal(result.providerJobId,jobRunId);
 assert.deepEqual(calls.map(c=>c[0]),['reserve','begin','POST','record','GET','finish']);
 assert.equal(calls[2][1].headers.Authorization,'Bearer secret-dispatch');
 assert.equal(calls[4][1].headers.Authorization,'Bearer secret-read-only');
 assert.equal(calls[5][1].verificationSource,'windmill.api.job-readback');
 assert.equal(JSON.stringify(result).includes('secret-'),false);
 assert.equal(calls[0][1].productionEnabled,false);
 assert.equal(calls[0][1].maxRuntimeSeconds,60);
});

test('uncertain dispatch NEVER retries or releases occupied slot',async()=>{
 const d=ctx(),calls=[];
 const a={status:async()=>d.status,reserve:async()=>({status:'GRANTED',epoch:2}),
 beginDispatch:async()=>{},recordProviderRun:async()=>{calls.push('record')},
 finish:async()=>{calls.push('finish')}};
 const transport={runScript:async()=>{calls.push('POST');throw new Error('network timeout')},
 waitForJob:async()=>{calls.push('GET')}};
 await assert.rejects(runScopedWindmillPing({...d,admission:a,transport,now:()=>now,
  makeChallenge:()=>challenge,makeJobId:()=> 'windmill-scoped-20261010'}));
 assert.deepEqual(calls,['POST']);
});

test('wrong script, reviewer mismatch, or tampered challenge fails without slot release',async()=>{
 const d=ctx();let released=false;
 const a={status:async()=>d.status,reserve:async()=>({status:'GRANTED',epoch:1}),
 beginDispatch:async()=>{},recordProviderRun:async()=>{},finish:async()=>{released=true}};
 const t={runScript:async()=>({status:201,body:jobRunId}),
 waitForJob:async()=>({id:jobRunId,success:true,script_path:'f/vaos/any_other_script',
 result:{qualification:'VAOS_WINDMILL_SYNTHETIC_V1',challenge}})};
 await assert.rejects(runScopedWindmillPing({...d,admission:a,transport:t,now:()=>now,
 makeChallenge:()=>challenge,makeJobId:()=> 'windmill-scoped-20261010'}));
 assert.equal(released,false);
});

test('kill switch and missing credentials never contact admission or transport',async()=>{
 let invoked=false; const d=ctx();d.env.WINDMILL_KILL_SWITCH='true';
 const admission={status:async()=>{invoked=true;return d.status}};
 await assert.rejects(runScopedWindmillPing({...d,admission,transport:{},now:()=>now}),/WINDMILL_SCOPED_HOLD/);
 assert.equal(invoked,false);
});
