/** Adaptive v3 readiness — strict evidence gates only. No activation, writes or paid providers.
 * Count thresholds refer to independently adjudicated novel-question samples.
 * They are NOT inferred from unit tests or source-row counts.
 */
const NATURAL = n => Number.isSafeInteger(n)&&n>=0;
const HOLDS = Object.freeze({
 DEPLOY:'DEPLOYMENT_UNVERIFIED',
 POLICY:'READ_ONLY_POLICY_UNVERIFIED',
 SAMPLE:'EVALUATION_SAMPLE_INSUFFICIENT',
 ACCURACY:'EVIDENCE_ACCURACY_BELOW_GATE',
 UNSUPPORTED:'UNSUPPORTED_CLAIM_DETECTED',
 LIVE:'LIVE_ACCEPTANCE_REQUIRED',
 SOURCE:'SOURCE_COVERAGE_BELOW_GATE',
 LATENCY:'LATENCY_UNQUALIFIED',
 BUDGET:'INFERENCE_BUDGET_UNVERIFIED',
 PAID:'PAID_ROUTING_NOT_AUTHORIZED',
 VOICE:'VOICE_READBACK_UNQUALIFIED',
});
export function assessUpgradeReadiness(x={}){
 if(!x||typeof x!=='object'||Array.isArray(x))x={};
 const holds=[];
 if(x.verifiedDeployment!==true)holds.push(HOLDS.DEPLOY);
 if(x.readOnlyControlsPassed!==true)holds.push(HOLDS.POLICY);
 if(!NATURAL(x.evaluatedQuestions)||x.evaluatedQuestions<20)holds.push(HOLDS.SAMPLE);
 if(!NATURAL(x.correctEvidenceResponses)||!NATURAL(x.evaluatedQuestions)||
    x.correctEvidenceResponses>x.evaluatedQuestions||
    x.correctEvidenceResponses*10<x.evaluatedQuestions*9)holds.push(HOLDS.ACCURACY);
 if(x.unsupportedClaims!==0)holds.push(HOLDS.UNSUPPORTED);
 if(!NATURAL(x.authenticatedLiveQuestions)||x.authenticatedLiveQuestions<10)holds.push(HOLDS.LIVE);
 if(!NATURAL(x.sourceLinkedAnswers)||!NATURAL(x.authenticatedLiveQuestions)||
    x.sourceLinkedAnswers>x.authenticatedLiveQuestions||
    x.sourceLinkedAnswers*10<x.authenticatedLiveQuestions*9)holds.push(HOLDS.SOURCE);
 if(!Number.isFinite(x.latencyP95Ms)||x.latencyP95Ms<0||x.latencyP95Ms>8000)
  holds.push(HOLDS.LATENCY);
 if(x.freeTierBudgetVerified!==true)holds.push(HOLDS.BUDGET);
 if(x.paidRoutingEnabled!==false)holds.push(HOLDS.PAID);
 if(x.voiceReadbackPassed!==true)holds.push(HOLDS.VOICE);
 return Object.freeze({
  state:holds.length?'HOLD':'READY_FOR_HUMAN_APPROVAL',
  holds:Object.freeze(holds),
  evaluatedQuestions:NATURAL(x.evaluatedQuestions)?x.evaluatedQuestions:null,
  authenticatedLiveQuestions:NATURAL(x.authenticatedLiveQuestions)?x.authenticatedLiveQuestions:null,
  autoActivationAuthorized:false,
  paidProvidersAuthorized:false,
  eligibleForAutomaticWrites:false,
  requirement:'Founder approval and independently recorded production qualification before changing runtime mode',
 });
}
const MODES=new Set(['MODEL_CHECKED_ADVISORY','DETERMINISTIC_EVIDENCE']);
const PLAN_MODES=new Set(['MODEL_PLANNED','RULE_FALLBACK']);
const REASONS=new Set(['BUDGET_EXHAUSTED','AI_BINDING_UNAVAILABLE','MODEL_ERROR',
 'DRAFT_REJECTED','NO_EVIDENCE','UNSUPPORTED_QUESTION','NONE']);
const VERIFY=new Set(['NOT_MODEL_VERIFIED','CANDIDATE_REJECTED','BOUNDED_CONSISTENCY_PASS','REJECTED']);
export function summarizeAdaptiveDiagnostics(x={}){
 const elapsedMs=Number.isFinite(x.elapsedMs)&&x.elapsedMs>=0&&x.elapsedMs<=60000
  ?Math.round(x.elapsedMs):null;
 const modelCalls=NATURAL(x.modelCalls)&&x.modelCalls<=2?x.modelCalls:null;
 const sourceCounts=NATURAL(x.observed)&&NATURAL(x.requested)&&x.requested<=3&&x.observed<=x.requested;
 const evidenceCoverage=!sourceCounts?'UNVERIFIED':x.requested===0?'NONE':
  x.observed===x.requested?'COMPLETE_FOR_SELECTED_SOURCES':x.observed===0?'UNAVAILABLE':'PARTIAL';
 const fallback=REASONS.has(x.fallbackReason)?x.fallbackReason:'UNVERIFIED';
 return Object.freeze({
  elapsedMs,
  planningMode:PLAN_MODES.has(x.planningMode)?x.planningMode:'UNVERIFIED',
  reasoningMode:MODES.has(x.reasoningMode)?x.reasoningMode:'UNVERIFIED',
  verificationStatus:VERIFY.has(x.verificationStatus)?x.verificationStatus:'UNVERIFIED',
  modelAvailability:fallback,
  modelCalls,
  evidenceCoverage,
  freeOnly:true,
  actionAuthorized:false,
  requiresQualification:true,
  upgradeStatus:'HOLD_PENDING_LIVE_ACCEPTANCE',
 });
}
