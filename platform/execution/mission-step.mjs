import {safeJobValidated} from './mission-consumer.mjs';

// Each HTTP invocation handles one maker/checker unit, rather than consuming
// eight jobs before reviewing. The old path can exceed the free-tier 50-fetch
// allowance and can invalidate early reports by changing later source states.
export async function runReadOnlyMissionStep({service,consumer,missionId}={}){
 const snapshot=await service.snapshot(missionId);
 if(snapshot?.mission?.id!==missionId||!['ACTIVE','HOLD'].includes(snapshot.mission.status)
  ||!Array.isArray(snapshot.handoffs)||!Array.isArray(snapshot.workPackages))throw Error('MISSION_STEP_SNAPSHOT_INVALID');
 const emptyConsumed={missionId,submitted:0,returned:0,unsupported:0,holds:[]};
 const emptyReviewed={missionId,verified:0,returned:0,unsupported:0};
 let consumed=emptyConsumed,reviewed=emptyReviewed,resubmitted=0;
 const returned=snapshot.handoffs.find(h=>h.status==='RETURNED'
  &&safeJobValidated(h,snapshot.workPackages.find(w=>w.id===h.work_package_id)));
 if(snapshot.mission.status==='HOLD'){
  // Only an attributable read-only correction may enter the existing SQL
  // RESUBMIT transition. Never clear a mission hold directly.
  const blockers=snapshot.workPackages.filter(w=>['BLOCKED','FAILED'].includes(w.status));
  if(!returned||blockers.length!==1||blockers[0].id!==returned.work_package_id
   ||snapshot.handoffs.some(h=>['ESCALATED','INFORMATION_REQUIRED','REJECTED'].includes(h.status)))throw Error('MISSION_HOLD_REQUIRES_REVIEW');
 }
 if(returned){
   const last=(snapshot.handoffEvents||[]).filter(e=>e.handoff_id===returned.id)
    .sort((a,b)=>Number(a.id)-Number(b.id)).at(-1);
   if(last?.to_status!=='RETURNED'||!['REJECT_VERIFICATION','RETURN_FOR_CORRECTION'].includes(last.outcome))throw Error('MISSION_RETURN_LINEAGE_MISSING');
   const actor=last.outcome==='REJECT_VERIFICATION'?returned.to_agent_id:returned.from_agent_id;
   await service.transitionHandoff({handoffId:returned.id,expectedVersion:returned.version,
    byAgentId:actor,outcome:'RESUBMIT',reason:'Recalculate bounded read-only evidence after governed return',evidenceRefs:[]});
   resubmitted=1;
 }else if(snapshot.handoffs.some(h=>h.status==='SUBMITTED')){
  reviewed=await consumer.review(missionId,{maxHandoffs:1});
 }else{
   consumed=await consumer.consume(missionId,{maxHandoffs:1});
   reviewed=await consumer.review(missionId,{maxHandoffs:1});
 }
 const current=await service.snapshot(missionId);
 if(current?.mission?.id!==missionId||!Array.isArray(current.workPackages))throw Error('MISSION_STEP_READBACK_INVALID');
 const remaining=current.workPackages.filter(w=>!['COMPLETED','CANCELLED'].includes(w.status)).length;
 return {consumed,reviewed,resubmitted,remaining,effectiveMaxHandoffs:1};
}
