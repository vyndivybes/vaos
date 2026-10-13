// Predetermined teaching inputs and answer key. Never upload to production.
export const TRAINING_OBSERVED_AT='2026-10-14T00:00:00.000Z';
export const ROLE_EXERCISES={
 orchestrator:{good:{owner:'project',prerequisite:'TRAINING-READY'},bad:{owner:'',prerequisite:''},expected:['OWNER_MISSING','PREREQUISITE_MISSING']},
 project:{good:{dueAt:'2026-10-15T00:00:00Z',completed:false},bad:{dueAt:'2026-10-13T00:00:00Z',completed:false},expected:['TASK_OVERDUE']},
 vibpe:{good:{configurationMatches:true,allowablesValidated:true},bad:{configurationMatches:false,allowablesValidated:false},expected:['CONFIGURATION_MISMATCH','ALLOWABLES_UNVALIDATED']},
 qa:{good:{defect:false,retestReviewed:true},bad:{defect:true,retestReviewed:false},expected:['DEFECT_PRESENT','RETEST_REQUIRED']},
 risk:{good:{blocked:false,scored:true},bad:{blocked:true,scored:false},expected:['BLOCKER_OBSERVED','RISK_SCORE_UNQUALIFIED']},
 security:{good:{roleAllowed:true,sessionValid:true},bad:{roleAllowed:false,sessionValid:false},expected:['ROLE_ACCESS_DENIED','SESSION_INVALID']},
 knowledge:{good:{sourceRef:'TRAINING-SOURCE',contradiction:false},bad:{sourceRef:'',contradiction:true},expected:['SOURCE_MISSING','SOURCE_CONTRADICTION']},
 release:{good:{approved:true,evidenceComplete:true},bad:{approved:false,evidenceComplete:false},expected:['RELEASE_APPROVAL_MISSING','RELEASE_EVIDENCE_INCOMPLETE']},
 commercial:{good:{commitmentApproved:true,orderQty:2},bad:{commitmentApproved:false,orderQty:2},expected:['COMMITMENT_UNAPPROVED']},
 procurement:{good:{required:5,available:5,unit:'pieces'},bad:{required:5,available:2,unit:''},expected:['UNIT_MISSING','SHORTAGE_OBSERVED']},
 inventory:{good:{opening:3,receipts:2,issues:4,lot:'TRAINING-LOT'},bad:{opening:3,receipts:2,issues:6,lot:''},expected:['NEGATIVE_STOCK','LOT_TRACE_MISSING']},
 production:{good:{configurationMatches:true,qualityHold:false},bad:{configurationMatches:false,qualityHold:true},expected:['CONFIGURATION_MISMATCH','QUALITY_HOLD']},
 maintenance:{good:{dueAt:'2026-10-15T00:00:00Z',returnProof:true},bad:{dueAt:'2026-10-13T00:00:00Z',returnProof:false},expected:['MAINTENANCE_OVERDUE','RETURN_PROOF_MISSING']},
 finance:{good:{debitPaise:10000,creditPaise:10000,paymentApproved:true},bad:{debitPaise:10000,creditPaise:9000,paymentApproved:false},expected:['LEDGER_UNBALANCED','PAYMENT_APPROVAL_MISSING']},
 people:{good:{attendanceRef:'TRAINING-ATTENDANCE',payrollApproved:true},bad:{attendanceRef:'',payrollApproved:false},expected:['ATTENDANCE_SOURCE_MISSING','PAYROLL_UNAPPROVED']},
 'engineering-configuration':{good:{expectedRevision:'TRAINING-R1',observedRevision:'TRAINING-R1',effectivityApproved:true},bad:{expectedRevision:'TRAINING-R1',observedRevision:'TRAINING-R2',effectivityApproved:false},expected:['BOM_REVISION_MISMATCH','EFFECTIVITY_UNAPPROVED']},
};
export function teachingRecord(employeeId,variant){return {id:'TRAINING-'+employeeId.toUpperCase()+'-'+variant.toUpperCase(),synthetic:true,...ROLE_EXERCISES[employeeId][variant]};}
