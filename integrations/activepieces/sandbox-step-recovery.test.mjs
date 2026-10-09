import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverCodeStepOnce} from './sandbox-step-recovery.mjs';

const marker='VAOSQ_ABCDEF0123456789',flowId='flow_12345678';
function fixture({isolated=true,triggerApproved=true,priorAdmission='ADMITTED',otherCode=false,failUpdate=false}={}){
  const data=new Map([['ap-qual-state',{status:'HOLD',phase:'REMEDIATION_HOLD',marker}],
    ['ap-sandbox-repair-admission-v1',{status:priorAdmission,marker}]]);
  const calls=[];let modified=false;const audit=[];
  const store={
    get:async key=>structuredClone(data.get(key)),
    put:async(k,v)=>{data.set(k,structuredClone(v))},
    transaction:async fn=>fn({
      get:async key=>structuredClone(data.get(key)),
      put:async(k,v)=>{data.set(k,structuredClone(v))}
    })
  };
  const client={
    tools:async()=>['ap_update_step','ap_list_flows','ap_read_step_code'],
    call:async(name,args)=>{
      calls.push({name,args});
      if(name==='ap_list_flows')return {structuredContent:{flows:[{
        id:flowId,displayName:'VAOS Synthetic Qualification '+marker,
        status:isolated?'DISABLED':'ENABLED',published:false}]}};
      if(name==='ap_update_step'){
        if(failUpdate)throw Error('upstream timeout');
        modified=true;return {structuredContent:{ok:true}};
      }
      throw Error('unrecognized mock tool');
    }
  };
  const preflight=async()=>{
    const base={status:'HOLD',reason:'AP_PREFLIGHT_CONFIGURATION_UNVERIFIED',
      runSubmitted:false,productionActivation:false,
      structureOk:true,structureStepNames:['trigger','step_1'],
      structureStepTypes:['PIECE_TRIGGER','CODE'],structureStepCount:'2',
      packageJsonEmpty:true,validationValid:true,validationIssuesCount:'0',
      triggerOk:triggerApproved,triggerInputApproved:triggerApproved,
      codeMatchesExpected:otherCode||modified,inputMatchesExpected:modified};
    if(modified)return {...base,status:'PASS',reason:'AP_SANDBOX_PREFLIGHT_VERIFIED',flowIsolated:true};
    return base;
  };
  return {store,client,preflight,calls,audit};
}
test('consumed trigger repair continues with exactly one code step update, no trigger mutation or test',async()=>{
 const fx=fixture();
 const result=await recoverCodeStepOnce(fx);
 assert.equal(result.status,'PASS');
 assert.equal(result.reason,'AP_SANDBOX_CODE_READBACK_VERIFIED');
 assert.equal(result.runSubmitted,false);
 assert.equal(result.productionActivation,false);
 assert.deepEqual(fx.calls.map(c=>c.name),['ap_list_flows','ap_update_step']);
 const a=fx.calls[1].args;
 assert.equal(a.stepName,'step_1');assert.equal(a.sourceCode.includes('checksum:Number(inputs.value)*7+3'),true);
 assert.deepEqual(a.input,{qualMarker:'{{trigger.body.qualMarker}}',value:'{{trigger.body.value}}'});
 assert.equal(a.packageJson,'{}');assert.equal(a.retryOnFailure,false);
 assert.equal((await fx.store.get('ap-qual-state')).status,'HOLD');
 assert.equal((await fx.store.get('ap-sandbox-repair-admission-v1')).status,'ADMITTED');
});
test('one-shot code step recovery admission is not replayed',async()=>{
 const fx=fixture();assert.equal((await recoverCodeStepOnce(fx)).status,'PASS');
 const prior=fx.calls.length;
 const r=await recoverCodeStepOnce(fx);
 assert.equal(r.status,'HOLD');assert.equal(r.reason,'AP_CODE_RECOVERY_ALREADY_ADMITTED');
 assert.equal(fx.calls.length,prior);
});
test('unsafe trigger, changed original admission, enabled flow and already modified code all fail closed',async()=>{
 for(const options of [
  {triggerApproved:false},{priorAdmission:'VERIFIED'},
  {priorAdmission:'NOT_ADMITTED'},{isolated:false},
  {otherCode:true}
 ]){
  const fx=fixture(options);
  const result=await recoverCodeStepOnce(fx);
  assert.equal(result.status,'HOLD',JSON.stringify(options));
  assert.equal(fx.calls.some(x=>x.name==='ap_update_step'),false,JSON.stringify(options));
  assert.equal(await fx.store.get('ap-sandbox-step-recovery-v1'),undefined);
 }
});
test('upstream ambiguous failure consumes single code-recovery admission; no retries',async()=>{
 const fx=fixture({failUpdate:true});
 const out=await recoverCodeStepOnce(fx);
 assert.equal(out.status,'HOLD');assert.equal(out.reason,'AP_CODE_RECOVERY_REMOTE_UNCERTAIN');
 assert.equal((await recoverCodeStepOnce(fx)).reason,'AP_CODE_RECOVERY_ALREADY_ADMITTED');
 assert.equal(fx.calls.filter(x=>x.name==='ap_update_step').length,1);
});
test('without atomic transaction or authenticated tool schema nothing may be written',async()=>{
 const fx=fixture();delete fx.store.transaction;
 assert.equal((await recoverCodeStepOnce(fx)).status,'HOLD');
 assert.equal(fx.calls.length,0);
 const fy=fixture();fy.client.tools=async()=>[];
 assert.equal((await recoverCodeStepOnce(fy)).reason,'AP_CODE_RECOVERY_TOOLS_UNAVAILABLE');
 assert.equal(fy.calls.length,0);
});
