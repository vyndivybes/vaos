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

// Additional answer keys separate each finding and exercise boundary conditions.
export const EXTENDED_ROLE_EXERCISES={
 orchestrator:[{name:'owner-only',patch:{owner:''},expected:['OWNER_MISSING']},{name:'prerequisite-only',patch:{prerequisite:''},expected:['PREREQUISITE_MISSING']}],
 project:[{name:'at-deadline',patch:{dueAt:TRAINING_OBSERVED_AT},expected:[]},{name:'completed-late',patch:{dueAt:'2026-10-13T00:00:00Z',completed:true},expected:[]}],
 vibpe:[{name:'configuration-only',patch:{configurationMatches:false},expected:['CONFIGURATION_MISMATCH']},{name:'allowables-only',patch:{allowablesValidated:false},expected:['ALLOWABLES_UNVALIDATED']}],
 qa:[{name:'reviewed-defect',patch:{defect:true,retestReviewed:true},expected:['DEFECT_PRESENT']},{name:'no-defect-no-retest',patch:{defect:false,retestReviewed:false},expected:[]}],
 risk:[{name:'blocker-only',patch:{blocked:true},expected:['BLOCKER_OBSERVED']},{name:'unscored-only',patch:{scored:false},expected:['RISK_SCORE_UNQUALIFIED']}],
 security:[{name:'role-only',patch:{roleAllowed:false},expected:['ROLE_ACCESS_DENIED']},{name:'session-only',patch:{sessionValid:false},expected:['SESSION_INVALID']}],
 knowledge:[{name:'source-only',patch:{sourceRef:''},expected:['SOURCE_MISSING']},{name:'contradiction-only',patch:{contradiction:true},expected:['SOURCE_CONTRADICTION']}],
 release:[{name:'approval-only',patch:{approved:false},expected:['RELEASE_APPROVAL_MISSING']},{name:'evidence-only',patch:{evidenceComplete:false},expected:['RELEASE_EVIDENCE_INCOMPLETE']}],
 commercial:[{name:'zero-order',patch:{orderQty:0},expected:[]},{name:'zero-unapproved',patch:{orderQty:0,commitmentApproved:false},expected:['COMMITMENT_UNAPPROVED']}],
 procurement:[{name:'stock-surplus',patch:{available:6},expected:[]},{name:'shortage-only',patch:{available:4},expected:['SHORTAGE_OBSERVED']}],
 inventory:[{name:'zero-balance',patch:{issues:5},expected:[]},{name:'negative-only',patch:{issues:6},expected:['NEGATIVE_STOCK']}],
 production:[{name:'configuration-only',patch:{configurationMatches:false},expected:['CONFIGURATION_MISMATCH']},{name:'quality-only',patch:{qualityHold:true},expected:['QUALITY_HOLD']}],
 maintenance:[{name:'at-deadline',patch:{dueAt:TRAINING_OBSERVED_AT},expected:[]},{name:'return-only',patch:{returnProof:false},expected:['RETURN_PROOF_MISSING']}],
 finance:[{name:'zero-balanced',patch:{debitPaise:0,creditPaise:0},expected:[]},{name:'unbalanced-only',patch:{creditPaise:9999},expected:['LEDGER_UNBALANCED']}],
 people:[{name:'attendance-only',patch:{attendanceRef:''},expected:['ATTENDANCE_SOURCE_MISSING']},{name:'payroll-only',patch:{payrollApproved:false},expected:['PAYROLL_UNAPPROVED']}],
 'engineering-configuration':[{name:'revision-only',patch:{observedRevision:'TRAINING-R2'},expected:['BOM_REVISION_MISMATCH']},{name:'effectivity-only',patch:{effectivityApproved:false},expected:['EFFECTIVITY_UNAPPROVED']}],
};
export function roleTrainingCases(id){
 return [{name:'good',record:teachingRecord(id,'good'),expected:[]},
 {name:'bad',record:teachingRecord(id,'bad'),expected:ROLE_EXERCISES[id].expected},
 ...EXTENDED_ROLE_EXERCISES[id].map(x=>({name:x.name,record:{...teachingRecord(id,'good'),...x.patch,id:'TRAINING-'+id.toUpperCase()+'-'+x.name.toUpperCase()},expected:x.expected}))];
}
