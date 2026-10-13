/**
 * G4 read-only source trail projection from the existing authenticated
 * operating-mission snapshot. A coherent database transition log is not proof
 * of signer identity, source authenticity, independent competence or dispatch.
 */
const value=(obj,snake,camel)=>obj?.[snake]??obj?.[camel];
const asText=v=>typeof v==='string'?v.trim():'';
const stamp=v=>typeof v==='string'&&/^d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v)
 &&Number.isFinite(Date.parse(v))?Date.parse(v):null;
const dissentOutcomes=new Set(['INFORMATION_REQUIRED','REQUEST_INFO','RETURN','REJECT','ESCALATE','ESCALATED','DISPUTE','REOPEN']);
const safeArray=a=>Array.isArray(a)&&a.length<=512;
const invalid=()=>{throw Error('G4_TRAIL_SOURCE_UNQUALIFIED')};

export function summarizeG4HandoffTrail(snapshot) {
 const missionId=asText(snapshot?.mission?.id);
 const handoffs=snapshot?.handoffs,events=snapshot?.handoffEvents,work=snapshot?.workPackages;
 if(!missionId||!safeArray(handoffs)||!safeArray(events)||!safeArray(work))invalid();
 if(handoffs.length>64||work.length>128)invalid();
 const handoffIds=new Set();
 for(const h of handoffs){
  const id=asText(h?.id);
  if(!id||handoffIds.has(id))invalid();
  handoffIds.add(id);
 }
 const eventIds=new Set(),grouped=new Map();
 for(const e of events){
  const hId=asText(value(e,'handoff_id','handoffId'));
  if(!handoffIds.has(hId)||(!Number.isSafeInteger(e?.id)&&typeof e?.id!=='string')
   ||eventIds.has(String(e.id)))invalid();
  eventIds.add(String(e.id));
  if(!grouped.has(hId))grouped.set(hId,[]);
  grouped.get(hId).push(e);
 }
 const trainingOnly=missionId.startsWith('VAOS-QUAL-');
 const analyzed=handoffs.map(h=>{
  const id=asText(h.id),owner=asText(value(h,'to_agent_id','toAgentId'));
  const checker=asText(value(h,'verified_by_agent_id','verifiedByAgentId'));
  const fromAgent=asText(value(h,'from_agent_id','fromAgentId'));
  const missionMatches=asText(value(h,'mission_id','missionId'))===missionId;
  const packageId=asText(value(h,'work_package_id','workPackageId'));
  const wp=work.find(w=>asText(w?.id)===packageId);
  const ownerMatches=Boolean(wp)&&asText(value(wp,'owner_agent_id','ownerAgentId'))===owner;
  const refs=value(h,'evidence_refs','evidenceRefs');
  const pairedRefs=Array.isArray(refs)&&refs.some(r=>typeof r==='string'&&!r.startsWith('REVIEWED:')
   &&refs.includes('REVIEWED:'+r));
  const trace=grouped.get(id)||[];
  let coherent=trace.length>=4,priorTime=null,priorStatus=null;
  const stage=['CREATED','ACCEPT','SUBMIT','VERIFY'];
  const normalized=[];
  for(let i=0;i<trace.length;i++){
   const e=trace[i];
   const outcome=asText(e?.outcome),from=asText(value(e,'from_status','fromStatus'));
   const to=asText(value(e,'to_status','toStatus'));
   const actor=asText(value(e,'by_agent_id','byAgentId'));
   const when=stamp(value(e,'created_at','createdAt'));
   if(!outcome||!to||!actor||when===null||priorTime!==null&&when<priorTime
    ||i===0&&(outcome!=='CREATED'||from!==''||to!=='PENDING'||actor!==fromAgent)
    ||i>0&&from!==priorStatus)coherent=false;
   priorTime=when;priorStatus=to;
   normalized.push({outcome,to,actor});
  }
  let cursor=-1;
  for(let i=0;i<normalized.length;i++){
   if(normalized[i].outcome===stage[cursor+1]){
    cursor++;
    if((cursor===1||cursor===2)&&normalized[i].actor!==owner)coherent=false;
    if(cursor===3&&normalized[i].actor!==checker)coherent=false;
   }else if(!dissentOutcomes.has(normalized[i].outcome))coherent=false;
  }
  const verifiedAt=stamp(value(h,'verified_at','verifiedAt'));
  const complete=coherent&&cursor===3&&normalized.at(-1)?.outcome==='VERIFY'
   &&normalized.at(-1)?.to==='COMPLETED'&&asText(h.status)==='COMPLETED'
   &&checker!==''&&checker!==owner&&checker!==fromAgent||false;
  // Verifier may be the requester; the only immutable restriction from the
  // existing handoff contract is that recipient cannot verify its own work.
  const recordedComplete=Boolean(coherent&&cursor===3&&normalized.at(-1)?.outcome==='VERIFY'
   &&normalized.at(-1)?.to==='COMPLETED'&&asText(h.status)==='COMPLETED'
   &&checker!==''&&checker!==owner&&missionMatches&&ownerMatches&&pairedRefs
   &&verifiedAt!==null&&priorTime!==null&&verifiedAt>=priorTime);
  const dissentRecorded=trace.some(e=>dissentOutcomes.has(asText(e?.outcome)));
  return Object.freeze({
   id,ownerId:owner||'UNRECORDED',checkerId:checker||'UNRECORDED',
   recordedState:asText(h.status)||'UNRECORDED',
   eventCount:trace.length,
   trailStatus:recordedComplete?'RECORDED_CHAIN_COMPLETE_ONLY':'RECORDED_CHAIN_INCOMPLETE',
   dissentRecorded,
   signedEvidenceVerified:false,checkerIdentityAuthenticated:false,
   approvedSourceScopeVerified:false
  });
 });
 const recordedCompleteChains=analyzed.filter(h=>h.trailStatus==='RECORDED_CHAIN_COMPLETE_ONLY').length;
 return Object.freeze({
  schemaVersion:'VAOS_G4_HANDOFF_TRAIL_V1',
  missionId,classification:trainingOnly?'ISOLATED_TRAINING_MISSION':'UNVERIFIED_NON_TRAINING_MISSION',
  trainingOnly,totalHandoffs:handoffs.length,recordedCompleteChains,
  recordedDissentCount:analyzed.filter(h=>h.dissentRecorded).length,
  auditState:'EVIDENCE_REVIEW_HOLD',
  holds:Object.freeze([
   ...(trainingOnly?['TRAINING_NOT_LIVE_PROOF']:[]),
   'INDEPENDENT_SOURCE_VERSION_SCOPE_REQUIRED',
   'AUTHENTICATED_REVIEWER_RECEIPT_REQUIRED',
   'SIGNED_HASHED_WORK_REPORT_REQUIRED',
   'DURABLE_READBACK_INDEPENDENT_ACCEPTANCE_REQUIRED',
   'DISSENT_REVIEW_AND_RESOLUTION_REQUIRED',
  ]),
  handoffs:Object.freeze(analyzed),
  independentReviewerAuthenticated:false,reportDigestVerified:false,
  provenanceVerified:false,productionWriteAuthorized:false,commissioned:false,
 });
}
