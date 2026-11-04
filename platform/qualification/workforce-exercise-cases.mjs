import {sourceHash,PREPARED_ROLE_IDS} from '../../agents/workforce/prepare-executor.mjs';

// Versioned, server-owned synthetic sources. No customer, personnel, financial
// or engineering production data enters these fixtures. Expectations are kept
// in tests, not returned as purported independent review.
const cases={
 security:[{subject:'QUAL-SUBJECT',sessionValid:true,granted:['READ'],requested:['PAY']},{subject:'QUAL-SUBJECT',sessionValid:true,granted:['READ'],requested:['READ']}],
 orchestrator:[{missionId:'QUAL-MISSION',requestedJobs:['PROJECT.CREATE_WORK_PACKAGE'],availableOwners:[],completedPrerequisites:[]},{missionId:'QUAL-MISSION',requestedJobs:['PROJECT.CREATE_WORK_PACKAGE'],availableOwners:['project'],completedPrerequisites:[]}],
 project:[{taskId:'QUAL-TASK',dueEpoch:100,observedEpoch:200,completed:false},{taskId:'QUAL-TASK',dueEpoch:300,observedEpoch:200,completed:false}],
 vibpe:[{expectedRevision:'QUAL-R2',observedRevision:'QUAL-R1',units:'mm',allowablesEvidence:false},{expectedRevision:'QUAL-R2',observedRevision:'QUAL-R2',units:'mm',allowablesEvidence:true}],
 qa:[{itemId:'QUAL-ITEM',measurementMicrons:120,minimumMicrons:90,maximumMicrons:110,retestEvidence:false},{itemId:'QUAL-ITEM',measurementMicrons:100,minimumMicrons:90,maximumMicrons:110,retestEvidence:true}],
 risk:[{riskId:'QUAL-RISK',likelihood:4,severity:5,tolerance:10},{riskId:'QUAL-RISK',likelihood:1,severity:5,tolerance:10}],
 knowledge:[{sourceId:'QUAL-DOC',expectedRevision:'QUAL-R2',observedRevision:'QUAL-R1',ageDays:40,maxAgeDays:30},{sourceId:'QUAL-DOC',expectedRevision:'QUAL-R2',observedRevision:'QUAL-R2',ageDays:2,maxAgeDays:30}],
 release:[{requiredGates:['QA','ENGINEERING'],evidencedGates:['QA'],engineeringHold:true},{requiredGates:['QA','ENGINEERING'],evidencedGates:['QA','ENGINEERING'],engineeringHold:true}],
 commercial:[{orderId:'QUAL-ORDER',status:'cancelled',quantity:3,unitPricePaise:125},{orderId:'QUAL-ORDER',status:'draft',quantity:3,unitPricePaise:125}],
 procurement:[{itemId:'QUAL-ITEM',required:10,available:3,unit:'kg',quoteUnit:'each',quotePaise:100},{itemId:'QUAL-ITEM',required:10,available:3,unit:'kg',quoteUnit:'kg',quotePaise:100}],
 inventory:[{itemId:'QUAL-ITEM',lotId:'QUAL-LOT',opening:10,receipts:2,issues:8,reserved:5},{itemId:'QUAL-ITEM',lotId:'QUAL-LOT',opening:10,receipts:2,issues:8,reserved:3}],
 production:[{jobId:'QUAL-JOB',status:'cancelled',engineeringReleased:false,qualityHold:true,required:10,available:3},{jobId:'QUAL-JOB',status:'proposed',engineeringReleased:false,qualityHold:false,required:10,available:10}],
 maintenance:[{assetId:'QUAL-ASSET',dueEpoch:100,observedEpoch:200,calibrationEvidence:false},{assetId:'QUAL-ASSET',dueEpoch:300,observedEpoch:200,calibrationEvidence:true}],
 finance:[{invoiceId:'QUAL-INVOICE',debits:[100,50],credits:[140],poPaise:150,grnPaise:150,invoicePaise:160},{invoiceId:'QUAL-INVOICE',debits:[100,50],credits:[150],poPaise:150,grnPaise:150,invoicePaise:150}],
 people:[{subject:'QUAL-PSEUDONYM',approvedDays:20,attendedDays:21,ratePaise:100,compensationApproved:false},{subject:'QUAL-PSEUDONYM',approvedDays:20,attendedDays:18,ratePaise:100,compensationApproved:true}],
 'engineering-configuration':[{expectedRevision:'QUAL-R2',observedRevision:'QUAL-R1',bomRevision:'QUAL-R1',effectivityApproved:false,engineeringHold:true},{expectedRevision:'QUAL-R2',observedRevision:'QUAL-R2',bomRevision:'QUAL-R2',effectivityApproved:true,engineeringHold:true}],
};
export const EXERCISE_ORDER=Object.freeze(['security','orchestrator',...PREPARED_ROLE_IDS.filter(id=>!['security','orchestrator'].includes(id))]);
export function exerciseSource(employeeId,variant){
 if(!Object.hasOwn(cases,employeeId)||!['challenge','corrected'].includes(variant))throw Error('EXERCISE_CASE_UNKNOWN');
 return {ref:'QUAL-'+employeeId,revision:'role-cases-v1',classification:'SYNTHETIC_ISOLATED',record:structuredClone(cases[employeeId][variant==='challenge'?0:1])};
}
export const exerciseManifest=()=>EXERCISE_ORDER.map(employeeId=>({employeeId,cases:['challenge','corrected'].map(variant=>({variant,sha256:sourceHash(exerciseSource(employeeId,variant))}))}));
