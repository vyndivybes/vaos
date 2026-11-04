import {createHash} from 'node:crypto';
import {routeJob, buildMissionPlan} from '../../platform/runtime/vaos-eight-operating-model.mjs';

// Bounded departmental decisions, not an LLM or unrestricted business executor.
// This same handler is used by the authenticated exercise API. It cannot call
// networks, grant access, post ledgers, release engineering or certify a role.
const text=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,80}$/.test(v);
const count=v=>Number.isSafeInteger(v)&&v>=0&&v<=1000000;
const money=v=>Number.isSafeInteger(v)&&v>=0&&v<=1000000000;
const flag=v=>typeof v==='boolean';
const list=check=>v=>Array.isArray(v)&&v.length<=32&&v.every(check);
const oneOf=(...values)=>v=>values.includes(v);
const fields=(record,spec)=>record&&typeof record==='object'&&!Array.isArray(record)
 &&Object.keys(record).length===Object.keys(spec).length
 &&Object.entries(spec).every(([k,check])=>Object.hasOwn(record,k)&&check(record[k]));
const profiles={
 security:{action:'SECURITY.ASSESS_ACCESS',schema:{subject:text,sessionValid:flag,granted:list(text),requested:list(text)},run(r){
  const denied=r.requested.filter(x=>!r.granted.includes(x));
  return {decision:r.sessionValid&&!denied.length?'PREPARE':'DENY',findings:[...(!r.sessionValid?['SESSION_INVALID']:[]),...denied.map(x=>'CAPABILITY_DENIED:'+x)],result:{subject:r.subject,deniedCapabilities:denied}};
 }},
 orchestrator:{action:'ORCHESTRATOR.DECOMPOSE_MISSION',schema:{missionId:text,requestedJobs:list(text),availableOwners:list(text),completedPrerequisites:list(text)},run(r){
  if(!r.requestedJobs.length)throw Error('ROLE_SOURCE_INVALID');
  const plan=buildMissionPlan({missionId:r.missionId,objective:'Prepare bounded departmental work',requestedJobs:r.requestedJobs});
  const missingOwners=plan.workPackages.filter(w=>!r.availableOwners.includes(w.ownerAgentId)).map(w=>w.ownerAgentId);
  const waiting=plan.workPackages.filter(w=>w.dependsOn.some(id=>!r.completedPrerequisites.includes(plan.workPackages.find(p=>p.id===id)?.actionType))).map(w=>w.id);
  return {decision:missingOwners.length||waiting.length?'HOLD':'PREPARE',findings:[...missingOwners.map(x=>'OWNER_UNAVAILABLE:'+x),...waiting.map(x=>'PREREQUISITE_PENDING:'+x)],result:{plan,handoffProposals:plan.workPackages.map(w=>({ownerAgentId:w.ownerAgentId,actionType:w.actionType,verifierAgentIds:w.verifierAgentIds,dependsOn:w.dependsOn,dispatched:false}))}};
 }},
 project:{action:'PROJECT.DETECT_DELAY',schema:{taskId:text,dueEpoch:money,observedEpoch:money,completed:flag},run:r=>({decision:!r.completed&&r.observedEpoch>r.dueEpoch?'HOLD':'PREPARE',findings:!r.completed&&r.observedEpoch>r.dueEpoch?['TASK_OVERDUE']:[],result:{taskId:r.taskId,overdueSeconds:r.completed?0:Math.max(0,r.observedEpoch-r.dueEpoch)}})},
 vibpe:{action:'ENGINEERING.CHECK_CONFIGURATION',schema:{expectedRevision:text,observedRevision:text,units:oneOf('mm','m'),allowablesEvidence:flag},run:r=>({findings:[...(r.expectedRevision!==r.observedRevision?['CONFIGURATION_MISMATCH']:[]),...(r.units!=='mm'?['UNITS_MISMATCH']:[]),...(!r.allowablesEvidence?['ALLOWABLES_EVIDENCE_MISSING']:[])],result:{solverExecuted:false,expectedRevision:r.expectedRevision,observedRevision:r.observedRevision}})},
 qa:{action:'QA.VERIFY_RESULT',schema:{itemId:text,measurementMicrons:money,minimumMicrons:money,maximumMicrons:money,retestEvidence:flag},run(r){
  if(r.minimumMicrons>r.maximumMicrons)throw Error('ROLE_SOURCE_INVALID');
  const conforms=r.measurementMicrons>=r.minimumMicrons&&r.measurementMicrons<=r.maximumMicrons;
  return {findings:[...(!conforms?['MEASUREMENT_OUTSIDE_LIMITS']:[]),...(!r.retestEvidence?['RETEST_EVIDENCE_MISSING']:[])],result:{itemId:r.itemId,conforms,nonconformanceProposal:!conforms,capaClosed:false}};
 }},
 risk:{action:'RISK.SCORE',schema:{riskId:text,likelihood:oneOf(1,2,3,4,5),severity:oneOf(1,2,3,4,5),tolerance:oneOf(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25)},run:r=>({findings:r.likelihood*r.severity>r.tolerance?['RISK_EXCEEDS_SUPPLIED_TOLERANCE']:[],result:{riskId:r.riskId,score:r.likelihood*r.severity,tolerance:r.tolerance,riskAccepted:false}})},
 knowledge:{action:'KNOWLEDGE.RESOLVE_CONFLICT',schema:{sourceId:text,expectedRevision:text,observedRevision:text,ageDays:count,maxAgeDays:count},run:r=>({findings:[...(r.expectedRevision!==r.observedRevision?['SOURCE_REVISION_CONFLICT']:[]),...(r.ageDays>r.maxAgeDays?['SOURCE_STALE']:[])],result:{sourceId:r.sourceId,sourceSuperseded:false}})},
 release:{action:'RELEASE.CHECK_EVIDENCE',schema:{requiredGates:list(text),evidencedGates:list(text),engineeringHold:flag},run(r){
  if(!r.requiredGates.length)throw Error('ROLE_SOURCE_INVALID');
  const missing=r.requiredGates.filter(x=>!r.evidencedGates.includes(x));
  return {findings:[...missing.map(x=>'GATE_EVIDENCE_MISSING:'+x),...(r.engineeringHold?['ENGINEERING_HOLD']:[])],result:{missingGates:missing,releaseGranted:false}};
 }},
 commercial:{action:'COMMERCIAL.OBSERVE_PIPELINE',schema:{orderId:text,status:oneOf('draft','cancelled'),quantity:count,unitPricePaise:money},run:r=>({decision:r.status==='cancelled'?'HOLD':'PREPARE',findings:r.status==='cancelled'?['CANCELLED_ORDER_NOT_DEMAND']:[],result:{orderId:r.orderId,proposedAmountPaise:r.status==='cancelled'?0:r.quantity*r.unitPricePaise,commitmentExecuted:false}})},
 procurement:{action:'PROCUREMENT.OBSERVE_SHORTAGE',schema:{itemId:text,required:count,available:count,unit:oneOf('kg','each'),quoteUnit:oneOf('kg','each'),quotePaise:money},run:r=>({findings:r.unit!==r.quoteUnit?['QUOTE_UNIT_MISMATCH']:[],result:{itemId:r.itemId,shortage:Math.max(0,r.required-r.available),proposedCostPaise:r.unit===r.quoteUnit?Math.max(0,r.required-r.available)*r.quotePaise:null,purchaseOrderIssued:false}})},
 inventory:{action:'INVENTORY.OBSERVE_STOCK',schema:{itemId:text,lotId:text,opening:count,receipts:count,issues:count,reserved:count},run:r=>({findings:r.opening+r.receipts-r.issues-r.reserved<0?['NEGATIVE_AVAILABLE_STOCK']:[],result:{itemId:r.itemId,lotId:r.lotId,onHand:r.opening+r.receipts-r.issues,available:r.opening+r.receipts-r.issues-r.reserved,movementPosted:false}})},
 production:{action:'PRODUCTION.OBSERVE_WIP',schema:{jobId:text,status:oneOf('proposed','cancelled'),engineeringReleased:flag,qualityHold:flag,required:count,available:count},run:r=>({findings:[...(r.status==='cancelled'?['CANCELLED_JOB_NOT_DEMAND']:[]),...(!r.engineeringReleased?['ENGINEERING_RELEASE_MISSING']:[]),...(r.qualityHold?['QUALITY_HOLD']:[]),...(r.available<r.required?['MATERIAL_SHORTAGE']:[])],result:{jobId:r.jobId,shortage:Math.max(0,r.required-r.available),jobReleased:false}})},
 maintenance:{action:'MAINTENANCE.OBSERVE_ASSET',schema:{assetId:text,dueEpoch:money,observedEpoch:money,calibrationEvidence:flag},run:r=>({findings:[...(r.observedEpoch>r.dueEpoch?['MAINTENANCE_OVERDUE']:[]),...(!r.calibrationEvidence?['CALIBRATION_EVIDENCE_MISSING']:[])],result:{assetId:r.assetId,overdueSeconds:Math.max(0,r.observedEpoch-r.dueEpoch),returnedToService:false}})},
 finance:{action:'FINANCE.OBSERVE_LEDGER',schema:{invoiceId:text,debits:list(money),credits:list(money),poPaise:money,grnPaise:money,invoicePaise:money},run(r){
  const debit=r.debits.reduce((a,b)=>a+b,0),credit=r.credits.reduce((a,b)=>a+b,0);
  return {findings:[...(debit!==credit?['LEDGER_UNBALANCED']:[]),...(r.poPaise!==r.grnPaise||r.grnPaise!==r.invoicePaise?['THREE_WAY_MATCH_FAILED']:[])],result:{invoiceId:r.invoiceId,debitPaise:debit,creditPaise:credit,differencePaise:debit-credit,paymentExecuted:false}};
 }},
 people:{action:'PEOPLE.OBSERVE_WORKFORCE',schema:{subject:text,approvedDays:count,attendedDays:count,ratePaise:money,compensationApproved:flag},run:r=>({findings:[...(r.attendedDays>r.approvedDays?['ATTENDANCE_EXCEEDS_APPROVED_DAYS']:[]),...(!r.compensationApproved?['COMPENSATION_APPROVAL_MISSING']:[])],result:{subject:r.subject,proposedPayPaise:r.attendedDays<=r.approvedDays&&r.compensationApproved?r.attendedDays*r.ratePaise:null,payrollPosted:false}})},
 'engineering-configuration':{action:'ENGINEERING.OBSERVE_CONFIGURATION',schema:{expectedRevision:text,observedRevision:text,bomRevision:text,effectivityApproved:flag,engineeringHold:flag},run:r=>({findings:[...(r.expectedRevision!==r.observedRevision?['CONFIGURATION_MISMATCH']:[]),...(r.bomRevision!==r.expectedRevision?['BOM_REVISION_MISMATCH']:[]),...(!r.effectivityApproved?['EFFECTIVITY_UNAPPROVED']:[]),...(r.engineeringHold?['ENGINEERING_HOLD']:[])],result:{expectedRevision:r.expectedRevision,observedRevision:r.observedRevision,configurationReleased:false}})},
};

function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
export const sourceHash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const PREPARED_ROLE_IDS=Object.freeze(Object.keys(profiles));
export function executePreparedRole({employeeId,source}={}){
 const p=Object.hasOwn(profiles,employeeId)?profiles[employeeId]:null;
 if(!p||!fields(source,{ref:text,revision:text,classification:oneOf('SYNTHETIC_ISOLATED'),record:r=>fields(r,p.schema)}))throw Error('ROLE_SOURCE_INVALID');
 const route=routeJob(p.action);
 if(route.ownerAgentId!==employeeId)throw Error('ROLE_OWNER_MISMATCH');
 const calculated=p.run(source.record),findings=calculated.findings;
 const decision=calculated.decision||(findings.length?'HOLD':'PREPARE');
 return {schemaVersion:'VAOS_ROLE_RESPONSE_V1',employeeId,actionType:p.action,
  title:employeeId+' — isolated prepare response',status:'EXERCISE_RESPONSE_RECORDED',
  notice:'Synthetic bounded case response. Independent review required; no operational qualification granted.',
  executionKind:'DETERMINISTIC_BOUNDED_PREPARE',decision,findings,result:calculated.result,
  source:{ref:source.ref,revision:source.revision,sha256:sourceHash(source),classification:source.classification},
  handoff:{proposedVerifierIds:route.verifierAgentIds,dispatched:false,independentReview:'REQUIRED'},
  qualificationGranted:false,operationallyQualified:false,modelInvoked:false,
  businessEffectsExecuted:false,engineeringReleaseGranted:false,productionWriteAuthorized:false};
}
