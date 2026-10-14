import {parseCookies,SESSION_COOKIE,verifySessionToken,sha256} from '../lib/auth.mjs';
import {resolveDurableControlConfig} from '../lib/durable-control-provider.mjs';
import {createSupabaseControlStore} from '../../../platform/persistence/supabase-store.mjs';
import {makeCommercialReader} from './voice-commercial.mjs';
import {getVyndiBridgeRoute} from '../../../packages/contracts/vyndi-write-bridge.mjs';
import {VOICE_DOMAIN_ACTIONS,interpretVoiceRecords} from '../lib/voice-intelligence.mjs';
import {createEngineeringKnowledgeHandler} from './engineering-knowledge.mjs';
import {STARTUP_ROLES,prelaunchRoster,createPrelaunchDraft,startupBatch,calculateStartupScenario} from '../../../intelligence/prelaunch-workforce.mjs';

const FOUNDER='shyamsundhar1982@gmail.com',UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const defaultStore=env=>createSupabaseControlStore(resolveDurableControlConfig(env));
export function createPrelaunchWorkforceHandler({getStore=defaultStore,getReader=makeCommercialReader,now=()=>new Date()}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const reply=(status,data)=>res.status(status).json(data);
  if(!['GET','POST'].includes(req.method))return reply(405,{error:{code:'METHOD_NOT_ALLOWED'}});
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return reply(401,{error:{code:'UNAUTHENTICATED'}});
  if(session.email!==FOUNDER)return reply(403,{error:{code:'FOUNDER_ONLY'}});
  let body=req.body;
  if(req.method==='POST'){
   let origin;try{origin=new URL(req.url).origin}catch{}
   if(!origin||req.headers?.origin!==origin)return reply(403,{error:{code:'ORIGIN_DENIED'}});
   if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))return reply(415,{error:{code:'JSON_REQUIRED'}});
   if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>8000||
    !UUID.test(body.requestId||'')||!['PREPARE_ALL','PREPARE_EMPLOYEE','PLAN_SCENARIO'].includes(body.operation)||
    Object.keys(body).some(k=>!['operation','requestId','objective','employeeId','actionType','inputs'].includes(k)))return reply(422,{error:{code:'PRELAUNCH_REQUEST_INVALID'}});
   try{
    if(body.operation==='PLAN_SCENARIO')calculateStartupScenario(body.inputs);
    else if(body.operation==='PREPARE_EMPLOYEE')createPrelaunchDraft(body);
    else createPrelaunchDraft({employeeId:'orchestrator',actionType:STARTUP_ROLES.orchestrator.first,objective:body.objective});
   }catch{return reply(422,{error:{code:'PRELAUNCH_INPUT_INVALID'}});}
  }
  let store,snapshot,history;
  try{store=getStore(req.env);[snapshot,history]=await Promise.all([store.snapshot(),store.prelaunchOutput({actorEmail:session.email})]);prelaunchRoster(snapshot);}
  catch{return reply(503,{error:{code:'PRELAUNCH_REGISTER_UNAVAILABLE'}});}
  let reader;try{reader=getReader(req.env);}catch{}
  const observations={},raw={};
  await Promise.all(Object.entries(VOICE_DOMAIN_ACTIONS).map(async([domain,actionType])=>{
   const route=getVyndiBridgeRoute(actionType);
   observations[domain]={status:'HOLD',count:null,authority:null};
   if(!reader||route?.effectClass!=='read'||route.executionEnabled!==true)return;
   try{
    const result=await reader.execute({actionType,id:'prelaunch:'+crypto.randomUUID(),intentId:'prelaunch:'+crypto.randomUUID(),payload:{limit:50,missionId:'founder-prelaunch-preparation'}});
    if(result.actionType!==actionType||result.sourceAuthority!==route.authority)throw Error();
    const interpreted=interpretVoiceRecords(domain,result.data,{limit:50});
    raw[domain]=result;observations[domain]={status:'OBSERVED',count:interpreted.recordsObserved,authority:result.sourceAuthority};
   }catch{/* A missing source remains unavailable, never a fake empty ledger. */}
  }));
  let engineering=null;
  try{
   const engineeringHandler=createEngineeringKnowledgeHandler({getReader:()=>({execute:async()=>{if(!raw.engineering)throw Error();return raw.engineering;}})});
   const sourceReq={...req,method:'GET',url:new URL('/api/engineering-knowledge?q=proposed%20geometry%20material%20configuration',req.url).href};
   const sourceRes={setHeader(){},status(){return this;},json(value){engineering=value.data;return value;}};
   await engineeringHandler(sourceReq,sourceRes);
  }catch{/* Startup worksheets remain available without a released design. */}
  const roster=prelaunchRoster(snapshot);
  if(req.method==='GET')return reply(200,{data:{schemaVersion:'VAOS_PRELAUNCH_WORKSPACE_V1',operatingPhase:'PRELAUNCH',
   employees:roster,observations,engineering,history:history?.runs||[],businessRecordsRequiredForPreparation:false,
   catalogPreparationCount:roster.reduce((n,r)=>n+r.jobs.length,0),automaticBusinessEffectsAuthorized:false,
   notice:'No company operating history is expected. Available source rows are prelaunch records, not certified company transactions. Missing sources remain explicit.'}});
  if(roster.some(r=>!r.roleFloorMet))return reply(409,{error:{code:'PRELAUNCH_ROLE_UNAVAILABLE'}});
  let outputs;
  try{outputs=body.operation==='PLAN_SCENARIO'?[calculateStartupScenario(body.inputs)]:body.operation==='PREPARE_ALL'?
   startupBatch({snapshot,objective:body.objective,observations,engineering}):
   [createPrelaunchDraft({...body,observation:observations[STARTUP_ROLES[body.employeeId].domain],engineering})];}
  catch{return reply(422,{error:{code:'PRELAUNCH_INPUT_INVALID'}});}
  const stamp=now().toISOString();
  const output={schemaVersion:'VAOS_PRELAUNCH_RUN_V1',requestId:body.requestId,preparedAt:stamp,operation:body.operation,outputs,businessEffectsExecuted:false};
  try{
   const saved=await store.prelaunchOutput({actorEmail:session.email,requestId:body.requestId,requestHash:sha256(JSON.stringify(body)),output});
   if(saved?.data?.requestId!==body.requestId||saved.data.businessEffectsExecuted!==false)throw Error();
   return reply(200,{data:saved.data});
  }catch{return reply(503,{error:{code:'PRELAUNCH_OUTPUT_NOT_SAVED'}});}
 };
}
export default createPrelaunchWorkforceHandler();
