/**
 * Evidence-first A01-A10 qualification gates.
 *
 * This is a read-only acceptance and next-review planner, NOT a replacement
 * for any live specialist, model, actuator, rollback controller or approval.
 * Only an independently checked record from a trusted verifier may certify
 * a stage; API callers cannot set a stage to PASS by reporting success.
 */
export const JARVIS_A01_A10_GATES=Object.freeze([
 Object.freeze({id:'A01',name:'Verified investigation',proofKind:'SIGNED_SOURCE_LINEAGE_AND_AUTHORITY'}),
 Object.freeze({id:'A02',name:'Autonomous planning',proofKind:'INDEPENDENT_PLAN_REPLAY_AND_SCOPE'}),
 Object.freeze({id:'A03',name:'Governed execution',proofKind:'AUTHORIZED_EXECUTION_DENIAL_AND_ROLLBACK'}),
 Object.freeze({id:'A04',name:'Predictive operations',proofKind:'OUT_OF_SAMPLE_FORECAST_CALIBRATION'}),
 Object.freeze({id:'A05',name:'Adaptive intelligence',proofKind:'HELD_OUT_LEARNING_IMPROVEMENT_AND_REVERSION'}),
 Object.freeze({id:'A06',name:'Collective agent intelligence',proofKind:'MULTI_AGENT_HANDOFF_RECOVERY'}),
 Object.freeze({id:'A07',name:'Multimodal cognition',proofKind:'MULTIMODAL_PROVENANCE_INJECTION_REJECTION'}),
 Object.freeze({id:'A08',name:'Causal reasoning',proofKind:'CAUSAL_COUNTERFACTUAL_VALIDATION'}),
 Object.freeze({id:'A09',name:'Self-optimization and recovery',proofKind:'SELF_HEAL_CANARY_AND_ROLLBACK'}),
 Object.freeze({id:'A10',name:'Federated autonomous enterprise',proofKind:'FEDERATED_END_TO_END_INDEPENDENT_RECONCILIATION'})
]);
const SOURCE_SCOPE=Object.freeze([
 Object.freeze({sourceKind:'inventory',owner:'inventory',verifier:'qa'}),
 Object.freeze({sourceKind:'shortages',owner:'procurement',verifier:'qa'}),
 Object.freeze({sourceKind:'purchaseOrders',owner:'procurement',verifier:'qa'})
]);
const SHA40=/^[a-f0-9]{40}$/i;
const SHA64=/^[a-f0-9]{64}$/i;
const fail=()=>{throw Error('JARVIS_PROGRESSION_SOURCE_INVALID');};
function validateSources(a01){
 if(a01?.schemaVersion!=='VAOS_JARVIS_A01_SOURCE_RECONCILIATION_V1'||
  !Array.isArray(a01.sources)||a01.sources.length!==SOURCE_SCOPE.length||
  new Set(a01.sources.map(s=>s?.sourceKind)).size!==SOURCE_SCOPE.length||
  a01.sources.some(s=>!SOURCE_SCOPE.some(k=>k.sourceKind===s?.sourceKind)||
   !['HOLD','MATCHED'].includes(s.consistency)||
   typeof s.authoritativeRevisionVerified!=='boolean'||
   typeof s.sourceCompletenessVerified!=='boolean'))fail();
 return SOURCE_SCOPE.map(scope=>({
  ...scope,
  source:a01.sources.find(s=>s.sourceKind===scope.sourceKind)
 }));
}
function validAttestation(record,gate,releaseSha,now){
 if(!record||record.stageId!==gate.id||record.kind!==gate.proofKind||
  !SHA40.test(releaseSha||'')||record.releaseSha!==releaseSha||
  !SHA64.test(record.proofSha256||'')||
  typeof record.reviewer!=='string'||typeof record.implementer!=='string'||
  !/^[a-z0-9][a-z0-9-]{2,63}$/i.test(record.reviewer)||
  !/^[a-z0-9][a-z0-9-]{2,63}$/i.test(record.implementer)||
  record.reviewer===record.implementer||record.negativeControlsPassed!==true||
  typeof record.verifiedAt!=='string'||typeof record.expiresAt!=='string')return false;
 const verified=Date.parse(record.verifiedAt),expires=Date.parse(record.expiresAt);
 return Number.isFinite(verified)&&Number.isFinite(expires)&&
  verified<=now&&expires>now&&expires-verified<=30*86400000&&
  now-verified<=30*86400000;
}
/**
 * A02 produces bounded source review tasks only. It cannot enqueue work.
 * Raw source records and invented remediation/authority are never copied.
 */
export function prepareJarvisA02SourceReview(a01){
 const sources=validateSources(a01);
 return Object.freeze({
  schemaVersion:'VAOS_JARVIS_A02_PREPARE_PLAN_V1',
  status:'PREPARE_ONLY',
  mission:'JARVIS-A01',
  workPackages:sources.map(({sourceKind,owner,verifier,source})=>Object.freeze({
   id:'A02-SOURCE-'+sourceKind.toUpperCase(),
   sourceKind,owner,verifier,
   verification:'CHECK_SOURCE_OF_RECORD_REVISION_COMPLETENESS_AND_LINEAGE',
   observedConsistency:source.consistency,
   independentlyQualified:source.consistency==='MATCHED'&&
    source.authoritativeRevisionVerified===true&&source.sourceCompletenessVerified===true,
   readOnly:true,executionEnabled:false
  })),
  agentDispatchAuthorized:false,productionWriteAuthorized:false,
  reviewerApprovalGranted:false,externalActionDispatched:false
 });
}
/**
 * Only independently authenticated, non-expired, exact-SHA evidence can
 * satisfy a gate. All previous gates must independently pass first.
 * Qualifying a stage NEVER changes per-action execution permissions.
 */
export async function assessJarvisA01A10({
 a01,specialists,attestations={},verifyEvidence,releaseSha,now=Date.now()
}={}){
 const plan=prepareJarvisA02SourceReview(a01);
 if(!Number.isFinite(now)||!attestations||
  typeof attestations!=='object'||Array.isArray(attestations))fail();
 const sourceReady=a01.consistencyGate==='PASS'&&
  a01.businessSourceAuthorityVerified===true&&
  a01.independentBusinessFactsCertified===true&&
  plan.workPackages.every(x=>x.independentlyQualified)&&
  specialists?.status==='BOUNDED_EVIDENCE'&&
  specialists?.sourceRevisionVerified===true&&
  specialists?.completeDatasetVerified===true;
 const stages=[];
 for(const gate of JARVIS_A01_A10_GATES){
  const previousPassed=stages.length===0||stages[stages.length-1].status==='PASS';
  const record=attestations[gate.id];
  let certified=false;
  if(previousPassed&&(gate.id!=='A01'||sourceReady)&&
    validAttestation(record,gate,releaseSha,now)&&typeof verifyEvidence==='function'){
   try{certified=(await verifyEvidence(Object.freeze({
    stageId:gate.id,proofKind:gate.proofKind,releaseSha,
    proofSha256:record.proofSha256,reviewer:record.reviewer,
    implementer:record.implementer,verifiedAt:record.verifiedAt,
    expiresAt:record.expiresAt,negativeControlsPassed:true
   })))===true;}catch{certified=false;}
  }
  const reason=certified?'INDEPENDENTLY_VERIFIED':
    !previousPassed?'PREVIOUS_STAGE_HOLD':
    gate.id==='A01'&&!sourceReady?'SOURCE_AUTHORITY_UNVERIFIED':
    'INDEPENDENT_ATTESTATION_REQUIRED';
  stages.push(Object.freeze({
   id:gate.id,name:gate.name,proofKind:gate.proofKind,
   status:certified?'PASS':'HOLD',reason
  }));
 }
 return Object.freeze({
  schemaVersion:'VAOS_JARVIS_A01_A10_GATED_PROGRESSION_V1',
  status:stages.every(x=>x.status==='PASS')?'QUALIFICATION_EVIDENCE_COMPLETE':'HOLD',
  stages:Object.freeze(stages),a02Plan:plan,
  currentUnqualifiedStage:stages.find(x=>x.status==='HOLD')?.id??null,
  readOnly:true,agentDispatchAuthorized:false,actionAuthorized:false,
  productionWriteAuthorized:false,externalActionDispatched:false,
  autonomousPolicyChangesAuthorized:false,
  /* Even a fully qualified stage does not grant transactional rights. */
  executionAuthorityUnaffected:true
 });
}
