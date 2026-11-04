import test from 'node:test';
import assert from 'node:assert/strict';
import {createMissionConsumer} from './mission-consumer.mjs';
import {runReadOnlyMissionStep} from './mission-step.mjs';

function fixture(count=8){
 let calls=0,events=0,missionStatus='ACTIVE';const reports=new Map();
 const handoffs=Array.from({length:count},(_,i)=>({id:'h-'+i,mission_id:'qual-mission',work_package_id:'wp-'+i,to_agent_id:'project',from_agent_id:'orchestrator',requested_job:'PROJECT.TRACK_DEPENDENCY',status:'PENDING',version:1,evidence_refs:[]}));
 const packages=handoffs.map(h=>({id:h.work_package_id,status:'READY',action_type:h.requested_job,owner_agent_id:h.to_agent_id,depends_on:[],human_approval_required:false,authority:1,execution_mode:'ANALYSE'}));
 const history=[];
 const request=()=>{if(++calls>50)throw Error('Too many subrequests');};
 const service={
  async snapshot(){request();return structuredClone({mission:{id:'qual-mission',status:missionStatus},workPackages:packages,handoffs,handoffEvents:history});},
  async transitionHandoff(x){request();const h=handoffs.find(h=>h.id===x.handoffId);assert.equal(h.version,x.expectedVersion);
   const old=h.status;const states={ACCEPT:'ACCEPTED',SUBMIT:'SUBMITTED',VERIFY:'COMPLETED',REJECT_VERIFICATION:'RETURNED',RETURN_FOR_CORRECTION:'RETURNED',RESUBMIT:'PENDING'};
   assert.ok(states[x.outcome]);if(x.outcome==='VERIFY')assert.equal(x.byAgentId,'orchestrator');
   if(x.outcome==='RESUBMIT')assert.equal(x.byAgentId,history.filter(e=>e.handoff_id===h.id).at(-1).outcome==='REJECT_VERIFICATION'?'project':'orchestrator');
   h.status=states[x.outcome];h.version++;h.evidence_refs=[...new Set([...h.evidence_refs,...x.evidenceRefs])];
   packages.find(w=>w.id===h.work_package_id).status=h.status==='COMPLETED'?'COMPLETED':h.status==='RETURNED'?'BLOCKED':h.status==='PENDING'?'READY':'IN_PROGRESS';
   missionStatus=h.status==='RETURNED'?'HOLD':missionStatus==='HOLD'?'ACTIVE':missionStatus;
   history.push({id:++events,handoff_id:h.id,outcome:x.outcome,to_status:h.status,from_status:old,evidence_refs:[...x.evidenceRefs]});return {handoff:structuredClone(h)};},
  async recordWorkEvidence(x){request();const id='ev:'+x.handoffId+':'+x.expectedVersion;reports.set(id,{id,handoff_id:x.handoffId,author_agent_id:x.byAgentId,handoff_version:x.expectedVersion,report:structuredClone(x.report)});return {evidenceId:id};},
  async getWorkEvidence(id){request();return structuredClone(id.startsWith('handoff-version:')?[...reports.values()].find(r=>id===`handoff-version:${r.handoff_id}:${r.handoff_version}`):reports.get(id));},
 };
 return {service,handoffs,packages,history,reports,reset:()=>{calls=0;},hold:()=>{missionStatus='HOLD';},calls:()=>calls};
}
test('old eight-handoff invocation reproduces the free-tier subrequest failure',async()=>{
 const f=fixture(),consumer=createMissionConsumer({service:f.service});
 await assert.rejects(async()=>{await consumer.consume('qual-mission',{maxHandoffs:8});await consumer.review('qual-mission',{maxHandoffs:8});},/Too many subrequests/);
 assert.ok(f.calls()>50);assert.ok(f.handoffs.some(h=>h.status==='SUBMITTED'));
});
test('separate single-unit requests complete fifteen handoffs under the same free-tier budget',async()=>{
 const f=fixture(15),consumer=createMissionConsumer({service:f.service});
 for(let i=0;i<15;i++){
  f.reset();const r=await runReadOnlyMissionStep({service:f.service,consumer,missionId:'qual-mission'});
  assert.equal(r.consumed.submitted,1);assert.equal(r.reviewed.verified,1);assert.equal(r.remaining,14-i);assert.ok(f.calls()<20);
 }
 assert.ok(f.handoffs.every(h=>h.status==='COMPLETED'));assert.equal(f.reports.size,15);
});
test('submitted backlog is reviewed before creating new work; rejected evidence gets a new governed version',async()=>{
 const f=fixture(1),consumer=createMissionConsumer({service:f.service});
 await consumer.consume('qual-mission',{maxHandoffs:1});f.reports.values().next().value.report.dependencyCount=99;f.reset();
 let r=await runReadOnlyMissionStep({service:f.service,consumer,missionId:'qual-mission'});
 assert.equal(r.reviewed.returned,1);assert.equal(r.consumed.submitted,0);f.reset();
 r=await runReadOnlyMissionStep({service:f.service,consumer,missionId:'qual-mission'});assert.equal(r.resubmitted,1);f.reset();
 r=await runReadOnlyMissionStep({service:f.service,consumer,missionId:'qual-mission'});assert.equal(r.reviewed.verified,1);assert.equal(r.remaining,0);
 assert.equal(f.reports.size,2,'original rejected evidence retained');
});
test('unsupported or approval-required returns cannot be automatically resubmitted',async()=>{
 const f=fixture(1);f.handoffs[0].status='RETURNED';f.packages[0].human_approval_required=true;
 const r=await runReadOnlyMissionStep({service:f.service,consumer:createMissionConsumer({service:f.service}),missionId:'qual-mission'});
 assert.equal(r.resubmitted,0);assert.equal(f.history.length,0);
});

test('unattributed mission HOLD and approval-required blocker stay held',async()=>{
 const f=fixture(1);f.hold();
 await assert.rejects(runReadOnlyMissionStep({service:f.service,consumer:createMissionConsumer({service:f.service}),missionId:'qual-mission'}),/MISSION_HOLD_REQUIRES_REVIEW/);
 assert.equal(f.history.length,0);
});

test('source-change return completes its checkpoint without invoking ACTIVE-only review',async()=>{
 const f=fixture(1);let reviewed=false;
 const consumer={consume:async()=>{await f.service.transitionHandoff({handoffId:'h-0',expectedVersion:1,byAgentId:'project',outcome:'RETURN_FOR_CORRECTION',evidenceRefs:[]});return {submitted:0,returned:1};},review:async()=>{reviewed=true;throw Error('MISSION_NOT_ACTIVE');}};
 const r=await runReadOnlyMissionStep({service:f.service,consumer,missionId:'qual-mission'});
 assert.equal(r.consumed.returned,1);assert.equal(reviewed,false);assert.equal(r.remaining,1);
 const recovery=await runReadOnlyMissionStep({service:f.service,consumer,missionId:'qual-mission'});
 assert.equal(recovery.resubmitted,1);
});
