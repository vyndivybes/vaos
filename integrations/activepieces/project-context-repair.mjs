// One carefully gated remediation for an independently diagnosed missing project.
// An explicit persisted admission marker prevents second flow submissions after errors.
const error=code=>Object.assign(new Error(code),{code});
const txt=x=>(x?.content||[]).filter(v=>v.type==='text').map(v=>v.text).join('\n');
export function selectUnambiguousProject(message){
  if(typeof message!=='string'||message.length>10000)throw error('AP_PROJECT_DISCOVERY_INVALID');
  const matches=[...message.matchAll(/^\s*[-*]\s+(.+?)\s+\(([A-Za-z0-9_-]{6,120})\)\s*$/gm)]
    .map(m=>({name:m[1].trim(),id:m[2]}));
  const choices=[...new Map(matches.map(p=>[p.id,p])).values()];
  const personal=choices.filter(p=>p.name==='Personal Project');
  if(personal.length===1)return personal[0];
  if(choices.length===1)return choices[0];
  throw error('AP_PROJECT_SELECTION_AMBIGUOUS');
}
export async function remediateProjectOnce({store,client,retry}){
  const diag=await store.get('ap-qual-diagnostic');
  const state=await store.get('ap-qual-state');
  if(diag?.reason!=='AP_PROJECT_CONTEXT_MISSING'||state?.status!=='HOLD'||state?.phase!=='BUILD_SUBMITTED')
    return {status:'HOLD',reason:'AP_REMEDIATION_NOT_ADMITTED'};
  if(await store.get('ap-qual-remediation-admitted'))
    return {status:'HOLD',reason:'AP_REMEDIATION_ALREADY_ATTEMPTED'};
  await store.put('ap-qual-remediation-admitted',true);
  try{
    const listed=await client.call('ap_set_project_context',{});
    if(listed?.isError)throw error('AP_PROJECT_DISCOVERY_DENIED');
    const target=selectUnambiguousProject(txt(listed));
    const selected=await client.call('ap_set_project_context',{projectId:target.id});
    if(selected?.isError||!txt(selected).includes('Project context set to'))
      throw error('AP_PROJECT_SELECTION_FAILED');
    const name='VAOS Synthetic Qualification '+state.marker;
    const check=await client.call('ap_list_flows',{name,limit:20});
    const flows=check?.structuredContent?.flows;
    if(check?.isError||!Array.isArray(flows))throw error('AP_ORPHAN_CHECK_UNAVAILABLE');
    if(flows.some(f=>f?.displayName===name))throw error('AP_ORPHAN_FLOW_PRESENT');
    return await retry(state.marker);
  }catch(e){
    return {status:'HOLD',reason:/^AP_[A-Z0-9_]{4,80}$/.test(e?.code||'')?e.code:'AP_REMEDIATION_UNCERTAIN'};
  }
}
