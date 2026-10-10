import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareFounderMissionReport} from './founder-report-preview.mjs';
const record={messageId:'1234',recipientAgentId:'project',kind:'REPORT_REQUEST',status:'RECORDED_NOT_ROUTED'};
const snapshot={mission:{id:'mission-a',status:'ACTIVE'},workPackages:[
{id:'wp-1',owner_agent_id:'project',action_type:'PROJECT.GENERATE_STATUS',status:'COMPLETED'},
{id:'wp-2',owner_agent_id:'qa',action_type:'QA.CHECK',status:'BLOCKED'}],
handoffs:[{work_package_id:'wp-1',to_agent_id:'project',status:'COMPLETED',
verified_by_agent_id:'knowledge',evidence_refs:['evidence-a','REVIEWED:evidence-a']}]};
const args={record,agentId:'project',messageId:'1234',missionId:'mission-a',snapshot};
test('only independently verified evidence appears in the read-only report',()=>{
const r=prepareFounderMissionReport(args);
assert.equal(r.status,'READ_ONLY_PREVIEW_NOT_AGENT_REPLY');
assert.equal(r.verifiedWorkPackages,1);assert.equal(r.totalWorkPackages,2);
assert.deepEqual(r.blockedWorkPackageIds,['wp-2']);assert.deepEqual(r.evidenceRefs,['evidence-a']);
assert.equal(r.modelInvoked,false);assert.equal(r.actionAuthorized,false);
});
test('forged requests, cross-agent access, and wrong missions fail closed',()=>{
for(const change of [{agentId:'finance'},{record:{...record,kind:'INSTRUCTION'}},
{record:{...record,recipientAgentId:'qa'}},{missionId:'mission-b'},
{snapshot:{...snapshot,mission:{id:'mission-b',status:'ACTIVE'}}}])
assert.throws(()=>prepareFounderMissionReport({...args,...change}));
});
test('maker-only verification does not count as independent success',()=>{
const changed={...snapshot,handoffs:[{...snapshot.handoffs[0],verified_by_agent_id:'project'}]};
assert.equal(prepareFounderMissionReport({...args,snapshot:changed}).verifiedWorkPackages,0);
});
