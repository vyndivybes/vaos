/** Deterministic, isolated teaching exercises. Not production role executors. */
import {createHash} from 'node:crypto';
import {VAOS_WORKFORCE_AGENT_IDS} from '../runtime/vaos-eight-operating-model.mjs';

const validators={
 orchestrator:r=>['owner','prerequisite'].every(k=>typeof r[k]==='string'),
 project:r=>typeof r.dueAt==='string'&&typeof r.completed==='boolean',
 vibpe:r=>typeof r.configurationMatches==='boolean'&&typeof r.allowablesValidated==='boolean',
 qa:r=>typeof r.defect==='boolean'&&typeof r.retestReviewed==='boolean',
 risk:r=>typeof r.blocked==='boolean'&&typeof r.scored==='boolean',
 security:r=>typeof r.roleAllowed==='boolean'&&typeof r.sessionValid==='boolean',
 knowledge:r=>typeof r.sourceRef==='string'&&typeof r.contradiction==='boolean',
 release:r=>typeof r.approved==='boolean'&&typeof r.evidenceComplete==='boolean',
 commercial:r=>typeof r.commitmentApproved==='boolean'&&Number.isFinite(r.orderQty)&&r.orderQty>=0,
 procurement:r=>Number.isFinite(r.required)&&r.required>=0&&Number.isFinite(r.available)&&r.available>=0&&typeof r.unit==='string',
 inventory:r=>Number.isFinite(r.opening)&&Number.isFinite(r.receipts)&&r.receipts>=0&&Number.isFinite(r.issues)&&r.issues>=0&&Number.isFinite(r.opening+r.receipts)&&Number.isFinite(r.opening+r.receipts-r.issues)&&typeof r.lot==='string',
 production:r=>typeof r.configurationMatches==='boolean'&&typeof r.qualityHold==='boolean',
 maintenance:r=>typeof r.dueAt==='string'&&typeof r.returnProof==='boolean',
 finance:r=>Number.isSafeInteger(r.debitPaise)&&r.debitPaise>=0&&Number.isSafeInteger(r.creditPaise)&&r.creditPaise>=0&&typeof r.paymentApproved==='boolean',
 people:r=>typeof r.attendanceRef==='string'&&typeof r.payrollApproved==='boolean',
 'engineering-configuration':r=>typeof r.expectedRevision==='string'&&typeof r.observedRevision==='string'&&typeof r.effectivityApproved==='boolean',
};
export function evidenceHash(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
export function evaluateTrainingRecord(employeeId,record,{environment,observedAt}={}){
 if(environment!=='LOCAL_ISOLATED_SYNTHETIC')throw Error('ISOLATED_TRAINING_REQUIRED');
 if(!VAOS_WORKFORCE_AGENT_IDS.includes(employeeId))throw Error('TRAINING_ROLE_UNKNOWN');
 if(!Number.isFinite(Date.parse(observedAt)))throw Error('TRAINING_TIME_REQUIRED');
 if(!record||record.synthetic!==true||typeof record.id!=='string'||!/^TRAINING-[A-Z0-9-]+$/.test(record.id))throw Error('SYNTHETIC_RECORD_REQUIRED');
 const ok=validators[employeeId](record);
 if(!ok)throw Error('TRAINING_SOURCE_INVALID');
 if(['project','maintenance'].includes(employeeId)&&!Number.isFinite(Date.parse(record.dueAt)))throw Error('TRAINING_SOURCE_INVALID');
 const blank=value=>!value.trim();
 const findings=[]; const flag=(condition,code)=>{if(condition)findings.push(code);};
 switch(employeeId){
 case 'orchestrator':flag(blank(record.owner),'OWNER_MISSING');flag(blank(record.prerequisite),'PREREQUISITE_MISSING');break;
 case 'project':flag(!record.completed&&Date.parse(record.dueAt)<Date.parse(observedAt),'TASK_OVERDUE');break;
 case 'vibpe':flag(!record.configurationMatches,'CONFIGURATION_MISMATCH');flag(!record.allowablesValidated,'ALLOWABLES_UNVALIDATED');break;
 case 'qa':flag(record.defect,'DEFECT_PRESENT');flag(record.defect&&!record.retestReviewed,'RETEST_REQUIRED');break;
 case 'risk':flag(record.blocked,'BLOCKER_OBSERVED');flag(!record.scored,'RISK_SCORE_UNQUALIFIED');break;
 case 'security':flag(!record.roleAllowed,'ROLE_ACCESS_DENIED');flag(!record.sessionValid,'SESSION_INVALID');break;
 case 'knowledge':flag(blank(record.sourceRef),'SOURCE_MISSING');flag(record.contradiction,'SOURCE_CONTRADICTION');break;
 case 'release':flag(!record.approved,'RELEASE_APPROVAL_MISSING');flag(!record.evidenceComplete,'RELEASE_EVIDENCE_INCOMPLETE');break;
 case 'commercial':flag(!record.commitmentApproved,'COMMITMENT_UNAPPROVED');break;
 case 'procurement':flag(blank(record.unit),'UNIT_MISSING');flag(record.required>record.available,'SHORTAGE_OBSERVED');break;
 case 'inventory':flag(record.opening+record.receipts-record.issues<0,'NEGATIVE_STOCK');flag(blank(record.lot),'LOT_TRACE_MISSING');break;
 case 'production':flag(!record.configurationMatches,'CONFIGURATION_MISMATCH');flag(record.qualityHold,'QUALITY_HOLD');break;
 case 'maintenance':flag(Date.parse(record.dueAt)<Date.parse(observedAt),'MAINTENANCE_OVERDUE');flag(!record.returnProof,'RETURN_PROOF_MISSING');break;
 case 'finance':flag(record.debitPaise!==record.creditPaise,'LEDGER_UNBALANCED');flag(!record.paymentApproved,'PAYMENT_APPROVAL_MISSING');break;
 case 'people':flag(blank(record.attendanceRef),'ATTENDANCE_SOURCE_MISSING');flag(!record.payrollApproved,'PAYROLL_UNAPPROVED');break;
 case 'engineering-configuration':flag(record.expectedRevision!==record.observedRevision,'BOM_REVISION_MISMATCH');flag(!record.effectivityApproved,'EFFECTIVITY_UNAPPROVED');break;
 }
 return {schemaVersion:'VAOS_ROLE_TRAINING_OUTPUT_V1',employeeId,sourceRef:record.id,
  sourceHash:evidenceHash(record),environment,observedAt,findings,
  status:findings.length?'TRAINING_FINDINGS':'TRAINING_NO_FINDINGS',
  synthetic:true,productionWriteAuthorized:false,qualificationGranted:false};
}
