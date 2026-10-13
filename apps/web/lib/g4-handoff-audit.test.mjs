import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {summarizeG4HandoffTrail} from './g4-handoff-audit.mjs';

const example=()=>({
 mission:{id:'VAOS-QUAL-TRAINING-20261014',status:'READY_FOR_CLOSURE'},
 workPackages:[{id:'wp-1',owner_agent_id:'qa',status:'COMPLETED'}],
 handoffs:[{id:'handoff-1',mission_id:'VAOS-QUAL-TRAINING-20261014',work_package_id:'wp-1',
  from_agent_id:'orchestrator',to_agent_id:'qa',status:'COMPLETED',version:4,
  verified_by_agent_id:'project',verified_at:'2026-10-13T10:00:03Z',
  evidence_refs:['training-ref','REVIEWED:training-ref']}],
 handoffEvents:[
  {id:1,handoff_id:'handoff-1',outcome:'CREATED',from_status:null,to_status:'PENDING',by_agent_id:'orchestrator',created_at:'2026-10-13T10:00:00Z'},
  {id:2,handoff_id:'handoff-1',outcome:'ACCEPT',from_status:'PENDING',to_status:'ACCEPTED',by_agent_id:'qa',created_at:'2026-10-13T10:00:01Z'},
  {id:3,handoff_id:'handoff-1',outcome:'SUBMIT',from_status:'ACCEPTED',to_status:'SUBMITTED',by_agent_id:'qa',created_at:'2026-10-13T10:00:02Z'},
  {id:4,handoff_id:'handoff-1',outcome:'VERIFY',from_status:'SUBMITTED',to_status:'COMPLETED',by_agent_id:'project',created_at:'2026-10-13T10:00:03Z'},
 ],
});
test('complete historical training transitions are readable but never certify G4 or employee competence',()=>{
 const result=summarizeG4HandoffTrail(example());
 assert.equal(result.schemaVersion,'VAOS_G4_HANDOFF_TRAIL_V1');
 assert.equal(result.trainingOnly,true);
 assert.equal(result.classification,'ISOLATED_TRAINING_MISSION');
 assert.equal(result.totalHandoffs,1);
 assert.equal(result.recordedCompleteChains,1);
 assert.equal(result.auditState,'EVIDENCE_REVIEW_HOLD');
 assert.equal(result.independentReviewerAuthenticated,false);
 assert.equal(result.reportDigestVerified,false);
 assert.equal(result.provenanceVerified,false);
 assert.equal(result.productionWriteAuthorized,false);
 assert.equal(result.commissioned,false);
 assert.equal(result.handoffs[0].trailStatus,'RECORDED_CHAIN_COMPLETE_ONLY');
 assert.doesNotMatch(JSON.stringify(result),/training-ref|REVIEWED:/);
});
test('missing evidence, independent reviewer and chain discontinuity are visible holds',()=>{
 for(const mutate of [
   s=>{s.handoffs[0].evidence_refs=['training-ref'];},
   s=>{s.handoffs[0].verified_by_agent_id='qa';},
   s=>{s.handoffEvents.splice(2,1);},
   s=>{s.handoffEvents[3].from_status='PENDING';},
   s=>{s.handoffEvents[3].created_at='2026-10-13T09:59:50Z';},
 ]) {
  const s=example();mutate(s);
  const x=summarizeG4HandoffTrail(s);
  assert.equal(x.recordedCompleteChains,0);
  assert.equal(x.handoffs[0].trailStatus,'RECORDED_CHAIN_INCOMPLETE');
  assert.equal(x.commissioned,false);
 }
});
test('dissent remains visible even after a completed trail',()=>{
 const s=example();
 s.handoffEvents.splice(2,0,{id:5,handoff_id:'handoff-1',outcome:'INFORMATION_REQUIRED',from_status:'ACCEPTED',to_status:'INFORMATION_REQUIRED',by_agent_id:'project',created_at:'2026-10-13T10:00:01.200Z'},
  {id:6,handoff_id:'handoff-1',outcome:'RETURN',from_status:'INFORMATION_REQUIRED',to_status:'ACCEPTED',by_agent_id:'qa',created_at:'2026-10-13T10:00:01.400Z'});
 const x=summarizeG4HandoffTrail(s);
 assert.equal(x.recordedDissentCount,1);
 assert.equal(x.handoffs[0].dissentRecorded,true);
 assert.equal(x.auditState,'EVIDENCE_REVIEW_HOLD');
 assert.equal(x.commissioned,false);
});
test('unknown event joins, duplicate event IDs and missing authoritative event array fail closed',()=>{
 const s=example();delete s.handoffEvents;assert.throws(()=>summarizeG4HandoffTrail(s),/G4_TRAIL_SOURCE_UNQUALIFIED/);
 const unknown=example();unknown.handoffEvents[1].handoff_id='invented';assert.throws(()=>summarizeG4HandoffTrail(unknown),/G4_TRAIL_SOURCE_UNQUALIFIED/);
 const dup=example();dup.handoffEvents[1].id=1;assert.throws(()=>summarizeG4HandoffTrail(dup),/G4_TRAIL_SOURCE_UNQUALIFIED/);
});
test('real nontraining missions still require source scope, signed independent reviewer and readback acceptance',()=>{
 const s=example();s.mission.id='PRODUCTION-MISSION-01';s.handoffs[0].mission_id=s.mission.id;
 const x=summarizeG4HandoffTrail(s);
 assert.equal(x.classification,'UNVERIFIED_NON_TRAINING_MISSION');
 assert.equal(x.trainingOnly,false);
 assert.equal(x.recordedCompleteChains,1);
 assert.equal(x.commissioned,false);
 assert.ok(x.holds.includes('INDEPENDENT_SOURCE_VERSION_SCOPE_REQUIRED'));
});
test('Mission Status UI shows read-only G4 trail, preserved dissent and training banner using text-safe DOM',async()=>{
 const html=await readFile(new URL('../mission-status.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../mission-status.mjs',import.meta.url),'utf8');
 assert.match(html,/id="g4-handoff-audit"/);
 assert.match(html,/id="g4-handoff-list"/);
 assert.match(js,/summarizeG4HandoffTrail/);
 assert.match(js,/g4-handoff-list/);
 assert.match(js,/textContent/);
 assert.doesNotMatch(js,/innerHTML|eval\(/);
});

test('canonical verification rejection, resubmission and later independent VERIFY retain dissent without false chain failure',()=>{
 const s=example();
 s.handoffEvents=[
  ...s.handoffEvents.slice(0,3),
  {id:5,handoff_id:'handoff-1',outcome:'REJECT_VERIFICATION',from_status:'SUBMITTED',to_status:'RETURNED',by_agent_id:'project',created_at:'2026-10-13T10:00:03Z'},
  {id:6,handoff_id:'handoff-1',outcome:'RESUBMIT',from_status:'RETURNED',to_status:'PENDING',by_agent_id:'qa',created_at:'2026-10-13T10:00:04Z'},
  {id:7,handoff_id:'handoff-1',outcome:'ACCEPT',from_status:'PENDING',to_status:'ACCEPTED',by_agent_id:'qa',created_at:'2026-10-13T10:00:05Z'},
  {id:8,handoff_id:'handoff-1',outcome:'SUBMIT',from_status:'ACCEPTED',to_status:'SUBMITTED',by_agent_id:'qa',created_at:'2026-10-13T10:00:06Z'},
  {id:9,handoff_id:'handoff-1',outcome:'VERIFY',from_status:'SUBMITTED',to_status:'COMPLETED',by_agent_id:'project',created_at:'2026-10-13T10:00:07Z'},
 ];
 s.handoffs[0].verified_at='2026-10-13T10:00:08Z';
 const x=summarizeG4HandoffTrail(s);
 assert.equal(x.recordedCompleteChains,1);
 assert.equal(x.recordedDissentCount,1);
 assert.equal(x.handoffs[0].trailStatus,'RECORDED_CHAIN_COMPLETE_ONLY');
 assert.equal(x.commissioned,false);
});
test('canonical information request, owner resubmission and return to normal acceptance are preserved',()=>{
 const s=example();
 s.handoffEvents=[
  s.handoffEvents[0],
  {id:5,handoff_id:'handoff-1',outcome:'REQUEST_INFORMATION',from_status:'PENDING',to_status:'INFORMATION_REQUIRED',by_agent_id:'qa',created_at:'2026-10-13T10:00:00.250Z'},
  {id:6,handoff_id:'handoff-1',outcome:'RESUBMIT',from_status:'INFORMATION_REQUIRED',to_status:'PENDING',by_agent_id:'orchestrator',created_at:'2026-10-13T10:00:00.500Z'},
  ...s.handoffEvents.slice(1),
 ];
 const x=summarizeG4HandoffTrail(s);
 assert.equal(x.recordedCompleteChains,1);
 assert.equal(x.recordedDissentCount,1);
 assert.equal(x.commissioned,false);
});
test('a chronological but impossible canonical state transition cannot be labelled a complete recorded chain',()=>{
 const s=example();
 s.handoffEvents[1].to_status='SUBMITTED';
 s.handoffEvents[2].from_status='SUBMITTED';
 s.handoffEvents[2].to_status='SUBMITTED';
 const x=summarizeG4HandoffTrail(s);
 assert.equal(x.recordedCompleteChains,0);
 assert.equal(x.handoffs[0].trailStatus,'RECORDED_CHAIN_INCOMPLETE');
 assert.equal(x.commissioned,false);
});
test('requester cannot impersonate recipient in canonical ACCEPT receipt',()=>{
 const s=example();s.handoffEvents[1].by_agent_id='orchestrator';
 assert.equal(summarizeG4HandoffTrail(s).recordedCompleteChains,0);
});
