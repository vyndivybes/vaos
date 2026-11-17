/** Founder-consented generative investigation over existing signed read-only VAOS observations.
 * No model-selected tools, autonomous mutations, raw rows, or policy escalation.
 */
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {featureControl} from '../lib/feature-flags.mjs';
import {createJarvisDataAgentHandler} from './jarvis-data-agent.mjs';
import {selectDataAgentSources} from '../lib/data-agent-report.mjs';
import {runJarvisGovernedAdvisory} from '../../../intelligence/jarvis-governed-model.mjs';
import {qualifyAutonomySourceReport,finishAutonomyReview,
 claimAutonomyInferenceBudget} from '../../../intelligence/jarvis-readonly-autonomy.mjs';

const FOUNDER='shyamsundhar1982@gmail.com';
const ENABLED='founder-manual-readonly-v1';
async function defaultSourceRead({req,question}){
 const handler=createJarvisDataAgentHandler();
 let code=200,body=null;
 const res={setHeader(){return res},status(n){code=n;return res},json(o){body=o;return res}};
 await handler({method:'GET',url:new URL('/api/jarvis-data-agent?q='+encodeURIComponent(question),req.url).toString(),
  env:req.env,headers:req.headers},res);
 if(code!==200||!body?.data)throw Error('AUTONOMY_SIGNED_SOURCE_UNAVAILABLE');
 return body.data;
}
const defaultAdvisory=({env,sourceReview})=>runJarvisGovernedAdvisory({
 ai:env?.AI,authorityLevel:'L2',domain:sourceReview.sources[0].domain,
 subjectId:'jarvis-founder-investigation',
 observations:sourceReview.sources.map(s=>({domain:s.domain,status:s.status,recordsObserved:s.recordsObserved})),
 // Model sees statuses and sanitized selected-record counts, not raw business data, questions or personal identifiers.
 question:'Review bounded source coverage and suggest what the founder should verify next. Do not claim any approval.',
});
export function createJarvisAutonomyInvestigateHandler({
 readData=defaultSourceRead,
 runAdvisory=defaultAdvisory,
 claimBudget=claimAutonomyInferenceBudget
}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json(apiError('METHOD_NOT_ALLOWED','POST required'));}
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Founder sign-in required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder-only pilot'));
  if(featureControl(req.env,'VAOS_AUTONOMOUS_INVESTIGATION_CONTROL')!==ENABLED)
   return res.status(409).json(apiError('AUTONOMY_DISABLED','Manual read-only pilot not commissioned'));
  let url;try{url=new URL(req.url);}catch{return res.status(422).json(apiError('REQUEST_INVALID','Invalid URL'));}
  if(url.search)return res.status(422).json(apiError('REQUEST_INVALID','Query strings are not accepted'));
  if(req.headers?.origin!==url.origin)return res.status(403).json(apiError('ORIGIN_DENIED','Matching origin required'));
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))
   return res.status(415).json(apiError('JSON_REQUIRED','JSON required'));
  const input=req.body;
  if(!input||typeof input!=='object'||Array.isArray(input)||
   Object.keys(input).sort().join(',')!=='confirm,operation,question'||
   input.operation!=='INVESTIGATE'||input.confirm!==true||
   typeof input.question!=='string'||input.question.length>300)
   return res.status(422).json(apiError('INVESTIGATION_INVALID','Bounded, consented investigation required'));
  const planned=selectDataAgentSources(input.question);
  if(planned.status==='DENIED')return res.status(422).json(apiError('AUTONOMY_WRITE_DENIED','Autonomous investigation cannot initiate mutations'));
  if(planned.status!=='PLANNED'||planned.workforce||!planned.domains?.length)
   return res.status(422).json(apiError('AUTONOMY_SCOPE_UNSUPPORTED','Choose a supported read-only business domain'));
  let sourceReview;
  try{
   const report=await readData({req,question:input.question});
   sourceReview=qualifyAutonomySourceReport(report);
  }catch{
   return res.status(503).json(apiError('AUTONOMY_SIGNED_SOURCE_HOLD','Signed source coverage unavailable or invalid'));
  }
  if(sourceReview.holds.includes('SOURCE_UNAVAILABLE')){
   return res.status(200).json({data:{
    schemaVersion:'VAOS_JARVIS_GENERATIVE_AUTONOMY_CANARY_V1',status:'HOLD',
    holds:sourceReview.holds,sourceEvidence:sourceReview.sources,
    generativeModelCalls:0,reason:'No generative inference without all selected sources present.',
    automationLevel:'L2_ADVISORY',actionAuthorized:false,productionWriteAuthorized:false,
    readOnly:true,modelWeightsChanged:false
   }});
  }
  // Cost is pre-reserved from the existing R2 bucket, using a two-call daily limit.
  let budget;
  try{budget=await claimBudget(req.env?.VAOS_ARTIFACTS);}catch{
   return res.status(503).json(apiError('AUTONOMY_BUDGET_HOLD','Atomic zero-cost pilot quota reservation unavailable'));
  }
  if(!budget?.allowed)return res.status(429).json(apiError('AUTONOMY_DAILY_LIMIT','Daily two-call pilot budget exhausted'));
  try{
   const advisory=await runAdvisory({env:req.env,sourceReview});
   const result=finishAutonomyReview({sourceReview,advisory});
   return res.status(200).json({data:{...result,remainingDailyModelCalls:budget.remaining}});
  }catch{
   return res.status(503).json(apiError('AUTONOMY_ADVISORY_HOLD','Model output invalid or unavailable; no operation executed'));
  }
 };
}
export default createJarvisAutonomyInvestigateHandler();
