/**
 * Existing Founder Command -> Founder Inbox -> governed G4 mission routing.
 * One explicit user submission. Retry safety comes from the original immutable
 * message ID; this module does not execute departmental effects.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MISSION=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/;
const expectedMission=id=>'founder-'+id.toLowerCase().replace(/-/g,'');

export async function createFounderMission({command,messageId,request}={}){
 if(!command||command.kind!=='INSTRUCTION'
   ||command.recipientAgentId!=='orchestrator'
   ||command.executionAuthorized!==false
   ||typeof command.instruction!=='string'
   ||command.instruction.trim().length<5||command.instruction.length>2000
   ||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(command.instruction)
   ||!UUID.test(messageId||'')||typeof request!=='function'){
  throw Error('FOUNDER_MISSION_COMMAND_INVALID');
 }
 const saved=await request('/api/founder-inbox',{
  method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({messageId,agentId:'orchestrator',kind:'INSTRUCTION',instruction:command.instruction.trim()}),
 });
 let stored;
 try{stored=(await saved.json())?.data?.message;}catch{}
 if(!saved.ok||stored?.status!=='RECORDED_NOT_ROUTED'){
  throw Error('FOUNDER_MISSION_RECORDING_UNCONFIRMED');
 }
 const routed=await request('/api/missions',{
  method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({operation:'ROUTE_FOUNDER_INSTRUCTION',messageId}),
 });
 let mission;
 try{mission=(await routed.json())?.data;}catch{}
 if(!routed.ok||mission?.sourceMessageId!==messageId
   ||mission.missionId!==expectedMission(messageId)
   ||!Number.isInteger(mission.assignedWorkPackages)
   ||!Number.isInteger(mission.totalWorkPackages)
   ||mission.totalWorkPackages<1||mission.totalWorkPackages>15
   ||mission.assignedWorkPackages<0
   ||mission.assignedWorkPackages>mission.totalWorkPackages
   ||mission.businessEffectsExecuted!==false){
  throw Error('FOUNDER_MISSION_ROUTING_UNCONFIRMED');
 }
 return Object.freeze({
  missionId:mission.missionId,assignedWorkPackages:mission.assignedWorkPackages,
  totalWorkPackages:mission.totalWorkPackages,
  status:mission.status||'ASSIGNMENT_UNVERIFIED',
  businessEffectsExecuted:false,
 });
}

export function formatFounderMissionResults(record,id){
 const s=record?.summary,work=record?.jobs;
 if(!MISSION.test(id||'')||record?.schemaVersion!=='VAOS_FOUNDER_MISSION_RESULTS_V1'
   ||record.missionId!==id||record.readOnly!==true
   ||record.actionAuthorized!==false
   ||record.snapshot?.mission?.id!==id||!Array.isArray(work)
   ||work.length<1||work.length>32
   ||!s||s.total!==work.length||!['ACTIVE','READY_FOR_CLOSURE','COMPLETED','CLOSED','BLOCKED','FAILED','PLANNED'].includes(record.missionStatus)
   ||['verified','awaitingReview','recoverable','acceptedRetry','assignedNotStarted','unsupportedOrBlocked']
     .some(key=>!Number.isSafeInteger(s[key])||s[key]<0||s[key]>s.total)){
  throw Error('FOUNDER_MISSION_RESULTS_INVALID');
 }
 const rows=work.map(item=>{
  if(typeof item?.ownerAgentId!=='string'||typeof item?.actionType!=='string'
     ||typeof item?.resultStatus!=='string'||item.ownerAgentId.length>80
     ||item.actionType.length>100||item.resultStatus.length>80)
    throw Error('FOUNDER_MISSION_RESULTS_INVALID');
  const state=item.ownerAgentId+' · '+item.actionType+' — '+item.resultStatus;
  if(!item.result)return state;
  const result=item.result;
  if(typeof result.evidenceId!=='string'||result.evidenceId.length>110
     ||!Array.isArray(result.findings)||result.findings.length>24
     ||result.findings.some(x=>typeof x!=='string'||x.length>250)
     ||!['VYNDI_OS','VAOS_MISSION_RECORDS'].includes(result.sourceSystem)){
    throw Error('FOUNDER_MISSION_RESULTS_INVALID');
  }
  const source=result.sourceSystem==='VYNDI_OS'
   ?' | '+result.observedRecords+' selected records from '+result.sourceAuthority
   :' | '+result.scope;
  const findings=result.findings.length?'\n   '+result.findings.slice(0,5).join(' · ')+
    (result.findingsTruncated?' [additional saved findings]':''):'';
  return state+source+' | saved evidence '+result.evidenceId+findings;
 });
 return 'Mission: '+id+'\nStatus: '+record.missionStatus+
  '\nVerified: '+s.verified+'/'+s.total+
  ' | Submitted: '+s.awaitingReview+
  ' | Recorded, recoverable: '+s.recoverable+
  ' | Retry eligible: '+s.acceptedRetry+
  ' | Assigned, not started: '+s.assignedNotStarted+
  ' | Blocked/unassigned: '+s.unsupportedOrBlocked+
  '\n\nDepartmental results (persisted, read-only)\n'+rows.join('\n')+
  '\n\nReceipts are bounded observations, not company-wide totals or engineering releases.';
}
