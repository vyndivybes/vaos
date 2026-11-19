/**
 * A05: deterministic shadow holdout and safe *recommendation* to retain the
 * baseline. Never modifies a model, live alias, weights, prompts, policies,
 * memory, workflows, credentials or commercial records.
 *
 * Sample IDs choose a pre-coded assignment independent of observed outcomes.
 * But submitters can select/alter IDs; no independent holdout commitment,
 * reviewer authenticity, causal improvement or deployed learning is proven.
 */
import {evaluateJarvisPairs} from './jarvis-evaluation.mjs';

const VERSION='VAOS_JARVIS_A05_SHADOW_HOLDOUT_V1';
const SEED='VAOS-JARVIS-A05-SHADOW-SPLIT-V1|';
const MIN_HOLDOUT=10,MIN_DEVELOPMENT=30;
const METRICS=Object.freeze(['sampleCount','accuracy','brierScore',
 'expectedCalibrationError','latencyP95Ms','unsupportedClaims','overconfidentErrors']);
const summary=x=>Object.freeze(Object.fromEntries(METRICS.map(k=>[k,x[k]??null])));
const criteria=x=>Object.freeze({
 baseline:summary(x.baseline),candidate:summary(x.candidate),
 regressions:x.regressions,improvements:x.improvements,
 safetyRegressions:x.safetyRegressions
});
async function heldout(sampleId){
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(SEED+sampleId)));
 const slot=new DataView(hash.buffer,hash.byteOffset,hash.byteLength).getUint32(0,false)%5;
 return slot===0;
}
/** The only output is aggregate; all record identity and reviewer labels are discarded. */
export async function assessJarvisA05ShadowHoldout(batch){
 // Leverage existing strict, exact-field paired-input validator. Reject
 // source text, unknown fields, duplicate sample IDs and self-reviews.
 const all=evaluateJarvisPairs(batch);
 const assigned=await Promise.all(batch.pairs.map(x=>heldout(x.sampleId)));
 const shadow=[],development=[];
 batch.pairs.forEach((x,i)=>(assigned[i]?shadow:development).push(x));
 const holdout=criteria(evaluateJarvisPairs({mode:batch.mode,pairs:shadow}));
 const train=criteria(evaluateJarvisPairs({mode:batch.mode,pairs:development}));
 const meetsCount=shadow.length>=MIN_HOLDOUT&&development.length>=MIN_DEVELOPMENT;
 const pairedRegression=holdout.regressions>0;
 const safetyRegression=holdout.safetyRegressions>0||
  holdout.candidate.unsupportedClaims>0||
  holdout.candidate.overconfidentErrors>0;
 const accuracyDegradation=holdout.candidate.accuracy!==null&&
  holdout.baseline.accuracy!==null&&
  holdout.candidate.accuracy<holdout.baseline.accuracy;
 const calibrationDegradation=holdout.candidate.brierScore!==null&&
  holdout.baseline.brierScore!==null&&
  holdout.candidate.brierScore>holdout.baseline.brierScore+1e-12;
 const latencyBreach=holdout.candidate.latencyP95Ms!==null&&
  holdout.candidate.latencyP95Ms>8000;
 const adverse=pairedRegression||safetyRegression||
  accuracyDegradation||calibrationDegradation||latencyBreach;
 const minImprovement=Math.max(2,Math.ceil(shadow.length*.05));
 const enoughImprovement=holdout.improvements>=minImprovement&&
  holdout.candidate.accuracy>holdout.baseline.accuracy;
 let reversionDecision='RETAIN_BASELINE',reason='UNQUALIFIED_OR_NO_CLEAR_HELDOUT_GAIN';
 if(meetsCount&&adverse){
  reversionDecision='RETAIN_BASELINE_REVERT_CANDIDATE_IF_ALREADY_TESTING';
  reason='HELDOUT_REGRESSION_OR_SAFETY_BOUNDARY';
 }else if(meetsCount&&!adverse&&enoughImprovement&&batch.mode==='DECLARED_REVIEW_RESULTS'){
  reversionDecision='CONTINUE_SHADOW_ONLY';
  reason='DESCRIPTIVE_HOLDOUT_IMPROVEMENT_UNVERIFIED';
 }
 const holds=[
  'INDEPENDENT_HELDOUT_SOURCE_PROOF_REQUIRED',
  'PRE_REGISTERED_SPLIT_AND_SAMPLE_FREEZE_UNVERIFIED',
  'REVIEWER_AUTHENTICITY_UNVERIFIED',
  'REAL_OPERATIONAL_IMPROVEMENT_AND_REVERSION_UNVERIFIED',
  'PRODUCTION_ROLLBACK_CONTROLS_UNTESTED',
  ...(batch.mode==='SYNTHETIC_ONLY'?['SYNTHETIC_RESULTS_NOT_PRODUCTION_EVIDENCE']:[]),
  ...(!meetsCount?['MINIMUM_DEVELOPMENT_AND_HELDOUT_SAMPLES_REQUIRED']:[]),
  ...(pairedRegression?['HELDOUT_PAIRED_REGRESSIONS']:[]),
  ...(safetyRegression?['HELDOUT_SAFETY_REGRESSION']:[]),
  ...(accuracyDegradation?['HELDOUT_ACCURACY_DEGRADATION']:[]),
  ...(calibrationDegradation?['HELDOUT_CALIBRATION_DEGRADATION']:[]),
  ...(latencyBreach?['HELDOUT_LATENCY_BREACH']:[])
 ];
 return Object.freeze({
  schemaVersion:VERSION,stage:'A05',status:'HOLD',qualificationStatus:'HOLD',
  mode:batch.mode,
  partitionAlgorithm:'FIXED_SHA256_SAMPLE_ID_MOD5_V1',
  heldoutAssignmentBasedOnOutcomes:false,
  holdoutIndependentlyLocked:false,
  holdoutSampleCount:shadow.length,developmentSampleCount:development.length,
  minimumHoldoutCount:MIN_HOLDOUT,minimumDevelopmentCount:MIN_DEVELOPMENT,
  development:train,holdout,
  reversionDecision,reason,holds:Object.freeze(holds),
  independentReviewerVerified:false,productionLearningCertified:false,
  heldoutImprovementIndependentlyVerified:false,
  productionModelChanged:false,liveRollbackExecuted:false,
  autoPromotionAuthorized:false,autoRollbackAuthorized:false,
  paidModelRoutingAuthorized:false,businessActionAuthorized:false,
  productionWriteAuthorized:false,actionAuthorized:false,readOnly:true,
  modelInvocations:all.modelInvocations,
  sourceRecordsExported:false
 });
}


/**
 * Project a stored A05 result into a fixed aggregate-only receipt.
 * This rejects forged PASS/authority/rollback claims and discards arbitrary
 * extra fields. An R2 JSON receipt is NOT an independent signed evaluation.
 */
export function projectJarvisA05ShadowReceipt(x){
 const fail=()=>{throw Error('LEARNING_RECEIPT_UNVERIFIED')};
 const decisions=new Set(['RETAIN_BASELINE','CONTINUE_SHADOW_ONLY',
  'RETAIN_BASELINE_REVERT_CANDIDATE_IF_ALREADY_TESTING']);
 const reasons=new Set(['UNQUALIFIED_OR_NO_CLEAR_HELDOUT_GAIN',
  'DESCRIPTIVE_HOLDOUT_IMPROVEMENT_UNVERIFIED',
  'HELDOUT_REGRESSION_OR_SAFETY_BOUNDARY']);
 const mode=new Set(['SYNTHETIC_ONLY','DECLARED_REVIEW_RESULTS']);
 const nonnegative=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000;
 const n01=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1;
 const metric=v=>{
  if(!v||typeof v!=='object'||Array.isArray(v)||!nonnegative(v.sampleCount))fail();
  const positive=v.sampleCount>0;
  if(positive){
   if(!n01(v.accuracy)||!n01(v.brierScore)||!n01(v.expectedCalibrationError)||
    !Number.isFinite(v.latencyP95Ms)||v.latencyP95Ms<0||v.latencyP95Ms>300000)fail();
  }else if(v.accuracy!==null||v.brierScore!==null||
    v.expectedCalibrationError!==null||v.latencyP95Ms!==null)fail();
  if(!nonnegative(v.unsupportedClaims)||!nonnegative(v.overconfidentErrors))fail();
  return Object.freeze(Object.fromEntries(METRICS.map(k=>[k,v[k]])));
 };
 const group=v=>{
  if(!v||typeof v!=='object'||Array.isArray(v))fail();
  const baseline=metric(v.baseline),candidate=metric(v.candidate);
  if(baseline.sampleCount!==candidate.sampleCount||
   !nonnegative(v.regressions)||!nonnegative(v.improvements)||
   !nonnegative(v.safetyRegressions)||
   [v.regressions,v.improvements,v.safetyRegressions].some(n=>n>baseline.sampleCount))
   fail();
  return Object.freeze({baseline,candidate,
   regressions:v.regressions,improvements:v.improvements,
   safetyRegressions:v.safetyRegressions});
 };
 if(!x||typeof x!=='object'||Array.isArray(x)||x.schemaVersion!==VERSION||
  x.stage!=='A05'||x.status!=='HOLD'||x.qualificationStatus!=='HOLD'||
  !mode.has(x.mode)||x.partitionAlgorithm!=='FIXED_SHA256_SAMPLE_ID_MOD5_V1'||
  x.heldoutAssignmentBasedOnOutcomes!==false||
  x.holdoutIndependentlyLocked!==false||
  !nonnegative(x.holdoutSampleCount)||!nonnegative(x.developmentSampleCount)||
  x.holdoutSampleCount+x.developmentSampleCount>1000||
  x.minimumHoldoutCount!==MIN_HOLDOUT||x.minimumDevelopmentCount!==MIN_DEVELOPMENT||
  !decisions.has(x.reversionDecision)||!reasons.has(x.reason)||
  !Array.isArray(x.holds)||x.holds.length<4||x.holds.length>20||
  x.holds.some(k=>typeof k!=='string'||!/^[_A-Z0-9]{4,110}$/.test(k))||
  !x.holds.includes('INDEPENDENT_HELDOUT_SOURCE_PROOF_REQUIRED')||
  x.independentReviewerVerified!==false||
  x.productionLearningCertified!==false||
  x.heldoutImprovementIndependentlyVerified!==false||
  x.productionModelChanged!==false||x.liveRollbackExecuted!==false||
  x.autoPromotionAuthorized!==false||x.autoRollbackAuthorized!==false||
  x.paidModelRoutingAuthorized!==false||x.businessActionAuthorized!==false||
  x.productionWriteAuthorized!==false||x.actionAuthorized!==false||
  x.readOnly!==true||x.modelInvocations!==0||x.sourceRecordsExported!==false)
  fail();
 const development=group(x.development),holdout=group(x.holdout);
 if(development.baseline.sampleCount!==x.developmentSampleCount||
  holdout.baseline.sampleCount!==x.holdoutSampleCount)fail();
 return Object.freeze({
  schemaVersion:VERSION,stage:'A05',status:'HOLD',qualificationStatus:'HOLD',
  mode:x.mode,partitionAlgorithm:'FIXED_SHA256_SAMPLE_ID_MOD5_V1',
  holdoutIndependentlyLocked:false,heldoutAssignmentBasedOnOutcomes:false,
  holdoutSampleCount:x.holdoutSampleCount,developmentSampleCount:x.developmentSampleCount,
  minimumHoldoutCount:MIN_HOLDOUT,minimumDevelopmentCount:MIN_DEVELOPMENT,
  development,holdout,
  reversionDecision:x.reversionDecision,reason:x.reason,holds:Object.freeze([...x.holds]),
  independentReviewerVerified:false,productionLearningCertified:false,
  heldoutImprovementIndependentlyVerified:false,
  productionModelChanged:false,liveRollbackExecuted:false,
  autoPromotionAuthorized:false,autoRollbackAuthorized:false,
  paidModelRoutingAuthorized:false,businessActionAuthorized:false,
  productionWriteAuthorized:false,actionAuthorized:false,readOnly:true,
  modelInvocations:0,sourceRecordsExported:false
 });
}
