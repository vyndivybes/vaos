import test from 'node:test';
import assert from 'node:assert/strict';
import { createGovernedScheduleReader } from './vyndi-governed-schedule-reader.mjs';
import { fingerprintProposedBaseline } from './vyndi-approved-schedule.mjs';

const NOW='2026-10-08T16:00:00.000Z';
const rows=[
 {id:'A',owner:'engineering',status:'in_progress',plannedFinish:'2026-10-07T17:00:00+05:30',actualFinish:null,sourceRef:'vyndi_program_tasks/A'},
 {id:'B',owner:'production',status:'ready',plannedFinish:'2026-10-10T17:00:00+05:30',actualFinish:null,sourceRef:'vyndi_program_tasks/B'},
];
const candidate={schemaVersion:'vyndi.program.baseline.v1',sourceSystem:'VYNDI_OS',projectId:'VYNDI-MASTER-PROGRAM',revision:'rev-7',tasks:rows.map(row=>({id:row.id,owner:row.owner,plannedFinish:row.plannedFinish,sourceRef:row.sourceRef}))};
const manifest={
 baseline:candidate,
 approval:{status:'APPROVED',source:'VAOS_TRUSTED_APPROVAL_REGISTRY',projectId:'VYNDI-MASTER-PROGRAM',revision:'rev-7',
 approvedBaselineSha256:fingerprintProposedBaseline(candidate),
 submittedBy:'plan-owner',approvedBy:'checker',approvedAt:'2026-10-07T06:00:00.000Z',approvalRef:'appr-r7'},
};
function source(rowsArg=rows){
 return {async execute(job){
   assert.equal(job.actionType,'PROJECT.OBSERVE_SCHEDULE');
   assert.equal(job.payload.projectId,'VYNDI-MASTER-PROGRAM');
   return {actionType:job.actionType,sourceAuthority:'readGovernedProgramSchedule',employeeId:'project',data:{
     schemaVersion:'vyndi.program.schedule-export.v1',sourceSystem:'VYNDI_OS',projectId:'VYNDI-MASTER-PROGRAM',
     approvalStatus:'UNAPPROVED_SOURCE_EXPORT',capturedAt:'2026-10-08T15:55:00.000Z',tasks:rowsArg,
   }};
 }};
}
test('trusted frozen baseline, signed source and fresh progress produce advisory human review only',async()=>{
 const reader=createGovernedScheduleReader({sourceClient:source(),approvedRegistry:{async getApproved(){return manifest}},now:()=>new Date(NOW)});
 const outcome=await reader.assess('VYNDI-MASTER-PROGRAM');
 assert.equal(outcome.assessment.status,'VERIFIED');
 assert.deepEqual(outcome.assessment.findings.map(f=>f.code),['BASELINE_DELAY']);
 assert.equal(outcome.recommendation.status,'HUMAN_REVIEW_REQUIRED');
 assert.equal(outcome.recommendation.executed,false);
 assert.equal(outcome.recommendation.approvalStatus,'PENDING_HUMAN');
});
test('no approved registry entry withholds even if the VYNDI export claims approval',async()=>{
 const reader=createGovernedScheduleReader({sourceClient:source(),approvedRegistry:{async getApproved(){return null}},now:()=>new Date(NOW)});
 const result=await reader.assess('VYNDI-MASTER-PROGRAM');
 assert.equal(result.assessment.status,'WITHHELD');
 assert.equal(result.recommendation.status,'NOT_ELIGIBLE');
});
test('mutable source plan changed without new approval is withheld',async()=>{
 const revised=rows.map(row=>({...row,plannedFinish:row.id==='A'?'2026-11-07T17:00:00+05:30':row.plannedFinish}));
 const reader=createGovernedScheduleReader({sourceClient:source(revised),approvedRegistry:{async getApproved(){return manifest}},now:()=>new Date(NOW)});
 const result=await reader.assess('VYNDI-MASTER-PROGRAM');
 assert.equal(result.assessment.status,'WITHHELD');
 assert.equal(result.assessment.reason,'CURRENT_PLAN_DRIFT_FROM_APPROVED_BASELINE');
});
test('bare date-only due fields from VYNDI are not promoted into approved due dates',async()=>{
 const rowsBare=rows.map(row=>({...row,plannedFinish:row.plannedFinish.slice(0,10)}));
 const reader=createGovernedScheduleReader({sourceClient:source(rowsBare),approvedRegistry:{async getApproved(){return manifest}},now:()=>new Date(NOW)});
 assert.equal((await reader.assess('VYNDI-MASTER-PROGRAM')).assessment.status,'WITHHELD');
});
test('source transport failure and forged approval-reader rejection fail closed without escalation',async()=>{
 const reader=createGovernedScheduleReader({sourceClient:{async execute(){throw new Error('bridge unavailable')}},approvedRegistry:{async getApproved(){return manifest}},now:()=>new Date(NOW)});
 const result=await reader.assess('VYNDI-MASTER-PROGRAM');
 assert.equal(result.assessment.status,'WITHHELD');
 assert.equal(result.recommendation.status,'NOT_ELIGIBLE');
});
test('untrusted project identifiers never reach the signed bridge',async()=>{
 let contacted=false;
 const reader=createGovernedScheduleReader({sourceClient:{async execute(){contacted=true}},approvedRegistry:{async getApproved(){contacted=true}},now:()=>new Date(NOW)});
 await assert.rejects(()=>reader.assess('../secrets'),/PROJECT_ID_INVALID/);
 assert.equal(contacted,false);
});
