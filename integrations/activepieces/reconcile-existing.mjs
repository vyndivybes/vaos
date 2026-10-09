// One-shot read-only reconciliation against actual Activepieces project/flow/run records.
// Never create, test, publish, retry or delete a flow in this path.
const E=(code)=>Object.assign(new Error(code),{code});
// Some Activepieces MCP deployments JSON-serialize the MCP tool result inside
// an outer text content item. Unwrap bounded envelopes, but never infer data
// from the human-facing narrative when structured fields are unavailable.
function unwrapMcp(raw){
  let current=raw;
  for(let depth=0;depth<3;depth++){
    if(!current||current.isError===true)throw E('AP_TOOL_READ_FAILED');
    if(current.structuredContent||!Array.isArray(current.content)||current.content.length!==1)return current;
    const txt=current.content[0]?.text;
    if(typeof txt!=='string'||txt.length>160000||!txt.trimStart().startsWith('{'))return current;
    try{
      const nested=JSON.parse(txt);
      const next=nested?.result&&typeof nested.result==='object'?nested.result:nested;
      if(next&&typeof next==='object'&&(next.structuredContent||Array.isArray(next.content))){
        current=next;continue;
      }
    }catch{}
    return current;
  }
  return current;
}
export function parseActivepiecesToolResult(raw){
  raw=unwrapMcp(raw);
  if(!raw||raw.isError===true)throw E('AP_TOOL_READ_FAILED');
  if(raw.structuredContent && typeof raw.structuredContent==='object' && !Array.isArray(raw.structuredContent))return raw.structuredContent;
  const pieces=Array.isArray(raw.content)?raw.content.filter(x=>x.type==='text'&&typeof x.text==='string'):[];
  if(pieces.length!==1||pieces[0].text.length>160000)throw E('AP_STRUCTURED_EVIDENCE_MISSING');
  try{const value=JSON.parse(pieces[0].text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('bad');return value}
  catch{throw E('AP_STRUCTURED_EVIDENCE_MISSING')}
}
function toolText(raw){
  raw=unwrapMcp(raw);
  if(!raw||raw.isError===true)throw E('AP_TOOL_READ_FAILED');
  return Array.isArray(raw.content)?raw.content.filter(c=>c.type==='text').map(c=>c.text).join('\n').slice(0,10000):'';
}
function findProject(text){
  const lines=[...text.matchAll(/^\s*[-*]\s+(.+?)\s+\(([a-zA-Z0-9_-]{6,120})\)\s*$/gm)].map(m=>({name:m[1].trim(),id:m[2]}));
  // Scope strictly to one unambiguous accessible project; never select from a
  // multi-project catalog unless exactly one is named Personal Project.
  const personal=lines.filter(p=>p.name==='Personal Project');
  if(personal.length===1)return personal[0];
  if(personal.length===0 && lines.length===1)return lines[0];
  if(/permission denied|does not have.+permission|not authorized/i.test(text))
    throw E('AP_PROJECT_ACCESS_DENIED');
  if(!/available projects/i.test(text))
    throw E('AP_PROJECT_CATALOG_UNAVAILABLE');
  if(lines.length===0)throw E('AP_PROJECT_CATALOG_EMPTY');
  throw E('AP_PROJECT_SELECTION_AMBIGUOUS');
}
const exactId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{6,120}$/.test(v);
function authenticatedRunDetail(doc,flowId,runId,marker){
  if(!doc||doc.id!==runId||doc.flowId!==flowId||doc.environment!=='TESTING'||doc.status!=='SUCCEEDED'||!Array.isArray(doc.steps))
    return {verified:false,markerVerified:false,checksumVerified:false};
  const outputs=doc.steps.map(v=>v?.output).filter(v=>v&&typeof v==='object');
  const verified=outputs.some(v=>v.qualMarker===marker&&v.fixtureType==='VAOS_SANDBOX_V1'&&v.checksum===45);
  return {verified,markerVerified:outputs.some(v=>v.qualMarker===marker),checksumVerified:outputs.some(v=>v.checksum===45)};
}
export async function reconcileExistingQualification({store,client,now=Date.now}={}){
  if(!store?.get||!store?.put||!client?.tools||!client?.call)throw E('AP_RECONCILE_DEPS_INVALID');
  const cache=await store.get('ap-qual-readonly-reconcile-v3');
  if(cache && Number.isFinite(cache.checkedAtMs) && now()-cache.checkedAtMs<600000)
    return {...cache,cached:true};
  const state=await store.get('ap-qual-state');
  if(!state||!/^VAOSQ_[0-9A-F]{16}$/.test(state.marker||''))
    return {status:'HOLD',reason:'AP_ORIGINAL_MARKER_UNAVAILABLE',productionActivation:false};
  if(!['HOLD','IN_PROGRESS'].includes(state.status))
    return {status:'HOLD',reason:'AP_RECONCILE_NOT_ADMITTED',productionActivation:false};
  let result;
  try{
    const available=new Set((await client.tools()).map(t=>typeof t==='string'?t:t?.name));
    if(['ap_set_project_context','ap_list_flows','ap_list_runs','ap_get_run'].some(t=>!available.has(t)))
      throw E('AP_READONLY_TOOL_UNAVAILABLE');
    const listed=await client.call('ap_set_project_context',{});
    const project=findProject(toolText(listed));
    const selected=await client.call('ap_set_project_context',{projectId:project.id});
    if(!toolText(selected).includes('Project context set to'))throw E('AP_PROJECT_CONTEXT_NOT_SELECTED');
    const expected='VAOS Synthetic Qualification '+state.marker;
    const data=parseActivepiecesToolResult(await client.call('ap_list_flows',{name:expected,limit:100}));
    if(!Array.isArray(data.flows)||data.flows.length>=100)throw E('AP_FLOW_LIST_SCHEMA_UNKNOWN');
    const matches=data.flows.filter(f=>f?.displayName===expected&&exactId(f.id));
    if(matches.length>1)throw E('AP_MULTIPLE_EXACT_FLOWS');
    if(matches.length===0)result={status:'NO_MATCH',reason:'AP_NO_MATCHING_SYNTHETIC_FLOW',matchCount:0,runCount:0};
    else{
      const flowId=matches[0].id;
      const runs=parseActivepiecesToolResult(await client.call('ap_list_runs',{flowId,environment:'TESTING',limit:50})).runs;
      if(!Array.isArray(runs)||runs.length>=50)throw E('AP_RUN_LIST_SCHEMA_UNKNOWN');
      const eligible=runs.filter(x=>x?.flowId===flowId&&exactId(x?.id));
      if(eligible.length===0)result={status:'EXISTING_FLOW_ONLY',reason:'AP_NO_TEST_RUN',matchCount:1,runCount:0};
      else if(eligible.length>1)result={status:'HOLD',reason:'AP_MULTIPLE_TEST_RUNS',matchCount:1,runCount:eligible.length};
      else{
        const runId=eligible[0].id;
        const doc=parseActivepiecesToolResult(await client.call('ap_get_run',{flowRunId:runId}));
        const proof=authenticatedRunDetail(doc,flowId,runId,state.marker);
        result={status:proof.verified?'EXISTING_RUN_VERIFIED':'HOLD',
          reason:proof.verified?null:'AP_RUN_CONTENT_UNVERIFIED',matchCount:1,runCount:1,
          markerVerified:proof.markerVerified,checksumVerified:proof.checksumVerified};
      }
    }
  }catch(e){result={status:'HOLD',reason:/^AP_[A-Z0-9_]{3,80}$/.test(e?.code||'')?e.code:'AP_READONLY_RECONCILIATION_UNAVAILABLE'};}
  const safe={...result,checkedAtMs:now(),productionActivation:false,cached:false};
  await store.put('ap-qual-readonly-reconcile-v3',safe);
  return safe;
}
