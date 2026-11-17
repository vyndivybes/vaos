/** JARVIS bounded generative pilot: independent read-side source gates.
 * This module neither dispatches tools nor promotes model authority.
 */
const DOMAINS=new Set(['finance','commercial','procurement','inventory','production','people','engineering']);
const MAX_DAILY=2;
const fail=code=>{throw Error(code)};
export function qualifyAutonomySourceReport(report){
 if(!report||report.schemaVersion!=='VAOS_DATA_AGENT_V1'||
  report.readOnly!==true||report.actionAuthorized!==false||
  !['OBSERVED','PARTIAL','HOLD'].includes(report.status)||
  !Array.isArray(report.sources)||report.sources.length<1||report.sources.length>4||
  !Array.isArray(report.metrics)||!report.sourceCoverage||
  report.sourceCoverage.requested!==report.sources.length)fail('AUTONOMY_REPORT_INVALID');
 const sources=report.sources.map(s=>{
  if(!s||!DOMAINS.has(s.domain)||!['OBSERVED','HOLD'].includes(s.status)||
   !Number.isInteger(s.index)||s.index<1||s.index>4||
   typeof s.sourceRevisionVerified!=='boolean')fail('AUTONOMY_SOURCE_INVALID');
  const m=report.metrics.find(m=>m.sourceIndex===s.index&&m.domain===s.domain);
  const count=s.status==='OBSERVED'&&Number.isSafeInteger(m?.value)&&m.value>=0&&m.value<=1000?m.value:null;
  if(s.status==='OBSERVED'&&(count===null||typeof s.authority!=='string'||!s.authority))fail('AUTONOMY_SOURCE_INVALID');
  return Object.freeze({domain:s.domain,status:s.status,authority:s.status==='OBSERVED'?s.authority:null,
   recordsObserved:count,sourceRevisionVerified:s.sourceRevisionVerified});
 });
 if(new Set(sources.map(x=>x.domain)).size!==sources.length||
  new Set(report.sources.map(x=>x.index)).size!==sources.length||
  report.sourceCoverage.observed!==sources.filter(x=>x.status==='OBSERVED').length)fail('AUTONOMY_SOURCE_INVALID');
 const holds=[];
 if(sources.some(s=>s.status!=='OBSERVED'))holds.push('SOURCE_UNAVAILABLE');
 if(sources.some(s=>s.status==='OBSERVED'&&s.sourceRevisionVerified!==true))
  holds.push('SOURCE_REVISION_UNVERIFIED');
 return Object.freeze({sources,holds,mode:'READ_ONLY_MANUAL_CANARY',actionAuthorized:false});
}
export function finishAutonomyReview({sourceReview,advisory}={}){
 if(!sourceReview||!Array.isArray(sourceReview.sources)||!Array.isArray(sourceReview.holds)||
   !advisory||advisory.authority!=='ADVISORY_ONLY'||advisory.actionAuthorized!==false||
   advisory.executionEnabled!==false||advisory.modelInvoked!==true||
   !['HOLD_FOR_EVIDENCE','ESCALATE','PROCEED_WITH_REVIEW'].includes(advisory.recommendation)||
   !['LOW','MEDIUM','HIGH'].includes(advisory.riskPosture)||
   typeof advisory.summary!=='string'||advisory.summary.length>280)fail('AUTONOMY_ADVISORY_INVALID');
 const holds=[...sourceReview.holds];
 if(advisory.recommendation==='PROCEED_WITH_REVIEW'&&holds.length)
  holds.push('MODEL_PROCEED_BLOCKED_BY_SOURCE_GATE');
 if(advisory.recommendation==='ESCALATE')holds.push('HUMAN_ESCALATION_REQUIRED');
 if(advisory.recommendation==='HOLD_FOR_EVIDENCE')holds.push('MODEL_REQUESTED_MORE_EVIDENCE');
 return Object.freeze({
  schemaVersion:'VAOS_JARVIS_GENERATIVE_AUTONOMY_CANARY_V1',
  status:holds.length?'HOLD':'FOUNDER_REVIEW_REQUIRED',
  modelRecommendation:advisory.recommendation,
  effectiveRecommendation:holds.length?'HOLD_FOR_EVIDENCE':'PROCEED_WITH_REVIEW',
  advisorySummary:advisory.summary,
  riskPosture:advisory.riskPosture,
  sourceEvidence:sourceReview.sources,
  holds:[...new Set(holds)],
  stages:['SOURCE_PLANNING','SIGNED_READ','GENERATIVE_ADVISORY','DETERMINISTIC_VERIFICATION'],
  generativeModelCalls:1,
  automationLevel:'L2_ADVISORY',
  modelWeightsChanged:false,learningCertified:false,
  graphCurrentnessCertified:false,forecastCertified:false,multimodalAccuracyCertified:false,
  externalActionDispatched:false,readOnly:true,actionAuthorized:false,productionWriteAuthorized:false
 });
}
/** Conditional R2 writes are the only pilot write: a bounded quota marker.
 * If the quota store cannot prove an atomic reservation, fail closed.
 */
export async function claimAutonomyInferenceBudget(bucket,now=()=>Date.now()){
 if(typeof bucket?.get!=='function'||typeof bucket?.put!=='function')
  fail('AUTONOMY_QUOTA_STORE_UNAVAILABLE');
 const day=new Date(now()).toISOString().slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))fail('AUTONOMY_QUOTA_DATE_INVALID');
 const key='runtime/jarvis-autonomy-v1/inference-budget/'+day+'.json';
 try{
  const prior=await bucket.get(key);
  const previous=prior?await prior.json():null;
  if(prior&&(!previous||previous.day!==day||
    !Number.isInteger(previous.count)||previous.count<0||previous.count>MAX_DAILY||
    typeof prior.etag!=='string'||!prior.etag))fail('AUTONOMY_QUOTA_INVALID');
  const count=previous?.count||0;
  if(count>=MAX_DAILY)return {allowed:false,remaining:0};
  const reservation=await bucket.put(key,JSON.stringify({day,count:count+1}),{
   onlyIf:prior?{etagMatches:prior.etag}:{etagDoesNotMatch:'*'}
  });
  if(!reservation)fail('AUTONOMY_QUOTA_CONFLICT');
  return {allowed:true,remaining:MAX_DAILY-count-1};
 }catch(error){
  if(String(error?.message).startsWith('AUTONOMY_QUOTA_'))throw error;
  fail('AUTONOMY_QUOTA_UNAVAILABLE');
 }
}
