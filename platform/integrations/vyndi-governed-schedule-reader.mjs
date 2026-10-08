import { fingerprintProposedBaseline, evaluateApprovedProgramSchedule, prepareScheduleEscalationRecommendation } from './vyndi-approved-schedule.mjs';

const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const withheld=(projectId,reason)=>({assessment:{
  status:'WITHHELD',reason,projectId,scope:'APPROVED_PROGRAM_BASELINE_ONLY',findings:[],
  approvalRef:null,sourceBaselineSha256:null,
},recommendation:{status:'NOT_ELIGIBLE',executed:false,approvalStatus:'NOT_REQUESTED'}});

export function createGovernedScheduleReader({sourceClient,approvedRegistry,now=()=>new Date()}={}){
 if(typeof sourceClient?.execute!=='function')throw new Error('SIGNED_VYNDI_SCHEDULE_READER_REQUIRED');
 if(typeof approvedRegistry?.getApproved!=='function')throw new Error('VAOS_TRUSTED_SCHEDULE_APPROVAL_REGISTRY_REQUIRED');
 return Object.freeze({
  async assess(projectId){
   if(typeof projectId!=='string'||!ID.test(projectId))throw new Error('PROJECT_ID_INVALID');
   let manifest,source;
   try {
    // Approval and observation are independent, server-only sources.
    [manifest,source]=await Promise.all([
      approvedRegistry.getApproved(projectId),
      sourceClient.execute({
        actionType:'PROJECT.OBSERVE_SCHEDULE',
        id:`schedule-poll:${crypto.randomUUID()}`,
        intentId:`schedule-read:${crypto.randomUUID()}`,
        payload:{projectId,limit:100,missionId:`schedule-poll:${projectId}`},
      }),
    ]);
   }catch{
    return withheld(projectId,'SCHEDULE_SOURCE_OR_REGISTRY_UNAVAILABLE');
   }
   if(!manifest?.baseline||!manifest?.approval)return withheld(projectId,'INDEPENDENT_APPROVAL_REQUIRED');
   const data=source?.data;
   if(source?.actionType!=='PROJECT.OBSERVE_SCHEDULE'
     ||source?.sourceAuthority!=='readGovernedProgramSchedule'
     ||source?.employeeId!=='project'
     ||data?.schemaVersion!=='vyndi.program.schedule-export.v1'
     ||data?.sourceSystem!=='VYNDI_OS'
     ||data?.projectId!==projectId
     ||data?.approvalStatus!=='UNAPPROVED_SOURCE_EXPORT'
     ||!Array.isArray(data.tasks)){
     return withheld(projectId,'VYNDI_SCHEDULE_SOURCE_CONTRACT_INVALID');
   }
   let currentCandidate;
   try{
    currentCandidate={
     schemaVersion:'vyndi.program.baseline.v1',sourceSystem:'VYNDI_OS',
     projectId,revision:manifest.approval.revision,
     tasks:data.tasks.map(task=>({
      id:task.id,owner:task.owner,plannedFinish:task.plannedFinish,sourceRef:task.sourceRef,
     })),
    };
    if(fingerprintProposedBaseline(currentCandidate)!==
        fingerprintProposedBaseline(manifest.baseline)){
      return withheld(projectId,'CURRENT_PLAN_DRIFT_FROM_APPROVED_BASELINE');
    }
   }catch{
    return withheld(projectId,'CURRENT_PLAN_UNVERIFIED_OR_TIMEZONE_MISSING');
   }
   const progress={
    schemaVersion:'vyndi.program.progress.v1',sourceSystem:'VYNDI_OS',
    projectId,capturedAt:data.capturedAt,
    tasks:data.tasks.map(task=>({
      id:task.id,status:task.status,
      actualFinish:task.actualFinish,
      sourceRef:task.sourceRef,
    })),
   };
   const assessment=evaluateApprovedProgramSchedule({
    baseline:manifest.baseline,
    approval:manifest.approval,
    progress,
    observedAt:now().toISOString(),
   });
   return {assessment,recommendation:prepareScheduleEscalationRecommendation(assessment)};
  },
 });
}
