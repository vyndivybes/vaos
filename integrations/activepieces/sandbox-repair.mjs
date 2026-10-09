import {parseActivepiecesToolResult} from './reconcile-existing.mjs';
import {preflightActivepiecesSandbox} from './sandbox-preflight.mjs';
import {auditAppend} from './synthetic-qualification.mjs';

const SOURCE="export const code = async (inputs) => ({qualMarker:inputs.qualMarker,checksum:Number(inputs.value)*7+3,fixtureType:'VAOS_SANDBOX_V1'});";
const fail=(reason)=>({status:'HOLD',reason,runSubmitted:false,productionActivation:false});
const key='ap-sandbox-repair-admission-v1';
const names=['trigger','step_1'],types=['PIECE_TRIGGER','CODE'];
const isSafePreflight=r=>r?.status==='HOLD'&&
  r.reason==='AP_PREFLIGHT_CONFIGURATION_UNVERIFIED'&&
  r.structureOk===true&&r.packageJsonEmpty===true&&r.validationValid===true&&
  r.validationIssuesCount==='0'&&r.structureStepCount==='2'&&
  JSON.stringify(r.structureStepNames)===JSON.stringify(names)&&
  JSON.stringify(r.structureStepTypes)===JSON.stringify(types)&&
  r.productionActivation===false&&r.runSubmitted===false;

export async function repairOriginalSandboxOnce({store,client,preflight=preflightActivepiecesSandbox}={}){
  if(!store?.get||!store?.put||!store?.transaction||!client?.call||typeof preflight!=='function')
    return fail('AP_REPAIR_ATOMIC_STORAGE_UNAVAILABLE');
  const state=await store.get('ap-qual-state');
  if(!state||state.status!=='HOLD'||state.phase!=='REMEDIATION_HOLD'||
    !/^VAOSQ_[0-9A-F]{16}$/.test(state.marker||''))
    return fail('AP_REPAIR_ORIGINAL_STATE_UNVERIFIED');
  // The persisted barrier is always checked before provider access.
  if(await store.get(key))return fail('AP_REPAIR_ALREADY_ADMITTED');
  let original;
  try{original=await preflight({store,client})}catch{return fail('AP_REPAIR_PREFLIGHT_UNAVAILABLE')}
  if(!isSafePreflight(original))return fail('AP_REPAIR_UNSAFE_OR_UNNEEDED');
  // Discover the actual Activepieces mutation capabilities BEFORE irrevocably
  // consuming the single repair admission. A read-only OAuth grant may expose
  // readback tools but no update methods; never burn admission on that account.
  try{
    if(typeof client.tools!=='function')return fail('AP_REPAIR_MUTATION_TOOLS_UNAVAILABLE');
    const tools=new Set((await client.tools()).map(t=>typeof t==='string'?t:t?.name));
    if(['ap_update_trigger','ap_update_step','ap_read_step_settings','ap_list_flows']
      .some(name=>!tools.has(name)))return fail('AP_REPAIR_MUTATION_TOOLS_UNAVAILABLE');
  }catch{return fail('AP_REPAIR_MUTATION_TOOLS_UNAVAILABLE')}
  let flowId;
  try{
    const displayName='VAOS Synthetic Qualification '+state.marker;
    const list=parseActivepiecesToolResult(await client.call('ap_list_flows',{name:displayName,limit:100}));
    if(!Array.isArray(list.flows)||list.flows.length>=100)return fail('AP_REPAIR_FLOW_LIST_UNKNOWN');
    const exact=list.flows.filter(f=>f?.displayName===displayName&&/^[A-Za-z0-9_-]{6,120}$/.test(f.id||''));
    if(exact.length!==1)return fail('AP_REPAIR_FLOW_AMBIGUOUS');
    if(exact[0].status!=='DISABLED'||exact[0].published!==false)return fail('AP_REPAIR_FLOW_NOT_ISOLATED');
    flowId=exact[0].id;
  }catch{return fail('AP_REPAIR_FLOW_READ_UNAVAILABLE')}
  let admitted=false;
  try{
    // Cloudflare DO atomic transaction prevents two requests from claiming the same test-only repair.
    admitted=await store.transaction(async tx=>{
      if(await tx.get(key))return false;
      await tx.put(key,{status:'ADMITTED',at:new Date().toISOString(),marker:state.marker});
      return true;
    });
  }catch{return fail('AP_REPAIR_ADMISSION_UNAVAILABLE')}
  if(!admitted)return fail('AP_REPAIR_ALREADY_ADMITTED');
  try{
    await auditAppend(store,'SANDBOX_REPAIR_ADMITTED',{phase:'READONLY_PREFLIGHT_VERIFIED'});
  }catch{return fail('AP_REPAIR_AUDIT_UNAVAILABLE')}
  try{
    // Both tools modify only this original DISABLED, unpublished synthetic flow.
    // They do not publish, enable, or run it.
    const trigger=await client.call('ap_update_trigger',{
      flowId,pieceName:'@activepieces/piece-webhook',triggerName:'catch_webhook',input:{}
    });
    if(trigger?.isError===true)return fail('AP_REPAIR_TRIGGER_REJECTED');
    const t=parseActivepiecesToolResult(await client.call('ap_read_step_settings',{flowId,stepName:'trigger'}));
    const actual=t.settings||t;
    if(actual.pieceName!=='@activepieces/piece-webhook'||actual.triggerName!=='catch_webhook'||
       !actual.input||typeof actual.input!=='object'||Array.isArray(actual.input)||Object.keys(actual.input).length!==0)
      return fail('AP_REPAIR_TRIGGER_READBACK_FAILED');
    const step=await client.call('ap_update_step',{flowId,stepName:'step_1',
      input:{qualMarker:'{{trigger.body.qualMarker}}',value:'{{trigger.body.value}}'},
      sourceCode:SOURCE,packageJson:'{}',skip:false,
      continueOnFailure:false,retryOnFailure:false
    });
    if(step?.isError===true)return fail('AP_REPAIR_STEP_REJECTED');
    // A second independent complete preflight is the only source of PASS.
    const verified=await preflight({store,client});
    const passes=verified?.status==='PASS'&&verified?.reason==='AP_SANDBOX_PREFLIGHT_VERIFIED'&&
      verified.runSubmitted===false&&verified.productionActivation===false&&verified.flowIsolated===true;
    const result=passes?{status:'PASS',reason:'AP_SANDBOX_REPAIR_READBACK_VERIFIED',
      runSubmitted:false,productionActivation:false,readyForControlledTest:true}
      :fail('AP_REPAIR_READBACK_UNVERIFIED');
    await store.put(key,{status:passes?'VERIFIED':'HOLD',at:new Date().toISOString(),marker:state.marker});
    await auditAppend(store,'SANDBOX_REPAIR_READBACK',{phase:passes?'PREFLIGHT_PASS':'PREFLIGHT_HOLD'});
    return result;
  }catch{return fail('AP_REPAIR_REMOTE_UNCERTAIN')}
}
