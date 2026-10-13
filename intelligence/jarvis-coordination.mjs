import {VAOS_WORKFORCE_AGENT_IDS, VAOS_WORKFORCE_QUALIFICATION_FLOOR} from '../platform/runtime/vaos-eight-operating-model.mjs';

const ASSESSMENT_DATE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const ROUTES=Object.freeze({
 PROCUREMENT:['procurement','qa'], INVENTORY:['inventory','qa'],
 PRODUCTION:['production','qa'], ENGINEERING:['engineering-configuration','vibpe']
});
export const COORDINATION_DOMAINS=Object.freeze(Object.keys(ROUTES));
// This projection reads recorded qualifications only. It never grants authority.
export function planJarvisCoordination(snapshot, {now=Date.now()}={}) {
 const rows=snapshot?.workforce?.digitalEmployees;
 if(!Array.isArray(rows)||rows.length!==16||!Number.isFinite(now)||
  rows.some(r=>!r||!VAOS_WORKFORCE_AGENT_IDS.includes(r.id))||
  new Set(rows.map(r=>r.id)).size!==16) throw Error('JARVIS_COORDINATION_ROSTER_INVALID');
 const project=id=>{
  const row=rows.find(r=>r.id===id),q=row.qualificationLevel;
  const recordedFloorMet=row.status==='ACTIVE'&&Number.isInteger(q)&&q>=VAOS_WORKFORCE_QUALIFICATION_FLOOR[id]&&q<=4;
  const a=row.latestAssessment;
  // An assessment is a persisted claim, not independent validation of competence.
  const assessmentDate=typeof a?.assessedAt==='string'&&ASSESSMENT_DATE.test(a.assessedAt)?Date.parse(a.assessedAt):NaN;
  const recordedAssessmentFloorMet=recordedFloorMet&&a?.status==='PASS'&&
   Number.isInteger(a.targetLevel)&&a.targetLevel>=VAOS_WORKFORCE_QUALIFICATION_FLOOR[id]&&
   a.targetLevel<=q&&Number.isFinite(assessmentDate)&&assessmentDate<=now;
  const time=typeof row.heartbeatAt==='string'?Date.parse(row.heartbeatAt):NaN;
  const age=now-time;
  return {id,recordedQualification:Number.isInteger(q)&&q>=0&&q<=4?q:null,
   recordedFloorMet,recordedAssessmentFloorMet,
   heartbeatEvidence:Number.isFinite(age)&&age>=0
    ?age<=86400000?'RECENT_RECORD_ONLY':'STALE_RECORD':'MISSING_OR_INVALID',
   independentCompetenceVerified:false,runtimeVerified:false};
 };
 const projected=new Map(VAOS_WORKFORCE_AGENT_IDS.map(id=>[id,project(id)]));
 const missingOrInvalidPassEmployeeIds=VAOS_WORKFORCE_AGENT_IDS.filter(id=>!projected.get(id).recordedAssessmentFloorMet);
 const assessmentCoverage={
  latestRecordedPassEmployees:16-missingOrInvalidPassEmployeeIds.length,
  missingOrInvalidPassEmployeeIds,
  allSixteenRecorded:missingOrInvalidPassEmployeeIds.length===0,
  historicalMultiplicityVerified:false,independentEvidenceVerified:false,
  qualifiedForDispatch:false,
 };
 const reviews=COORDINATION_DOMAINS.map(domain=>{
  const [ownerId,verifierId]=ROUTES[domain];
  const owner=projected.get(ownerId),verifier=projected.get(verifierId);
  const floorMet=owner.recordedFloorMet&&verifier.recordedFloorMet;
  const assessmentsMet=owner.recordedAssessmentFloorMet&&verifier.recordedAssessmentFloorMet;
  return {domain,owner,verifier,assignment:'NOT_DISPATCHED',
   status:!floorMet?'RECORDED_QUALIFICATION_HOLD':!assessmentsMet?'RECORDED_ASSESSMENT_HOLD':'REVIEW_PROPOSAL_ONLY',
   holds:[...(!assessmentsMet?['PERSISTED_ROLE_ASSESSMENT_REQUIRED']:[]),
    'SOURCE_VERSION_AND_SCOPE_REQUIRED','INDEPENDENT_ROLE_EVIDENCE_REQUIRED',
    'FOUNDER_WORKFLOW_APPROVAL_REQUIRED','DURABLE_HANDOFF_AND_READBACK_REQUIRED']};
 });
 return {schemaVersion:'VAOS_JARVIS_COORDINATION_PROPOSAL_V1',status:'PROPOSAL_ONLY',
  source:'VAOS_PERSISTED_WORKFORCE_REGISTER',observedAt:new Date(now).toISOString(),
  assessmentCoverage,reviews,dispatchedAgents:0,modelCalls:0,actionAuthorized:false,agentDispatchAuthorized:false,
  productionWritesAuthorized:false,qualificationCertified:false};
}

/**
 * Reconcile normalized assessment-ledger rows without confusing row count with
 * distinct employee coverage. Historical re-assessments may legitimately
 * repeat an employee; missing identities cannot be filled by duplicate rows.
 * Input is a caller-supplied observation, not authenticated production proof.
 * No raw evidence, reviewer identities or operational authority is exported.
 */
export function reconcileJarvisAssessmentRows(rows) {
 if(!Array.isArray(rows)||rows.length>256)throw Error('ASSESSMENT_COVERAGE_INPUT_INVALID');
 const counts=new Map(VAOS_WORKFORCE_AGENT_IDS.map(id=>[id,0]));
 let recordedPassRows=0;
 for(const row of rows) {
  if(!row||typeof row!=='object'||Array.isArray(row)||
     !counts.has(row.employeeId)||typeof row.status!=='string'||
     !/^[A-Z][A-Z_]{1,39}$/.test(row.status))
   throw Error('ASSESSMENT_COVERAGE_INPUT_INVALID');
  if(row.status==='PASS') {
   recordedPassRows++;
   counts.set(row.employeeId,counts.get(row.employeeId)+1);
  }
 }
 const missingPassEmployeeIds=VAOS_WORKFORCE_AGENT_IDS.filter(id=>counts.get(id)===0);
 const repeatedPassEmployeeIds=VAOS_WORKFORCE_AGENT_IDS.filter(id=>counts.get(id)>1);
 return Object.freeze({
  schemaVersion:'VAOS_JARVIS_ASSESSMENT_COVERAGE_V1',
  status:missingPassEmployeeIds.length?'RECORDED_PASS_COVERAGE_HOLD':'RECORDED_PASS_COVERAGE_ONLY',
  totalCanonicalEmployees:VAOS_WORKFORCE_AGENT_IDS.length,
  recordedPassRows,distinctEmployeesWithPass:VAOS_WORKFORCE_AGENT_IDS.length-missingPassEmployeeIds.length,
  missingPassEmployeeIds:Object.freeze(missingPassEmployeeIds),
  repeatedPassEmployeeIds:Object.freeze(repeatedPassEmployeeIds),
  readOnly:true,rawRecordProvenanceVerified:false,independentEvidenceVerified:false,
  qualifiedForDispatch:false,actionAuthorized:false,productionWritesAuthorized:false
 });
}
