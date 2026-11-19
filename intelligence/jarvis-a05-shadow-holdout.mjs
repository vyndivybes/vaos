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
