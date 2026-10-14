import {readPersistentGraph} from '../lib/jarvis-persistent-graph.mjs';
import {resolveGraphQuestion,buildGraphAdvice} from '../lib/jarvis-graph-advice.mjs';
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {getVyndiBridgeRoute} from '../../../packages/contracts/vyndi-write-bridge.mjs';
import {makeCommercialReader} from './voice-commercial.mjs';
import {createEngineeringKnowledgeHandler} from './engineering-knowledge.mjs';
import {observeAdviceDomain} from '../lib/business-advice.mjs';
import {VOICE_DOMAIN_ACTIONS,resolveVoiceIntent} from '../lib/voice-intelligence.mjs';
import {claimVoiceAiDailyBudget} from '../lib/voice-ai-focus.mjs';
import {selectEvidenceGapRead,independentlyCheckDraft} from '../lib/adaptive-investigation.mjs';
import {summarizeAdaptiveDiagnostics} from '../lib/adaptive-upgrade-readiness.mjs';
import {assessV3CandidateMode} from '../lib/adaptive-v3-activation.mjs';
import {createJarvisXPreview} from '../lib/jarvis-x-decision-room.mjs';
import {getDurableControlService} from '../lib/durable-control-provider.mjs';
import {isDigitalWorkforceQuestion,planJarvisCoordination} from '../../../intelligence/jarvis-coordination.mjs';
import {planAdaptiveReads,validateAdaptiveDraft,synthesizeAdaptiveBrief,
 fallbackAdaptivePlan,formatAdaptiveEvidence,permittedTechnicalSources,
 buildAdaptiveFallback,isWeatherQuestion} from '../lib/adaptive-intelligence.mjs';

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
async function readOne(tool,{req,getReader,getEngineering,fetchImpl,now,collectGatewayReceipt=false}){
 if(tool==='ENGINEERING'){
  try{
   const response=await getEngineering({req,getReader,fetchImpl});
   if(response?.status!=='OBSERVED'||response.authorityScope!=='VEDM_CURRENT_CONFIGURATION'||
      typeof response.answer!=='string')throw Error('ENGINEERING_HOLD');
   return {tool,status:'OBSERVED',summary:response.answer.slice(0,600),
    sourceAuthority:'VEDM_CURRENT_CONFIGURATION',sources:permittedTechnicalSources(response.sources),
    ...(collectGatewayReceipt?{gatewayReadAt:new Date(now()).toISOString()}:{})};
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
   sourceAuthority:contract.authority,
   ...(collectGatewayReceipt?{gatewayReadAt:new Date(now()).toISOString()}:{})};
 }catch{return {tool,status:'HOLD'};}
}
export function createAdaptiveIntelligenceHandler({
 getReader=makeCommercialReader,getEngineering=governedEngineering,getGraph=readPersistentGraph,
 fetchImpl=globalThis.fetch,claim=claimVoiceAiDailyBudget,
 plan=planAdaptiveReads,synthesize=synthesizeAdaptiveBrief,now=()=>Date.now(),
 getWorkforceSnapshot=env=>getDurableControlService(env).snapshot(),
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
  let question='',evaluationRequest='',analysisMode='';try{const u=new URL(req.url);question=u.searchParams.get('q')||'';evaluationRequest=u.searchParams.get('eval')||'';analysisMode=u.searchParams.get('mode')||'';}catch{}
  if(question.length<5||question.length>300||/[\x00-\x1f\x7f]/.test(question)||
    resolveVoiceIntent(question).reason==='BLOCKED_OR_UNBOUNDED')
   return res.status(422).json(apiError('ADAPTIVE_QUESTION_REJECTED','Read-only non-secret question required'));
  if(analysisMode!==''&&!(analysisMode==='jarvis-x'&&evaluationRequest==='v3-readonly'))
   return res.status(422).json(apiError('JARVIS_X_MODE_DENIED','Founder supervised read-only mode required'));

  // A business location in the question does not make its weather available
  // from inventory, supplier or production records. Do not call a model or
  // spend a read budget on unrelated observations.
  if(isWeatherQuestion(question)){
   const startedAt=now();
   return res.status(200).json({data:{
   ...buildAdaptiveFallback({question,observations:[]}),sourceSystem:'VAOS_ADAPTIVE',
   sources:[],sourceCoverage:{observed:0,requested:0},selectedTools:[],
   modelCalls:0,executionCount:0,readOnly:true,advisoryOnly:true,automationExecuted:false,
   diagnostics:summarizeAdaptiveDiagnostics({elapsedMs:now()-startedAt,planningMode:'RULE_FALLBACK',
    reasoningMode:'DETERMINISTIC_EVIDENCE',modelCalls:0,fallbackReason:'UNSUPPORTED_QUESTION',
    observed:0,requested:0,verificationStatus:'NOT_MODEL_VERIFIED'}),
   }});
  }

  // Startup preparation is useful even before business ledgers contain records.
  // These are founder planning instructions, never claims about uploaded files.
  if(/\b(?:start|launch|set up|setup)\b.{0,60}\b(?:company|business|vayu|vāyū)\b|\b(?:company|business)\b.{0,40}\b(?:startup|start-up|launch)\b/i.test(question)){
   const nextActions=[
    {owner:'knowledge',support:'orchestrator',task:'Organise the existing incorporation/CA documents into a present-and-missing index; keep filing status unconfirmed until a filing record exists.'},
    {owner:'finance',support:'project',task:'Prepare the opening budget and startup action list from supplied funds, quotations and commitments; leave unknown amounts blank.'},
    {owner:'commercial',support:'procurement',task:'Prepare the first customer pipeline and supplier comparison from supplied contacts and quotations; keep outreach as drafts.'},
   ];
   const answer='I can support your company startup now with the existing planning and document tools.\n\nNEXT ACTIONS\n'+
    nextActions.map((x,i)=>(i+1)+'. '+x.task+' Responsible role: '+x.owner+'.').join('\n')+
    '\n\nStart with the incorporation documents already prepared. Share the pack or its document index here so we can organise the next concrete step. No additional independent-review programme is needed for these preparation tasks.'+
    '\n\nThis is a startup work plan. It does not claim documents were read, employees were dispatched or filings were completed.';
   return res.status(200).json({data:{status:'PREPARED',sourceSystem:'VAOS_ADAPTIVE',
    answer,spokenAnswer:'I can help you start the company. First organise the incorporation pack, then prepare the opening budget, customer pipeline and supplier comparison.',
    nextActions,planningMode:'STARTUP_PREPARATION',reasoningMode:'PREPARED_PLAN',
    sources:[],evidence:[],sourceCoverage:{observed:0,requested:0},modelCalls:0,executionCount:0,
    actionAuthorized:false,automationExecuted:false,readOnly:true,advisoryOnly:true}});
  }

  // Digital qualifications belong to the persisted VAOS register. HR personnel
  // counts and engineering release records cannot answer these questions.
  if(isDigitalWorkforceQuestion(question)){
   const startedAt=now();
   try{
    const coordination=planJarvisCoordination(await getWorkforceSnapshot(req.env),{now:now()});
    const coverage=coordination.assessmentCoverage;
    const missing=coverage.missingOrInvalidPassEmployeeIds;
    const answer='RECORDED ASSESSMENT COVERAGE — '+coverage.latestRecordedPassEmployees+' of 16 canonical digital employees meet the latest recorded PASS assessment and role-floor checks.'+
     '\n\nMISSING OR INVALID EVIDENCE — '+(missing.length?missing.join(', '):'None in the latest recorded assessment projection.')+
     '\n\nEVIDENCE — [1] VAOS_PERSISTED_WORKFORCE_REGISTER, the same authenticated snapshot used by /api/jarvis-coordination.'+
     '\n\nSOURCE LIMITS — This counts distinct employees with valid latest recorded claims, not historical assessment rows or human personnel. ACTIVE status alone cannot establish qualification. Independent competence, runtime liveness and operational commissioning are not established by this projection. No agent dispatched or business action taken.';
    return res.status(200).json({data:{
     sourceSystem:'VAOS_ADAPTIVE',sourceAuthority:coordination.source,
     status:missing.length?'HOLD':'OBSERVED',answer,spokenAnswer:answer.split('\n\nEVIDENCE')[0],
     assessmentCoverage:coverage,observedAt:coordination.observedAt,
     sourceCoverage:{observed:1,requested:1},sources:[],
     planningMode:'RULE_FALLBACK',reasoningMode:'DETERMINISTIC_EVIDENCE',modelCalls:0,executionCount:1,
     diagnostics:summarizeAdaptiveDiagnostics({elapsedMs:now()-startedAt,planningMode:'RULE_FALLBACK',
      reasoningMode:'DETERMINISTIC_EVIDENCE',modelCalls:0,fallbackReason:'NONE',observed:1,requested:1,verificationStatus:'NOT_MODEL_VERIFIED'}),
     actionAuthorized:false,automationExecuted:false,readOnly:true,advisoryOnly:true,
     productionWritesAuthorized:false,qualificationCertified:false,
    }});
   }catch{return res.status(503).json(apiError('WORKFORCE_EVIDENCE_HOLD','Authoritative digital workforce evidence unavailable'));}
  }

  const graphQuery=analysisMode==='jarvis-x'?resolveGraphQuestion(question):null;
  if(graphQuery){
   if(!req.env?.SUPABASE_URL||!req.env?.VAOS_DB_RPC_SECRET)
    return res.status(503).json(apiError('GRAPH_SOURCE_HOLD','Authorized durable graph source unavailable'));
   try{
    const graph=await getGraph({url:req.env.SUPABASE_URL,serverSecret:req.env.VAOS_DB_RPC_SECRET,fetchImpl});
    return res.status(200).json({data:buildGraphAdvice(graph,graphQuery)});
   }catch{return res.status(503).json(apiError('GRAPH_SOURCE_HOLD','Verified graph source unavailable'));}
  }

  const startedAt=now();
  // Planning is dynamic only when bounded local Workers AI inference is available;
  // exhaustion of the existing free-tier budget must not trigger a paid provider.
  let selected=fallbackAdaptivePlan(question);
  const ai=req.env?.AI,quotaBucket=req.env?.VAOS_ARTIFACTS;
  let modelCalls=0;
  let fallbackReason=typeof ai?.run==='function'&&quotaBucket?'NONE':'AI_BINDING_UNAVAILABLE';
  if(typeof ai?.run==='function'&&quotaBucket){
   try{
    if((await claim(quotaBucket))?.allowed===true){
     modelCalls++;
     selected=await plan({ai,question});
     // Validate injected/malformed tool plans too; never trust model text.
     const {validateAdaptivePlan}=await import('../lib/adaptive-intelligence.mjs');
     const checked=validateAdaptivePlan({tools:selected.tools,focus:selected.focus});
     selected={...checked,mode:'MODEL_PLANNED'};
    }else fallbackReason='BUDGET_EXHAUSTED';
   }catch{selected=fallbackAdaptivePlan(question);fallbackReason='MODEL_ERROR';}
  }
  const primary=await Promise.all(selected.tools.map(tool=>readOne(tool,{
   req,getReader,getEngineering,fetchImpl,now,collectGatewayReceipt:analysisMode==='jarvis-x'
  })));
  // A second bounded read is permitted ONLY when a first-wave source held,
  // and never exceeds the three-read policy. It cannot clear the original hold.
  const followupRead=selectEvidenceGapRead({tools:selected.tools,observations:primary});
  const extra=followupRead?await readOne(followupRead,{
   req,getReader,getEngineering,fetchImpl,now,collectGatewayReceipt:analysisMode==='jarvis-x'
  }):null;
  const observed=extra?[...primary,extra]:primary;
  const evidence=formatAdaptiveEvidence(observed);
  const fallback=buildAdaptiveFallback({question,observations:evidence});
  const sources=observed.flatMap(x=>permittedTechnicalSources(x.sources));
  let result=fallback,reasoningMode='DETERMINISTIC_EVIDENCE';
  let citationCount=0,modelCandidateObserved=false;
  let verification={status:'NOT_MODEL_VERIFIED',reasons:[],causalClaimsCertified:false,
   businessActionAuthorized:false,limitations:['NO_GENERATIVE_CLAIMS_ACCEPTED']};
  if(evidence.some(x=>x.status==='OBSERVED')&&typeof ai?.run==='function'&&quotaBucket){
   try{
    if((await claim(quotaBucket))?.allowed===true){
     modelCalls++;
     const candidate=await synthesize({ai,question,observations:evidence});
     const draft=validateAdaptiveDraft(candidate,evidence);
     modelCandidateObserved=true;
     verification=independentlyCheckDraft(draft,evidence);
     if(verification.status!=='BOUNDED_CONSISTENCY_PASS')throw Error('INDEPENDENT_CHECK_REJECTED');
     citationCount=draft.citations.length;
     const cited=draft.citations.map(i=>'['+i+'] '+evidence[i-1].tool).join(', ');
     result={...fallback,answer:'ANALYSIS — '+draft.finding+
      '\n\nRECOMMENDATION — '+draft.recommendation+
      '\n\nEVIDENCE — '+cited+
      '\n\nSOURCE LIMITS — These are recent/selected authorized observations, not verified cash, revenue, supplier lead times or certified releases.'+
      (evidence.some(x=>x.status==='HOLD')?' Unavailable sources: '+
        evidence.filter(x=>x.status==='HOLD').map(x=>x.tool).join(', ')+'.':''),
      spokenAnswer:(draft.finding+' '+draft.recommendation).slice(0,400)};
     reasoningMode='MODEL_CHECKED_ADVISORY';
     fallbackReason='NONE';
    }else fallbackReason='BUDGET_EXHAUSTED';
   }catch(error){
    fallbackReason=verification.status==='REJECTED'||String(error?.message||'').includes('DRAFT_')
     ?'DRAFT_REJECTED':'MODEL_ERROR';
    // Preserve the hold reason but never disclose model text or inject an
    // unverified explanation into the spoken founder response.
    if(verification.status==='NOT_MODEL_VERIFIED')
     verification={...verification,status:'CANDIDATE_REJECTED',reasons:['DRAFT_VALIDATION_OR_PROVIDER_UNAVAILABLE']};
   }
  }
  if(selected.tools.length===0&&fallbackReason==='NONE')fallbackReason='UNSUPPORTED_QUESTION';
  else if(evidence.every(x=>x.status!=='OBSERVED')&&fallbackReason==='NONE')fallbackReason='NO_EVIDENCE';
  const diagnostics=summarizeAdaptiveDiagnostics({elapsedMs:now()-startedAt,
   planningMode:selected.mode,reasoningMode,modelCalls,fallbackReason,
   observed:evidence.filter(x=>x.status==='OBSERVED').length,requested:evidence.length,
   verificationStatus:verification.status});
  const investigation=[
   {phase:'PLAN',mode:selected.mode,tools:[...selected.tools]},
   {phase:'READ_PRIMARY',sources:primary.map(x=>({tool:x.tool,status:x.status}))},
   {phase:'EVIDENCE_GAP',result:followupRead?'FOLLOWUP_SELECTED':'NO_ELIGIBLE_FOLLOWUP'},
   ...(extra?[{phase:'READ_FOLLOWUP',tool:extra.tool,status:extra.status}]:[]),
   {phase:'VERIFY',result:verification.status},
  ];
  // Explain what was independently checked without claiming a model can
  // certify causation, future business outcomes or engineering release.
  result={...result,answer:result.answer+'\n\nINDEPENDENT CHECK — '+
   (verification.status==='BOUNDED_CONSISTENCY_PASS'
    ?'Source-index and numeric consistency passed; causation, completeness and approvals remain unverified.'
    :'Model conclusions withheld or unavailable; only authorized observations are reported.')+
   '\n\nINVESTIGATION TRACE — '+investigation.map(x=>x.phase+
    (x.tool?' '+x.tool:'')+(x.result?' '+x.result:'')).join(' → ')+'.'};
  // JARVIS X extends the existing authenticated evidence path, NEVER the
  // model's tool plan. Its graph edges are schema hypotheses; optimization
  // uses abstract review slots, not resource/cash/production forecasts.
  const jarvisX=analysisMode==='jarvis-x'
   ?createJarvisXPreview({observations:observed,reviewSlots:2,now:now(),
     candidateObserved:modelCandidateObserved,
     verification:{status:verification.status,reasons:verification.reasons}}):null;
  if(jarvisX){
   const reviewSuffix='\n\n'+jarvisX.brief+
    (jarvisX.reviewReconciliation.safetyVetoPresent?'\n\nREVIEW — '+jarvisX.reviewReconciliation.summary:'');
   result={...result,answer:result.answer.slice(0,6400-reviewSuffix.length)+reviewSuffix};
  }
  return res.status(200).json({data:{...result,sourceSystem:'VAOS_ADAPTIVE',
   ...(jarvisX?{jarvisX}:{}),
   sourceCoverage:{observed:evidence.filter(x=>x.status==='OBSERVED').length,
    requested:evidence.length},sources,planningMode:selected.mode,
   focus:selected.focus,selectedTools:selected.tools,followupRead,executionCount:observed.length,
   investigation,verification,reasoningMode,citationCount,modelCalls,diagnostics,
   v3Pilot:assessV3CandidateMode({request:evaluationRequest,founderAuthenticated:true,existingV2Authorized:true}),
   actionAuthorized:false,automationExecuted:false,
   readOnly:true,advisoryOnly:true}});
 };
}
export default createAdaptiveIntelligenceHandler();
