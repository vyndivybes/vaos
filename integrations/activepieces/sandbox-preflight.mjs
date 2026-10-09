import {parseActivepiecesToolResult} from './reconcile-existing.mjs';
// A read-only gate. No build, publish, test, or business actions are allowed here.
const REQUIRED=['ap_set_project_context','ap_list_flows','ap_flow_structure','ap_read_step_settings','ap_read_step_code','ap_validate_flow'];
const SOURCE="export const code = async (inputs) => ({qualMarker:inputs.qualMarker,checksum:Number(inputs.value)*7+3,fixtureType:'VAOS_SANDBOX_V1'});";
const hold=(reason,extra={})=>({status:'HOLD',reason,runSubmitted:false,productionActivation:false,...extra});
const report=(v)=>Object.freeze(v);
function text(raw){return Array.isArray(raw?.content)?raw.content.filter(x=>x?.type==='text'&&typeof x.text==='string').map(x=>x.text).join('\n').slice(0,10000):'';}
function parseProject(raw){
  const candidates=[...text(raw).matchAll(/^\s*[-*]\s+(.+?)\s+\(([A-Za-z0-9_-]{6,120})\)\s*$/gm)].map(m=>({name:m[1].trim(),id:m[2]}));
  const personal=candidates.filter(x=>x.name==='Personal Project');
  if(personal.length===1)return personal[0];
  if(personal.length===0&&candidates.length===1)return candidates[0];
  return null;
}
function diagnostic(reason,details={}){
  return hold(reason,Object.fromEntries(Object.entries(details).filter(([k,v])=>/^(flowStatus|published|structureKeys|codeKeys|triggerKeys|validationKeys)$/.test(k)&&(
    typeof v==='string'||typeof v==='boolean'||Array.isArray(v)
  ))));
}
const keys=x=>x&&typeof x==='object'?Object.keys(x).slice(0,16):[];
export async function preflightActivepiecesSandbox({store,client}={}){
  if(!store?.get||!client?.tools||!client?.call)return report(hold('AP_PREFLIGHT_DEPENDENCIES_MISSING'));
  const state=await store.get('ap-qual-state');
  if(!state||state.status!=='HOLD'||!/^VAOSQ_[0-9A-F]{16}$/.test(state.marker||''))
    return report(hold('AP_ORIGINAL_STATE_NOT_ADMITTED'));
  try{
    const available=new Set((await client.tools()).map(x=>typeof x==='string'?x:x?.name));
    if(REQUIRED.some(name=>!available.has(name)))
      return report(hold('AP_PREFLIGHT_TOOLS_UNAVAILABLE'));
    const project=parseProject(await client.call('ap_set_project_context',{}));
    if(!project)return report(hold('AP_PREFLIGHT_PROJECT_AMBIGUOUS'));
    const selected=await client.call('ap_set_project_context',{projectId:project.id});
    if(!text(selected).includes('Project context set to'))
      return report(hold('AP_PREFLIGHT_PROJECT_SELECTION_FAILED'));
    const name='VAOS Synthetic Qualification '+state.marker;
    const list=parseActivepiecesToolResult(await client.call('ap_list_flows',{name,limit:100}));
    if(!Array.isArray(list.flows)||list.flows.length>=100)return report(hold('AP_PREFLIGHT_FLOW_LIST_UNKNOWN'));
    const exact=list.flows.filter(f=>f?.displayName===name&&typeof f.id==='string'&&/^[A-Za-z0-9_-]{6,120}$/.test(f.id));
    if(exact.length!==1)return report(hold(exact.length===0?'AP_PREFLIGHT_FLOW_MISSING':'AP_PREFLIGHT_FLOW_AMBIGUOUS'));
    const flow=exact[0];
    if(flow.status!=='DISABLED'||flow.published!==false)
      return report(diagnostic('AP_PREFLIGHT_FLOW_NOT_ISOLATED',{flowStatus:flow.status,published:flow.published}));
    const structure=parseActivepiecesToolResult(await client.call('ap_flow_structure',{flowId:flow.id}));
    const trigger=parseActivepiecesToolResult(await client.call('ap_read_step_settings',{flowId:flow.id,stepName:'trigger'}));
    const code=parseActivepiecesToolResult(await client.call('ap_read_step_code',{flowId:flow.id,stepName:'step_1'}));
    const validation=parseActivepiecesToolResult(await client.call('ap_validate_flow',{flowId:flow.id}));
    const s=structure.flow||structure;
    const t=trigger.settings||trigger;
    const c=code.settings||code;
    const structureOk=s.flowId===flow.id && s.trigger?.name==='trigger'&&s.trigger?.type==='PIECE_TRIGGER'&&
      Array.isArray(s.steps)&&s.steps.length===1&&s.steps[0]?.name==='step_1'&&s.steps[0]?.type==='CODE';
    const triggerOk=t.pieceName==='@activepieces/piece-webhook'&&t.triggerName==='catch_webhook'&&
      t.input&&Object.keys(t.input).length===0;
    const codeOk=c.sourceCode===SOURCE&&c.input?.qualMarker==='{{trigger.body.qualMarker}}'&&
      c.input?.value==='{{trigger.body.value}}'&&Object.keys(c.input).length===2&&
      c.continueOnFailure!==true&&c.retryOnFailure!==true;
    const validationOk=validation.valid===true&&Array.isArray(validation.errors)&&validation.errors.length===0;
    if(!structureOk||!triggerOk||!codeOk||!validationOk)
      return report(diagnostic('AP_PREFLIGHT_CONFIGURATION_UNVERIFIED',{
        structureKeys:keys(s),codeKeys:keys(c),triggerKeys:keys(t),validationKeys:keys(validation)
      }));
    return report({status:'PASS',reason:'AP_SANDBOX_PREFLIGHT_VERIFIED',
      runSubmitted:false,productionActivation:false,flowIsolated:true,stepCount:1,checksumExpected:45});
  }catch{return report(hold('AP_PREFLIGHT_READ_UNAVAILABLE'));}
}
