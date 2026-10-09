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
  return hold(reason,Object.fromEntries(Object.entries(details).filter(([k,v])=>/^(flowStatus|published|structureKeys|codeKeys|triggerKeys|validationKeys|structureStepNames|structureStepTypes|structureStepCount|codeType|codeMatchesExpected|inputMatchesExpected|packageJsonEmpty|validationValid|validationIssuesCount|structureOk|triggerOk|triggerPieceMatches|triggerNameMatches|triggerInputEmpty|triggerInputFieldCount|triggerInputApproved)$/.test(k)&&(
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
    // Activepieces MCP 'ap_flow_structure' returns steps and stepCount;
    // the trigger can be represented as a step rather than top-level 'trigger'.
    const steps=Array.isArray(s.steps)?s.steps:null;
    const stepListSafe=steps&&steps.every(x=>x&&typeof x==='object'&&
      !x.nextAction && !x.children && !x.branches && !x.onSuccessAction &&
      x.retryOnFailure!==true && x.skip!==true && x.settings?.retryOnFailure!==true);
    const isTrigger=x=>x?.name==='trigger'&&x?.type==='PIECE_TRIGGER';
    const isCode=x=>x?.name==='step_1'&&x?.type==='CODE';
    const twoSteps=steps?.length===2&&isTrigger(steps[0])&&isCode(steps[1]);
    const legacy=steps?.length===1&&isTrigger(s.trigger)&&isCode(steps[0]);
    const structureOk=stepListSafe&&s.flowId===flow.id&&(twoSteps||legacy)&&
      (s.stepCount===undefined||s.stepCount===2);
    const triggerPieceMatches=t.pieceName==='@activepieces/piece-webhook';
    const triggerNameMatches=t.triggerName==='catch_webhook';
    const triggerInputFieldCount=t.input&&typeof t.input==='object'&&!Array.isArray(t.input)
      ?Object.keys(t.input).length:null;
    const triggerInputEmpty=triggerInputFieldCount===0;
    // Activepieces catch_webhook has a required authType default 'none' and
    // optional empty authFields. The platform may materialize these after
    // ap_update_trigger(input:{}), so treating *only* {} as safe is incorrect.
    // Explicitly refuse every other input key or non-'none' auth setting.
    const safeDefaults=t.input&&typeof t.input==='object'&&!Array.isArray(t.input)&&
      Object.keys(t.input).every(k=>k==='authType'||k==='authFields')&&
      t.input.authType==='none'&&
      (!Object.hasOwn(t.input,'authFields')||
        (t.input.authFields&&typeof t.input.authFields==='object'&&
        !Array.isArray(t.input.authFields)&&Object.keys(t.input.authFields).length===0));
    const triggerInputApproved=triggerInputEmpty||Boolean(safeDefaults);
    const triggerOk=triggerPieceMatches&&triggerNameMatches&&triggerInputApproved;
    // ap_read_step_code returns 'code' (not 'sourceCode'). Full source
    // must match the synthetic fixture, never merely contain 'checksum'.
    const fullSource=typeof c.code==='string'?c.code:c.sourceCode;
    const codeMatchesExpected=typeof fullSource==='string'&&fullSource.trim()===SOURCE;
    const inputMatchesExpected=c.input?.qualMarker==='{{trigger.body.qualMarker}}'&&
      c.input?.value==='{{trigger.body.value}}'&&
      Object.keys(c.input||{}).length===2;
    let deps=null;
    if(typeof c.packageJson==='string'){try{deps=JSON.parse(c.packageJson)}catch{}}
    else if(c.packageJson===undefined||c.packageJson===null)deps={};
    else deps=c.packageJson;
    const packageJsonEmpty=deps&&typeof deps==='object'&&!Array.isArray(deps)&&
      (Object.keys(deps).length===0 ||
       (Object.keys(deps).length===1&&Object.hasOwn(deps,'dependencies')&&
        deps.dependencies&&typeof deps.dependencies==='object'&&!Array.isArray(deps.dependencies)&&
        Object.keys(deps.dependencies).length===0));
    const codeOk=codeMatchesExpected&&inputMatchesExpected&&packageJsonEmpty&&
      c.continueOnFailure!==true&&c.retryOnFailure!==true&&c.skip!==true;
    const reportedIssues=Array.isArray(validation.issues)?validation.issues:validation.errors;
    const validationOk=validation.valid===true&&Array.isArray(reportedIssues)&&reportedIssues.length===0&&
      (validation.invalidSteps===undefined||validation.invalidSteps===0)&&
      (validation.skippedSteps===undefined||validation.skippedSteps===0);
    if(!structureOk||!triggerOk||!codeOk||!validationOk)
      return report(diagnostic('AP_PREFLIGHT_CONFIGURATION_UNVERIFIED',{
        structureKeys:keys(s),codeKeys:keys(c),triggerKeys:keys(t),validationKeys:keys(validation),
        structureStepNames:steps?.map(x=>/^[a-zA-Z0-9_-]{1,40}$/.test(x?.name||'')?x.name:'UNKNOWN')||[],
        structureStepTypes:steps?.map(x=>/^[A-Z_]{1,40}$/.test(x?.type||'')?x.type:'UNKNOWN')||[],
        structureStepCount:Number.isInteger(s.stepCount)?String(s.stepCount):'UNKNOWN',
        codeType:typeof c.code,
        codeMatchesExpected,inputMatchesExpected,packageJsonEmpty:Boolean(packageJsonEmpty),
        validationValid:validation.valid===true,
        validationIssuesCount:Array.isArray(reportedIssues)?String(reportedIssues.length):'UNKNOWN',
        structureOk:Boolean(structureOk),triggerOk:Boolean(triggerOk),
        triggerPieceMatches,triggerNameMatches,triggerInputEmpty,triggerInputApproved,
        triggerInputFieldCount:Number.isInteger(triggerInputFieldCount)?String(triggerInputFieldCount):'UNKNOWN'
      }));
    return report({status:'PASS',reason:'AP_SANDBOX_PREFLIGHT_VERIFIED',
      runSubmitted:false,productionActivation:false,flowIsolated:true,stepCount:1,checksumExpected:45});
  }catch{return report(hold('AP_PREFLIGHT_READ_UNAVAILABLE'));}
}
