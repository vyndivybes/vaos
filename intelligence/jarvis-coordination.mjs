import {VAOS_WORKFORCE_AGENT_IDS, VAOS_WORKFORCE_QUALIFICATION_FLOOR} from '../platform/runtime/vaos-eight-operating-model.mjs';

const ROUTES=Object.freeze({
 PROCUREMENT:['procurement','qa'], INVENTORY:['inventory','qa'],
 PRODUCTION:['production','qa'], ENGINEERING:['engineering-configuration','vibpe']
});
export const COORDINATION_DOMAINS=Object.freeze(Object.keys(ROUTES));
// This projection reads recorded qualifications only. It never grants authority.
export function planJarvisCoordination(snapshot, {now=Date.now()}={}) {
 const rows=snapshot?.workforce?.digitalEmployees;
 if(!Array.isArray(rows)||rows.length!==16||!Number.isFinite(now)||
  rows.some(r=>!r||!VAOS_WORKFORCE_AGENT_IDS.includes(r.id))||
  new Set(rows.map(r=>r.id)).size!==16) throw Error('JARVIS_COORDINATION_ROSTER_INVALID');
 const project=id=>{
  const row=rows.find(r=>r.id===id),q=row.qualificationLevel;
  const recordedFloorMet=row.status==='ACTIVE'&&Number.isInteger(q)&&q>=VAOS_WORKFORCE_QUALIFICATION_FLOOR[id]&&q<=4;
  const time=typeof row.heartbeatAt==='string'?Date.parse(row.heartbeatAt):NaN;
  const age=now-time;
  return {id,recordedQualification:Number.isInteger(q)&&q>=0&&q<=4?q:null,
   recordedFloorMet,heartbeatEvidence:Number.isFinite(age)&&age>=0
    ?age<=86400000?'RECENT_RECORD_ONLY':'STALE_RECORD':'MISSING_OR_INVALID',
   independentCompetenceVerified:false,runtimeVerified:false};
 };
 const reviews=COORDINATION_DOMAINS.map(domain=>{
  const [ownerId,verifierId]=ROUTES[domain];
  const owner=project(ownerId),verifier=project(verifierId);
  return {domain,owner,verifier,assignment:'NOT_DISPATCHED',
   status:owner.recordedFloorMet&&verifier.recordedFloorMet?'REVIEW_PROPOSAL_ONLY':'RECORDED_QUALIFICATION_HOLD',
   holds:['SOURCE_VERSION_AND_SCOPE_REQUIRED','INDEPENDENT_ROLE_EVIDENCE_REQUIRED',
    'FOUNDER_WORKFLOW_APPROVAL_REQUIRED','DURABLE_HANDOFF_AND_READBACK_REQUIRED']};
 });
 return {schemaVersion:'VAOS_JARVIS_COORDINATION_PROPOSAL_V1',status:'PROPOSAL_ONLY',
  source:'VAOS_PERSISTED_WORKFORCE_REGISTER',observedAt:new Date(now).toISOString(),
  reviews,dispatchedAgents:0,modelCalls:0,actionAuthorized:false,agentDispatchAuthorized:false,
  productionWritesAuthorized:false,qualificationCertified:false};
}
