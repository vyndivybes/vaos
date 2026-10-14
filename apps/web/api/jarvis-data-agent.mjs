import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {makeCommercialReader} from './voice-commercial.mjs';
import {getVyndiBridgeRoute} from '../../../packages/contracts/vyndi-write-bridge.mjs';
import {VOICE_DOMAIN_ACTIONS} from '../lib/voice-intelligence.mjs';
import {observeAdviceDomain} from '../lib/business-advice.mjs';
import {buildWorkforceAnalytics} from '../../../intelligence/workforce-analytics.mjs';
import {createSupabaseControlStore} from '../../../platform/persistence/supabase-store.mjs';
import {resolveDurableControlConfig} from '../lib/durable-control-provider.mjs';
import {selectDataAgentSources,buildDataAgentReport,
 buildWorkforceDataAgentReport} from '../lib/data-agent-report.mjs';

const FOUNDER='shyamsundhar1982@gmail.com';
const VOICE_CONTROL='founder-readonly-browser-v1';
const defaultWorkforce=(env,email)=>
 createSupabaseControlStore(resolveDurableControlConfig(env)).founderWorkforceOverview(email);

/** Safe native data-agent read facade. No arbitrary SQL, tool calls or model-generated actions. */
export function createJarvisDataAgentHandler({
 getReader=makeCommercialReader,getWorkforce=defaultWorkforce,now=()=>new Date()
}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){
   res.setHeader('Allow','GET');
   return res.status(405).json(apiError('METHOD_NOT_ALLOWED','Read-only GET required'));
  }
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Founder sign-in required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder identity required'));
  if(req.env?.VAOS_VOICE_CONTROL!==VOICE_CONTROL)
   return res.status(409).json(apiError('DATA_AGENT_DISABLED','Read-only founder intelligence not commissioned'));
  let q='';
  try{
   const url=new URL(req.url);
   if([...url.searchParams.keys()].some(k=>k!=='q')||url.searchParams.getAll('q').length!==1)
    throw Error();
   q=url.searchParams.get('q')||'';
  }catch{return res.status(422).json(apiError('DATA_AGENT_QUESTION_INVALID','One bounded question required'));}
  const selection=selectDataAgentSources(q);
  if(selection.status==='DENIED')return res.status(422).json(apiError('DATA_AGENT_WRITE_DENIED','Read-only questions only'));
  if(selection.status!=='PLANNED')
   return res.status(422).json(apiError('DATA_AGENT_SCOPE_UNSUPPORTED','Ask about finance, sales, procurement, inventory, production, or the 16 digital employees'));

  if(selection.workforce){
   try{
    const report=buildWorkforceAnalytics(await getWorkforce(req.env,session.email));
    return res.status(200).json({data:buildWorkforceDataAgentReport({question:q,analytics:report,now:now()})});
   }catch{return res.status(503).json(apiError('DATA_AGENT_WORKFORCE_UNAVAILABLE','Authoritative workforce data unavailable'));}
  }

  let reader;try{reader=getReader(req.env);}catch{reader=null;}
  const observations=await Promise.all(selection.domains.map(async domain=>{
   const actionType=VOICE_DOMAIN_ACTIONS[domain];
   const contract=actionType?getVyndiBridgeRoute(actionType):null;
   if(!reader||!contract||contract.effectClass!=='read'||contract.executionEnabled!==true)
    return {domain,status:'HOLD'};
   try{
    const result=await reader.execute({actionType,
     id:'jarvis-data:'+crypto.randomUUID(),intentId:'jarvis-data:'+crypto.randomUUID(),
     payload:{limit:50,missionId:'vaos-founder-data-agent-readonly'}});
    if(result?.actionType!==actionType||result?.sourceAuthority!==contract.authority)
     throw Error('DATA_AGENT_AUTHORITY_MISMATCH');
    const observation=observeAdviceDomain(domain,result.data);
    return {domain,status:'OBSERVED',authority:contract.authority,count:observation.recordsObserved};
   }catch{return {domain,status:'HOLD'};}
  }));
  try{
   return res.status(200).json({data:buildDataAgentReport({question:q,observations,now:now()})});
  }catch{return res.status(503).json(apiError('DATA_AGENT_SOURCE_INVALID','Trusted source format invalid'));}
 };
}
export default createJarvisDataAgentHandler();
