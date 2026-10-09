import {parseActivepiecesToolResult} from './reconcile-existing.mjs';
import {preflightActivepiecesSandbox} from './sandbox-preflight.mjs';
import {auditAppend} from './synthetic-qualification.mjs';

const SOURCE="export const code = async (inputs) => ({qualMarker:inputs.qualMarker,checksum:Number(inputs.value)*7+3,fixtureType:'VAOS_SANDBOX_V1'});";
const fail=reason=>({status:'HOLD',reason,runSubmitted:false,productionActivation:false});
const key='ap-sandbox-step-recovery-v1',originalKey='ap-sandbox-repair-admission-v1';
function originalShape(p){
 return p?.status==='HOLD'&&p.reason==='AP_PREFLIGHT_CONFIGURATION_UNVERIFIED'&&
   p.structureOk===true&&p.triggerOk===true&&p.triggerInputApproved===true&&
   p.packageJsonEmpty===true&&p.validationValid===true&&p.validationIssuesCount==='0'&&
   p.structureStepCount==='2'&&
   JSON.stringify(p.structureStepNames)===JSON.stringify(['trigger','step_1'])&&
   JSON.stringify(p.structureStepTypes)===JSON.stringify(['PIECE_TRIGGER','CODE'])&&
   p.codeMatchesExpected===false&&p.inputMatchesExpected===false&&
   p.runSubmitted===false&&p.productionActivation===false;
}
export async function recoverCodeStepOnce({store,client,preflight=preflightActivepiecesSandbox}={}){
 if(!store?.get||!store?.put||!store?.transaction||!client?.call||!client?.tools)
   return fail('AP_CODE_RECOVERY_DEPENDENCIES_MISSING');
 const state=await store.get('ap-qual-state');
 if(!state||state.status!=='HOLD'||state.phase!=='REMEDIATION_HOLD'||
   !/^VAOSQ_[A-F0-9]{16}$/.test(state.marker||''))
   return fail('AP_CODE_RECOVERY_ORIGINAL_STATE_INVALID');
 if(await store.get(key))return fail('AP_CODE_RECOVERY_ALREADY_ADMITTED');
 const original=await store.get(originalKey);
 if(original?.status!=='ADMITTED'||original.marker!==state.marker)
   return fail('AP_CODE_RECOVERY_ORIGINAL_ADMISSION_UNVERIFIED');
 let candidate;
 try{candidate=await preflight({store,client})}catch{return fail('AP_CODE_RECOVERY_PREFLIGHT_UNAVAILABLE')}
 if(!originalShape(candidate))return fail('AP_CODE_RECOVERY_UNSAFE_OR_UNNEEDED');
 try{
   const available=new Set((await client.tools()).map(x=>typeof x==='string'?x:x?.name));
   if(['ap_update_step','ap_list_flows'].some(x=>!available.has(x)))
     return fail('AP_CODE_RECOVERY_TOOLS_UNAVAILABLE');
 }catch{return fail('AP_CODE_RECOVERY_TOOLS_UNAVAILABLE')}
 let flowId;
 try{
  const name='VAOS Synthetic Qualification '+state.marker;
  const list=parseActivepiecesToolResult(await client.call('ap_list_flows',{name,limit:100}));
  if(!Array.isArray(list.flows)||list.flows.length>=100)return fail('AP_CODE_RECOVERY_FLOW_LIST_UNKNOWN');
  const exact=list.flows.filter(x=>x?.displayName===name&&/^[A-Za-z0-9_-]{6,120}$/.test(x.id||''));
  if(exact.length!==1)return fail('AP_CODE_RECOVERY_FLOW_AMBIGUOUS');
  if(exact[0].status!=='DISABLED'||exact[0].published!==false)return fail('AP_CODE_RECOVERY_FLOW_NOT_ISOLATED');
  flowId=exact[0].id;
 }catch{return fail('AP_CODE_RECOVERY_FLOW_READ_UNAVAILABLE')}
 let admitted=false;
 try{
  admitted=await store.transaction(async tx=>{
    if(await tx.get(key))return false;
    const parent=await tx.get(originalKey);
    if(parent?.status!=='ADMITTED'||parent.marker!==state.marker)return false;
    await tx.put(key,{status:'ADMITTED',marker:state.marker,at:new Date().toISOString()});
    return true;
  });
 }catch{return fail('AP_CODE_RECOVERY_ATOMIC_ADMISSION_FAILED')}
 if(!admitted)return fail('AP_CODE_RECOVERY_ALREADY_ADMITTED');
 try{
  await auditAppend(store,'SANDBOX_CODE_RECOVERY_ADMITTED',{phase:'TRIGGER_DEFAULTS_VERIFIED'});
 }catch{return fail('AP_CODE_RECOVERY_AUDIT_UNAVAILABLE')}
 try{
  const updated=await client.call('ap_update_step',{
   flowId,stepName:'step_1',sourceCode:SOURCE,packageJson:'{}',
   input:{qualMarker:'{{trigger.body.qualMarker}}',value:'{{trigger.body.value}}'},
   skip:false,continueOnFailure:false,retryOnFailure:false
  });
  if(updated?.isError===true)return fail('AP_CODE_RECOVERY_TOOL_REJECTED');
  const read=await preflight({store,client});
  const passed=read?.status==='PASS'&&read.reason==='AP_SANDBOX_PREFLIGHT_VERIFIED'&&
   read.runSubmitted===false&&read.productionActivation===false&&read.flowIsolated===true;
  await store.put(key,{status:passed?'VERIFIED':'HOLD',marker:state.marker,at:new Date().toISOString()});
  await auditAppend(store,'SANDBOX_CODE_RECOVERY_READBACK',{phase:passed?'PREFLIGHT_PASS':'PREFLIGHT_HOLD'});
  return passed?{status:'PASS',reason:'AP_SANDBOX_CODE_READBACK_VERIFIED',
   runSubmitted:false,productionActivation:false,readyForControlledTest:true}
   :fail('AP_CODE_RECOVERY_READBACK_UNVERIFIED');
 }catch{return fail('AP_CODE_RECOVERY_REMOTE_UNCERTAIN')}
}
