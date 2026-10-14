import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFounderMissionResults} from './founder-mission-results.mjs';
import {getVyndiBridgeRoute} from '../../../packages/contracts/vyndi-write-bridge.mjs';
const action='INVENTORY.OBSERVE_STOCK',id='vaos-evidence:hand-1';
const authority=getVyndiBridgeRoute(action).authority;
const report={
 schemaVersion:'vaos.read-only-mission-audit.v1',
 kind:'READ_ONLY_MISSION_AUDIT',actionType:action,workPackageId:'wp-1',
 scope:'BOUNDED_VYNDI_READ_RECEIPT_ONLY',findings:['BOUNDED_SELECTED_RECORDS:2'],
 sourceSystem:'VYNDI_OS',sourceAuthority:authority,recordsObserved:2,
 gatewayReceivedAt:'2026-10-15T09:00:00.000Z',requestNonce:'a'.repeat(32),
 requestBodySha256:'b'.repeat(64),sourceRevisionVerified:false,
 sourceCompletenessVerified:false,businessEffectsExecuted:false,engineeringReleaseGranted:false,
};
function fixture(status='COMPLETED'){
 const work={id:'wp-1',action_type:action,owner_agent_id:'inventory',
  status:status==='COMPLETED'?'COMPLETED':'IN_PROGRESS'};
 const handoff={id:'hand-1',work_package_id:'wp-1',to_agent_id:'inventory',
  requested_job:action,status,version:2,
  evidence_refs:status==='COMPLETED'?[id,'REVIEWED:'+id]:
    status==='SUBMITTED'?[id]:[],
  verified_by_agent_id:status==='COMPLETED'?'orchestrator':null};
 return {mission:{id:'mission-001',status:'ACTIVE'},workPackages:[work],handoffs:[handoff]};
}
const saved={id,handoff_id:'hand-1',author_agent_id:'inventory',
 report,reportSha256:'a'.repeat(64)};
test('Founder Command reads immutable signed departmental result, distinct checker and no raw source data',async()=>{
 const seen=[];
 const data=await loadFounderMissionResults({snapshot:fixture(),getWorkEvidence:async key=>{seen.push(key);return saved;}});
 assert.deepEqual(seen,[id]);
 assert.equal(data.summary.verified,1);
 assert.equal(data.jobs[0].resultStatus,'VERIFIED_RESULT');
 assert.equal(data.jobs[0].checkerAgentId,'orchestrator');
 assert.equal(data.jobs[0].result.observedRecords,2);
 assert.equal(data.jobs[0].result.sourceAuthority,authority);
 assert.equal(data.readOnly,true);
 assert.equal(data.actionAuthorized,false);
 assert.equal(JSON.stringify(data).includes('reportSha256'),false);
});
test('completed with no paired independent review never counts verified',async()=>{
 const snap=fixture();snap.handoffs[0].evidence_refs=[id];
 const data=await loadFounderMissionResults({snapshot:snap,getWorkEvidence:async()=>saved});
 assert.equal(data.summary.verified,0);
 assert.equal(data.jobs[0].resultStatus,'VERIFICATION_CHAIN_INCOMPLETE');
});
test('submitted evidence remains awaiting checker, not complete',async()=>{
 const data=await loadFounderMissionResults({snapshot:fixture('SUBMITTED'),getWorkEvidence:async()=>saved});
 assert.equal(data.summary.verified,0);
 assert.equal(data.summary.awaitingReview,1);
 assert.equal(data.jobs[0].resultStatus,'SUBMITTED_AWAITING_REVIEW');
});
test('restart after immutable evidence record but before SUBMIT recovers exact handoff-version',async()=>{
 const snap=fixture('ACCEPTED');let key;
 const data=await loadFounderMissionResults({snapshot:snap,getWorkEvidence:async k=>{key=k;return saved;}});
 assert.equal(key,'handoff-version:hand-1:2');
 assert.equal(data.summary.recoverable,1);
 assert.equal(data.jobs[0].resultStatus,'RECORDED_AWAITING_SUBMISSION');
 assert.equal(data.summary.verified,0);
});
test('failed signed source read remains accepted and retry eligible, never a zero result',async()=>{
 const data=await loadFounderMissionResults({snapshot:fixture('ACCEPTED'),getWorkEvidence:async()=>null});
 assert.equal(data.summary.acceptedRetry,1);
 assert.equal(data.jobs[0].result,null);
 assert.equal(data.jobs[0].resultStatus,'ACCEPTED_RETRY_ELIGIBLE');
});
test('forged source authority, owner, raw report or extra fields never reach founder result',async()=>{
 for(const bad of [
  {...saved,author_agent_id:'production'},
  {...saved,report:{...report,sourceAuthority:'FAKE_AUTHORITY'}},
  {...saved,report:{...report,records:[{staff:'private'}]}},
 ]){
  const data=await loadFounderMissionResults({snapshot:fixture(),getWorkEvidence:async()=>bad});
  assert.equal(data.summary.verified,0);
  assert.ok(['EVIDENCE_OWNERSHIP_MISMATCH','EVIDENCE_REPORT_INVALID'].includes(data.jobs[0].resultStatus));
  assert.equal(data.jobs[0].result,null);
 }
});
test('backend outage propagates to an unavailable readback instead of fabricating missing evidence',async()=>{
 await assert.rejects(()=>loadFounderMissionResults({snapshot:fixture(),getWorkEvidence:async()=>{
  throw Error('DATABASE_OFFLINE_SECRET');
 }}),/DATABASE_OFFLINE_SECRET/);
});
test('unknown missions, too many jobs and duplicate handoffs are rejected before evidence reads',async()=>{
 let reads=0;const getter=async()=>{reads++;return saved;};
 await assert.rejects(()=>loadFounderMissionResults({snapshot:{...fixture(),mission:{id:'???'}},getWorkEvidence:getter}),/SNAPSHOT_INVALID/);
 const many=fixture();many.workPackages=Array.from({length:33},(_,i)=>({...many.workPackages[0],id:'wp-'+i}));
 await assert.rejects(()=>loadFounderMissionResults({snapshot:many,getWorkEvidence:getter}),/SNAPSHOT_INVALID/);
 const dup=fixture();dup.handoffs.push({...dup.handoffs[0],id:'hand-2'});
 await assert.rejects(()=>loadFounderMissionResults({snapshot:dup,getWorkEvidence:getter}),/HANDOFF_INVALID/);
 assert.equal(reads,0);
});
