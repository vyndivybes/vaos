import test from 'node:test';
import assert from 'node:assert/strict';
import {repairOriginalSandboxOnce} from './sandbox-repair.mjs';
const marker='VAOSQ_ABCDEF0123456789';
function mock({preflightSafe=true,flowEnabled=false,failTool=null}={}){
  const data=new Map([['ap-qual-state',{status:'HOLD',phase:'REMEDIATION_HOLD',marker}]]);
  const calls=[];
  let repaired=false;
  const store={
    get:async key=>structuredClone(data.get(key)),
    put:async(key,value)=>data.set(key,structuredClone(value)),
    transaction:async(fn)=>{
      const tx={get:async key=>structuredClone(data.get(key)),
        put:async(key,val)=>data.set(key,structuredClone(val))};
      return fn(tx);
    }
  };
  const fullName='VAOS Synthetic Qualification '+marker;
  const flow={id:'flow_12345678',displayName:fullName,status:flowEnabled?'ENABLED':'DISABLED',published:false};
  const client={calls,tools:async()=>[
    'ap_update_trigger','ap_update_step','ap_list_flows','ap_read_step_settings'
  ],call:async(name,args)=>{
    calls.push({name,args});
    if(name===failTool)throw Error('synthetic error');
    if(name==='ap_list_flows')return {structuredContent:{flows:[flow]}};
    if(name==='ap_read_step_settings')return {structuredContent:{pieceName:'@activepieces/piece-webhook',triggerName:'catch_webhook',input:{}}};
    if(name==='ap_update_trigger'||name==='ap_update_step'){
      if(name==='ap_update_step')repaired=true;
      return {structuredContent:{ok:true}};
    }
    throw Error('not allowed');
  }};
  let checked=0;
  const preflight=async()=>{checked++;return !preflightSafe
    ?{status:'HOLD',reason:'AP_PREFLIGHT_STRUCTURE_UNKNOWN',structureOk:false}
    :repaired
    ?{status:'PASS',reason:'AP_SANDBOX_PREFLIGHT_VERIFIED',productionActivation:false,runSubmitted:false,flowIsolated:true}
    :{status:'HOLD',reason:'AP_PREFLIGHT_CONFIGURATION_UNVERIFIED',
      structureOk:true,structureStepNames:['trigger','step_1'],
      structureStepTypes:['PIECE_TRIGGER','CODE'],structureStepCount:'2',
      packageJsonEmpty:true,validationValid:true,validationIssuesCount:'0',triggerOk:false,
      codeMatchesExpected:false,inputMatchesExpected:false,productionActivation:false,runSubmitted:false};
  };
  return {store,client,preflight,calls,getChecks:()=>checked};
}
test('one guarded repair restores original disabled synthetic trigger and code, never executes flow',async()=>{
 const m=mock();
 const out=await repairOriginalSandboxOnce(m);
 assert.equal(out.status,'PASS');
 assert.equal(out.reason,'AP_SANDBOX_REPAIR_READBACK_VERIFIED');
 assert.equal(out.productionActivation,false);
 assert.equal(out.runSubmitted,false);
 assert.equal(m.getChecks(),2);
 assert.deepEqual(m.calls.map(x=>x.name),['ap_list_flows','ap_update_trigger','ap_read_step_settings','ap_update_step']);
 const t=m.calls.find(x=>x.name==='ap_update_trigger').args;
 assert.equal(t.triggerName,'catch_webhook');assert.equal(t.pieceName,'@activepieces/piece-webhook');assert.deepEqual(t.input,{});
 const step=m.calls.find(x=>x.name==='ap_update_step').args;
 assert.equal(step.stepName,'step_1');assert.equal(step.packageJson,'{}');
 assert.equal(step.input.qualMarker,'{{trigger.body.qualMarker}}');
 assert.equal(step.input.value,'{{trigger.body.value}}');
 assert.equal(step.retryOnFailure,false);assert.equal(step.continueOnFailure,false);
 assert.equal(m.calls.some(x=>['ap_test_flow','ap_build_flow','ap_lock_and_publish','ap_change_flow_status'].includes(x.name)),false);
 assert.equal((await m.store.get('ap-qual-state')).status,'HOLD');
});
test('second request cannot rerun Activepieces changes',async()=>{
 const m=mock();assert.equal((await repairOriginalSandboxOnce(m)).status,'PASS');
 const count=m.calls.length;
 const later=await repairOriginalSandboxOnce(m);
 assert.equal(later.status,'HOLD');assert.equal(later.reason,'AP_REPAIR_ALREADY_ADMITTED');
 assert.equal(m.calls.length,count);
});
test('structurally unapproved flow and enabled flow are refused before writes',async()=>{
 for(const settings of [{preflightSafe:false},{flowEnabled:true}]){
  const m=mock(settings);
  const out=await repairOriginalSandboxOnce(m);
  assert.equal(out.status,'HOLD');
  assert.equal(m.calls.some(x=>x.name==='ap_update_trigger'||x.name==='ap_update_step'),false);
 }
});
test('network unknown after trigger change does not retry and never reaches step update',async()=>{
 const m=mock({failTool:'ap_update_trigger'});
 const out=await repairOriginalSandboxOnce(m);
 assert.equal(out.status,'HOLD');
 assert.equal(out.reason,'AP_REPAIR_REMOTE_UNCERTAIN');
 const n=m.calls.length;
 const again=await repairOriginalSandboxOnce(m);
 assert.equal(again.reason,'AP_REPAIR_ALREADY_ADMITTED');
 assert.equal(m.calls.length,n);
});
test('storage without transactional admission fails closed',async()=>{
 const m=mock();delete m.store.transaction;
 const out=await repairOriginalSandboxOnce(m);
 assert.equal(out.status,'HOLD');
 assert.equal(m.calls.some(x=>x.name==='ap_update_trigger'),false);
});
test('post-write mismatch remains HOLD, with no automatic retry',async()=>{
 const m=mock();m.preflight=async()=>({status:'HOLD',reason:'AP_PREFLIGHT_CONFIGURATION_UNVERIFIED',
  structureOk:true,structureStepNames:['trigger','step_1'],structureStepTypes:['PIECE_TRIGGER','CODE'],
  structureStepCount:'2',packageJsonEmpty:true,validationValid:true,
  validationIssuesCount:'0',triggerOk:false,codeMatchesExpected:false,inputMatchesExpected:false,productionActivation:false,runSubmitted:false});
 const out=await repairOriginalSandboxOnce(m);
 assert.equal(out.status,'HOLD');
 assert.equal(out.reason,'AP_REPAIR_READBACK_UNVERIFIED');
});

test('missing Activepieces mutation tools fails closed before consuming one-shot admission',async()=>{
  const m=mock();
  m.client.tools=async()=>['ap_list_flows','ap_read_step_settings'];
  const result=await repairOriginalSandboxOnce(m);
  assert.equal(result.status,'HOLD');
  assert.equal(result.reason,'AP_REPAIR_MUTATION_TOOLS_UNAVAILABLE');
  assert.equal(m.calls.length,0);
  assert.equal(await m.store.get('ap-sandbox-repair-admission-v1'),undefined);
});
