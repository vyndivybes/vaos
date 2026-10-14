/**
 * G5 founder Q&A over the existing private mission/handoff/evidence ledger.
 * Read-only: never count assigned actions as performed work, or a verified
 * handoff as a closed production mission.
 */
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{3,95}$/;
const STATUSES=new Set(['ACTIVE','PLANNED','READY_FOR_CLOSURE','COMPLETED','CLOSED','BLOCKED','HOLD','FAILED','CANCELLED']);
const safeCount=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000;
export function buildFounderMissionAnswer(question,source){
 if(typeof question!=='string'||question.length<5||question.length>300
   ||source?.schemaVersion!=='VAOS_FOUNDER_MISSION_SUMMARY_V1'
   ||source.sourceAuthority!=='vaos_founder_mission_answer_summary'
   ||source.sourceWindow!=='LATEST_10_MISSIONS'
   ||!safeCount(source.totalMissions)
   ||!Array.isArray(source.missions)||source.missions.length>10
   ||source.missions.some(m=>!ID.test(m?.id||'')||!STATUSES.has(m.status)
      ||!['workPackages','completedWorkPackages','blockedWorkPackages',
       'unfinishedHandoffs','awaitingReview','failedHandoffs'].every(k=>safeCount(m[k]))
      ||m.completedWorkPackages>m.workPackages||m.blockedWorkPackages>m.workPackages)
 )throw Error('MISSION_SUMMARY_UNVERIFIED');
 const latest=source.latestVerifiedWork;
 if(latest&&( !ID.test(latest.missionId||'')||!ID.test(latest.evidenceId||'')
   ||!/^[-.A-Z0-9_]{5,95}$/.test(latest.actionType||'')
   ||!ID.test(latest.ownerAgentId||'')
   ||!Number.isFinite(Date.parse(latest.verifiedAt||''))))
  throw Error('MISSION_SUMMARY_UNVERIFIED');
 let answer='',status='OBSERVED';
 const recovery=/\b(?:interrupt\w*|recover\w*|restart\w*|resum\w*|saved reports?)\b/i.test(question);
 const latestQuestion=/\b(?:latest|last|most recent|completed)\b/i.test(question)
   &&/\b(?:mission|department|evidence|handoff)\b/i.test(question);
 if(recovery){
  answer='G4 interrupted-task recovery uses the existing durable Supabase handoff record. '+
   'After restart, the consumer reads the immutable persisted evidence by handoff ID and version. '+
   'A report saved before SUBMIT is recoverable but NOT completed. A submitted report awaits its separate designated checker; '+
   'only a matching completed handoff and reviewed evidence reference count as verified. '+
   'If evidence is missing the task remains retry-eligible. This describes the implemented mechanism; '+
   'it does not assert that a particular interrupted mission was successfully recovered.';
 }else if(latestQuestion){
  if(latest){
   const found=source.missions.find(m=>m.id===latest.missionId);
   answer='Latest verified handoff for a department in the persisted ledger: mission '+latest.missionId+
    ', action '+latest.actionType+', assigned employee '+latest.ownerAgentId+
    ', immutable saved evidence '+latest.evidenceId+', reviewed '+latest.verifiedAt+'. '+
    'This verifies the named handoff only, not necessarily that the entire mission is closed.'+
    (found?' Mission currently recorded as '+found.status+'.':'');
  }else{
   status='HOLD';answer='No verified completed departmental handoff with paired immutable evidence is available in the authorized ledger. '+
    'I cannot identify a latest completed mission or invent a saved evidence reference.';
  }
 }else{
  // A closed or cancelled mission is not current outstanding execution.
  // READY_FOR_CLOSURE means work is complete but administrative closure
  // remains; it belongs in a separate group, not under unfinished work.
  const awaitingClosure=source.missions.filter(m=>m.status==='READY_FOR_CLOSURE');
  const cancelled=source.missions.filter(m=>m.status==='CANCELLED');
  const unfinished=source.missions.filter(m=>
    !['CLOSED','COMPLETED','CANCELLED','READY_FOR_CLOSURE'].includes(m.status)
    && (m.completedWorkPackages<m.workPackages || m.unfinishedHandoffs>0
      || m.awaitingReview>0 || ['HOLD','BLOCKED','FAILED'].includes(m.status)));
  if(unfinished.length===0){
   answer='No unfinished work identified in the latest '+source.missions.length+
    ' of '+source.totalMissions+' persisted missions. ';
  }else{
   answer='Unfinished work (latest '+source.missions.length+
    ' of '+source.totalMissions+' persisted missions): '+
    unfinished.slice(0,8).map(m=>m.id+' ('+m.status+': '+m.completedWorkPackages+
     ' of '+m.workPackages+' completed; '+m.blockedWorkPackages+
     ' blocked; '+m.unfinishedHandoffs+' unfinished handoffs; '+m.awaitingReview+
     ' submitted awaiting checker)').join('; ')+'. ';
  }
  if(awaitingClosure.length){
   answer+='Awaiting closure: '+awaitingClosure.map(m=>m.id+
    ' ('+m.completedWorkPackages+' of '+m.workPackages+
    ' work packages completed)').join('; ')+'. ';
  }
  if(cancelled.length){
   answer+=cancelled.length+' cancelled missions excluded from unfinished work. ';
  }
  if(source.totalMissions>source.missions.length){
   answer+='Older missions are outside this latest-ten-record window. ';
  }
  if(unfinished.length){
   answer+='Statuses identify work remaining; the underlying reason/cause is not established by status counts. '+
    'Consult the saved mission evidence for specific blockers before claiming a root cause.';
  }

 }
 return Object.freeze({
  schemaVersion:'VAOS_FOUNDER_MISSION_ANSWER_V1',sourceSystem:'VAOS_MISSION_CONTROL',
  sourceAuthority:'vaos_founder_mission_answer_summary',sourceWindow:'LATEST_10_MISSIONS',
  status,answer:answer.slice(0,3500),readOnly:true,actionAuthorized:false,
  businessEffectsExecuted:false,
  missionsObserved:source.missions.length,totalMissions:source.totalMissions,
 });
}
