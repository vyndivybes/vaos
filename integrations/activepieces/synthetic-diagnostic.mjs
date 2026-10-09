export function classifyReadbackToolError(result){
  if(result?.isError!==true)return null;
  const message=(result.content||[]).filter(c=>c.type==='text').map(c=>c.text).join(' ').toLowerCase().slice(0,5000);
  if(/project.{0,35}(selected|context|select)|select.{0,35}project|no active project/.test(message))return 'AP_PROJECT_CONTEXT_MISSING';
  if(/permission|forbidden|not authorized|authorization required/.test(message))return 'AP_READ_PERMISSION_DENIED';
  return 'AP_READBACK_TOOL_ERROR';
}
export async function diagnoseSyntheticHold({store,client}){
  const cached=await store.get('ap-qual-diagnostic');if(cached)return cached;
  const state=await store.get('ap-qual-state');
  if(state?.status!=='HOLD'||state?.phase!=='BUILD_SUBMITTED'||!/^VAOSQ_[0-9A-F]{16}$/.test(state.marker||''))
    return {status:'NOT_APPLICABLE',reason:'AP_NO_AMBIGUOUS_BUILD',productionActivation:false};
  let finding;
  try{
    const tools=new Set((await client.tools()).map(t=>typeof t==='string'?t:t?.name));
    if(!tools.has('ap_list_flows'))finding={status:'HOLD',reason:'AP_READ_TOOL_UNAVAILABLE',matches:null};
    else{
      const name='VAOS Synthetic Qualification '+state.marker;
      const response=await client.call('ap_list_flows',{limit:20,name});
      const problem=classifyReadbackToolError(response);
      if(problem)finding={status:'HOLD',reason:problem,matches:null};
      else{
        const flows=response?.structuredContent?.flows;
        if(!Array.isArray(flows))finding={status:'HOLD',reason:'AP_FLOWS_RESPONSE_UNVERIFIED',matches:null};
        else {
          const exact=flows.filter(f=>f?.displayName===name&&typeof f.id==='string');
          finding={status:'HOLD',reason:exact.length?'AP_POSSIBLE_ORPHAN_FLOW':'AP_NO_MATCHING_SYNTHETIC_FLOW',matches:exact.length};
        }
      }
    }
  }catch{finding={status:'HOLD',reason:'AP_READBACK_NETWORK_UNAVAILABLE',matches:null}}
  const safe={...finding,stage:'READONLY_RECONCILIATION',checkedAt:new Date().toISOString(),productionActivation:false};
  await store.put('ap-qual-diagnostic',safe);return safe;
}
