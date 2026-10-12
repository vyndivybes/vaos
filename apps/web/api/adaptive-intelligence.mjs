import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {getVyndiBridgeRoute} from '../../../packages/contracts/vyndi-write-bridge.mjs';
import {makeCommercialReader} from './voice-commercial.mjs';
import {createEngineeringKnowledgeHandler} from './engineering-knowledge.mjs';
import {observeAdviceDomain} from '../lib/business-advice.mjs';
import {VOICE_DOMAIN_ACTIONS,resolveVoiceIntent} from '../lib/voice-intelligence.mjs';
import {claimVoiceAiDailyBudget} from '../lib/voice-ai-focus.mjs';
import {planAdaptiveReads,validateAdaptiveDraft,synthesizeAdaptiveBrief,
 fallbackAdaptivePlan,formatAdaptiveEvidence,permittedTechnicalSources,
 buildAdaptiveFallback} from '../lib/adaptive-intelligence.mjs';

const FOUNDER='shyamsundhar1982@gmail.com';
const CONTROL='founder-readonly-browser-v1';
const DOMAIN={COMMERCIAL:'commercial',FINANCE:'finance',PROCUREMENT:'procurement',
 INVENTORY:'inventory',PRODUCTION:'production',PEOPLE:'people'};
async function governedEngineering({req,fetchImpl,getReader}){
 let payload=null,status=200;
 const response={setHeader(){return response},status(n){status=n;return response},
  json(value){payload=value;return response}};
 const q='What are current engineering configuration release and supplier material risks';
 const url=new URL('/api/engineering-knowledge?q='+encodeURIComponent(q),req.url).toString();
 await createEngineeringKnowledgeHandler({fetchImpl,getReader})({
  method:'GET',url,headers:req.headers,env:req.env},response);
 return status===200?payload?.data:null;
}
async function readOne(tool,{req,getReader,getEngineering,fetchImpl}){
 if(tool==='ENGINEERING'){
  try{
   const response=await getEngineering({req,getReader,fetchImpl});
   if(response?.status!=='OBSERVED'||response.authorityScope!=='VEDM_CURRENT_CONFIGURATION'||
      typeof response.answer!=='string')throw Error('ENGINEERING_HOLD');
   return {tool,status:'OBSERVED',summary:response.answer.slice(0,600),
    sourceAuthority:'VEDM_CURRENT_CONFIGURATION',sources:permittedTechnicalSources(response.sources)};
  }catch{return {tool,status:'HOLD'};}
 }
 const domain=DOMAIN[tool],actionType=VOICE_DOMAIN_ACTIONS[domain];
 const contract=actionType?getVyndiBridgeRoute(actionType):null;
 if(!contract||contract.effectClass!=='read'||contract.executionEnabled!==true)
  return {tool,status:'HOLD'};
 try{
  const result=await getReader(req.env).execute({actionType,
   id:'adaptive:'+crypto.randomUUID(),intentId:'adaptive:'+crypto.randomUUID(),
   payload:{limit:50,missionId:'vaos-founder-adaptive-readonly'}});
  if(result?.actionType!==actionType||result?.sourceAuthority!==contract.authority)
   throw Error('ADAPTIVE_AUTHORITY_MISMATCH');
  const parsed=observeAdviceDomain(domain,result.data);
  return {tool,status:'OBSERVED',summary:parsed.summary+'; recent or selected source records, not an audited enterprise total.',
   sourceAuthority:contract.authority};
 }catch{return {tool,status:'HOLD'};}
}
export function createAdaptiveIntelligenceHandler({
 getReader=makeCommercialReader,getEngineering=governedEngineering,
 fetchImpl=globalThis.fetch,claim=claimVoiceAiDailyBudget,
 plan=planAdaptiveReads,synthesize=synthesizeAdaptiveBrief,
}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET')return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET required'));
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Founder session required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder-only intelligence'));
  if(req.env?.VAOS_VOICE_CONTROL!==CONTROL)
   return res.status(409).json(apiError('ADAPTIVE_DISABLED','Read-only founder intelligence not commissioned'));
  let question='';try{question=new URL(req.url).searchParams.get('q')||'';}catch{}
  if(question.length<5||question.length>300||/[\x00-\x1f\x7f]/.test(question)||
    resolveVoiceIntent(question).reason==='BLOCKED_OR_UNBOUNDED')
   return res.status(422).json(apiError('ADAPTIVE_QUESTION_REJECTED','Read-only non-secret question required'));

  // Planning is dynamic only when bounded local Workers AI inference is available;
  // exhaustion of the existing free-tier budget must not trigger a paid provider.
  let selected=fallbackAdaptivePlan(question);
  const ai=req.env?.AI,quotaBucket=req.env?.VAOS_ARTIFACTS;
  let modelCalls=0;
  if(typeof ai?.run==='function'&&quotaBucket){
   try{
    if((await claim(quotaBucket))?.allowed===true){
     modelCalls++;
     selected=await plan({ai,question});
     // Validate injected/malformed tool plans too; never trust model text.
     const {validateAdaptivePlan}=await import('../lib/adaptive-intelligence.mjs');
     const checked=validateAdaptivePlan({tools:selected.tools,focus:selected.focus});
     selected={...checked,mode:'MODEL_PLANNED'};
    }
   }catch{selected=fallbackAdaptivePlan(question);}
  }
  const observed=await Promise.all(selected.tools.map(tool=>readOne(tool,{
   req,getReader,getEngineering,fetchImpl
  })));
  const evidence=formatAdaptiveEvidence(observed);
  const fallback=buildAdaptiveFallback({question,observations:evidence});
  const sources=observed.flatMap(x=>permittedTechnicalSources(x.sources));
  let result=fallback,reasoningMode='DETERMINISTIC_EVIDENCE';
  let citationCount=0;
  if(evidence.some(x=>x.status==='OBSERVED')&&typeof ai?.run==='function'&&quotaBucket){
   try{
    if((await claim(quotaBucket))?.allowed===true){
     modelCalls++;
     const draft=validateAdaptiveDraft(await synthesize({ai,question,observations:evidence}),evidence);
     citationCount=draft.citations.length;
     const cited=draft.citations.map(i=>'['+i+'] '+evidence[i-1].tool).join(', ');
     result={...fallback,answer:'ANALYSIS — '+draft.finding+
      '\n\nRECOMMENDATION — '+draft.recommendation+
      '\n\nEVIDENCE — '+cited+
      '\n\nSOURCE LIMITS — These are recent/selected authorized observations, not verified cash, revenue, supplier lead times or certified releases.'+
      (evidence.some(x=>x.status==='HOLD')?' Unavailable sources: '+
        evidence.filter(x=>x.status==='HOLD').map(x=>x.tool).join(', ')+'.':''),
      spokenAnswer:(draft.finding+' '+draft.recommendation).slice(0,400)};
     reasoningMode='MODEL_GROUNDED_ADVISORY';
    }
   }catch{/* deterministic readback remains authoritative */}
  }
  return res.status(200).json({data:{...result,sourceSystem:'VAOS_ADAPTIVE',
   sourceCoverage:{observed:evidence.filter(x=>x.status==='OBSERVED').length,
    requested:evidence.length},sources,planningMode:selected.mode,
   focus:selected.focus,selectedTools:selected.tools,executionCount:observed.length,
   reasoningMode,citationCount,modelCalls,actionAuthorized:false,automationExecuted:false,
   readOnly:true,advisoryOnly:true}});
 };
}
export default createAdaptiveIntelligenceHandler();
