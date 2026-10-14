/** Founder-only projection of the EXISTING mission and immutable handoff evidence.
 * No new ledger, external reads, SQL surface, write permission or model inference.
 * A result is verified only if its persisted handoff has a different named checker,
 * a paired REVIEWED:evidence reference and matching immutable report readback.
 */
import {verifyReadOnlyMissionAudit,isMissionBridgeReadAction} from '../../../platform/execution/mission-consumer.mjs';

const MAX_JOBS=32;
const get=(item,snake,camel)=>item?.[snake]??item?.[camel];
const nonempty=x=>typeof x==='string'&&x.trim()!=='' ? x : null;
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/.test(x);
const statuses=new Set(['PENDING','ACCEPTED','SUBMITTED','COMPLETED','RETURNED','BLOCKED','FAILED','CANCELLED']);

function reportView(report,wp,evidence,packages){
 if(!report||report.schemaVersion!=='vaos.read-only-mission-audit.v1'
    ||report.kind!=='READ_ONLY_MISSION_AUDIT'
    ||report.actionType!==get(wp,'action_type','actionType')
    ||report.workPackageId!==wp.id||!Array.isArray(report.findings)
    ||report.findings.length>100)return null;
 const isSignedRead=isMissionBridgeReadAction(report.actionType);
 // The existing bridge receipt verifier checks authority, nonce, digest shape,
 // exact metadata keys and their consistency with the governed action catalog.
 if(isSignedRead&&!verifyReadOnlyMissionAudit(report,packages,wp.id))return null;
 const findings=report.findings;
 if(findings.some(x=>typeof x!=='string'||x.length>250))return null;
 return {
  evidenceId:evidence.id,
  kind:'READ_ONLY_MISSION_AUDIT',
  scope:typeof report.scope==='string'?report.scope:'MISSION_RECORDS_ONLY',
  sourceSystem:isSignedRead?'VYNDI_OS':'VAOS_MISSION_RECORDS',
  sourceAuthority:isSignedRead?report.sourceAuthority:null,
  observedRecords:isSignedRead?report.recordsObserved:null,
  sourceReceiptAt:isSignedRead?report.gatewayReceivedAt:null,
  // Findings are stored observations, NOT assertions of current operating truth.
  findings:findings.slice(0,24),
  findingsTruncated:findings.length>24,
  sourceRevisionVerified:false,
  sourceCompletenessVerified:false,
  businessEffectsExecuted:false,
  engineeringReleaseGranted:false,
 };
}
function persistedStatus(handoff,record){
 if(handoff.status==='COMPLETED'&&record?.verified)return 'VERIFIED_RESULT';
 if(handoff.status==='SUBMITTED'&&record)return 'SUBMITTED_AWAITING_REVIEW';
 if(handoff.status==='ACCEPTED'&&record)return 'RECORDED_AWAITING_SUBMISSION';
 if(handoff.status==='ACCEPTED')return 'ACCEPTED_RETRY_ELIGIBLE';
 if(handoff.status==='PENDING')return 'ASSIGNED_NOT_STARTED';
 if(handoff.status==='RETURNED')return 'RETURNED_FOR_CORRECTION';
 return handoff.status||'UNKNOWN';
}
function evidenceRefs(handoff){
 const refs=get(handoff,'evidence_refs','evidenceRefs');
 if(!Array.isArray(refs)||refs.some(x=>typeof x!=='string'))return null;
 const reportIds=[...new Set(refs.filter(x=>!x.startsWith('REVIEWED:')))];
 return {reportIds,refs};
}

export async function loadFounderMissionResults({snapshot,getWorkEvidence}={}){
 const mission=snapshot?.mission,wp=snapshot?.workPackages,hs=snapshot?.handoffs;
 if(!validId(mission?.id)||!Array.isArray(wp)||!Array.isArray(hs)
    ||wp.length<1||wp.length>MAX_JOBS||hs.length>MAX_JOBS
    ||typeof getWorkEvidence!=='function')throw Error('MISSION_RESULTS_SNAPSHOT_INVALID');
 const ids=new Set(),handoffs=new Map();
 for(const job of wp){
  if(typeof job?.id!=='string'||!job.id||ids.has(job.id)
     ||!nonempty(get(job,'action_type','actionType'))
     ||!nonempty(get(job,'owner_agent_id','ownerAgentId')))throw Error('MISSION_RESULTS_WORK_PACKAGE_INVALID');
  ids.add(job.id);
 }
 for(const handoff of hs){
  const packageId=get(handoff,'work_package_id','workPackageId');
  if(!ids.has(packageId)||handoffs.has(packageId)||!nonempty(handoff.id)
     ||!statuses.has(handoff.status))throw Error('MISSION_RESULTS_HANDOFF_INVALID');
  handoffs.set(packageId,handoff);
 }
 const jobs=await Promise.all(wp.map(async job=>{
  const handoff=handoffs.get(job.id);
  const base={workPackageId:job.id,ownerAgentId:get(job,'owner_agent_id','ownerAgentId'),
   actionType:get(job,'action_type','actionType'),workStatus:job.status,
   handoffId:handoff?.id||null,handoffStatus:handoff?.status||'UNASSIGNED',
   checkerAgentId:null,resultStatus:'UNASSIGNED',result:null};
  if(!handoff)return base;
  const owner=get(handoff,'to_agent_id','toAgentId');
  const action=get(handoff,'requested_job','requestedJob');
  if(owner!==base.ownerAgentId||action!==base.actionType)
   return {...base,resultStatus:'OWNER_OR_JOB_MISMATCH'};
  const refs=evidenceRefs(handoff);
  if(!refs||refs.reportIds.length>1)return {...base,resultStatus:'EVIDENCE_REFERENCE_CONFLICT'};
  const evidenceId=refs.reportIds[0]||null;
  let evidence=null;
  // ACCEPTED is the precise interrupted-recording recovery state. The
  // locator looks up the immutable (handoff, version) key, with no write.
  if(handoff.status==='ACCEPTED'){
   if(!Number.isSafeInteger(handoff.version)||handoff.version<1)
    return {...base,resultStatus:'HANDOFF_VERSION_INVALID'};
   evidence=await getWorkEvidence('handoff-version:'+handoff.id+':'+handoff.version);
  }else if(evidenceId){
   evidence=await getWorkEvidence(evidenceId);
  }
  if(evidence&&(evidence.handoff_id!==handoff.id||evidence.author_agent_id!==owner
      ||!nonempty(evidence.id)||(evidenceId&&evidence.id!==evidenceId)))
   return {...base,resultStatus:'EVIDENCE_OWNERSHIP_MISMATCH'};
  if((handoff.status==='SUBMITTED'||handoff.status==='COMPLETED')&&!evidence)
   return {...base,resultStatus:'EVIDENCE_READBACK_MISSING'};
  const projected=evidence?reportView(evidence.report,job,evidence,wp):null;
  if(evidence&&!projected)return {...base,resultStatus:'EVIDENCE_REPORT_INVALID'};
  const checker=get(handoff,'verified_by_agent_id','verifiedByAgentId');
  const verified=handoff.status==='COMPLETED'&&job.status==='COMPLETED'
    &&nonempty(checker)&&checker!==owner&&evidenceId===evidence?.id
    &&refs.refs.includes('REVIEWED:'+evidenceId);
  const state=persistedStatus(handoff,projected?{verified:!!verified}:null);
  return {...base,checkerAgentId:nonempty(checker),
   resultStatus:handoff.status==='COMPLETED'&&!verified
     ?'VERIFICATION_CHAIN_INCOMPLETE':state,
   result:projected};
 }));
 const count=state=>jobs.filter(item=>item.resultStatus===state).length;
 return Object.freeze({
  schemaVersion:'VAOS_FOUNDER_MISSION_RESULTS_V1',missionId:mission.id,
  missionStatus:nonempty(mission.status)||'UNKNOWN',
  source:'VAOS_PERSISTED_MISSION_AND_IMMUTABLE_WORK_EVIDENCE',
  readOnly:true,actionAuthorized:false,businessEffectsExecuted:false,
  jobs,summary:{
   total:jobs.length,assigned:jobs.filter(x=>x.handoffId).length,
   verified:count('VERIFIED_RESULT'),
   awaitingReview:count('SUBMITTED_AWAITING_REVIEW'),
   recoverable:count('RECORDED_AWAITING_SUBMISSION'),
   acceptedRetry:count('ACCEPTED_RETRY_ELIGIBLE'),
   assignedNotStarted:count('ASSIGNED_NOT_STARTED'),
   unsupportedOrBlocked:jobs.filter(x=>['UNASSIGNED','RETURNED_FOR_CORRECTION',
    'EVIDENCE_REFERENCE_CONFLICT','EVIDENCE_OWNERSHIP_MISMATCH',
    'EVIDENCE_READBACK_MISSING','EVIDENCE_REPORT_INVALID',
    'VERIFICATION_CHAIN_INCOMPLETE','OWNER_OR_JOB_MISMATCH',
    'HANDOFF_VERSION_INVALID','BLOCKED','FAILED','CANCELLED'].includes(x.resultStatus)).length,
  },
  limitations:[
   'A recorded read receipt proves a bounded signed read, not source completeness or business performance.',
   'Mission records inspections do not qualify engineering release, operational QA or IAM authority.',
   'Verified means an existing persisted handoff review chain, not a new external audit.',
  ],
 });
}
