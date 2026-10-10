import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFounderAgentBrief} from './founder-agent-brief.mjs';

const control={agents:[{id:'vibpe'}],workforce:{digitalEmployees:[
 {id:'vibpe',status:'ACTIVE',qualificationLevel:3}
]}};
const mission={mission:{id:'mission-1234',status:'ACTIVE'},workPackages:[
 {id:'wp1',owner_agent_id:'vibpe',status:'COMPLETED',verifier_agent_ids:['qa']},
 {id:'wp2',owner_agent_id:'vibpe',status:'BLOCKED',verifier_agent_ids:['qa']},
 {id:'wp3',owner_agent_id:'finance',status:'COMPLETED',verifier_agent_ids:['qa']},
],handoffs:[
 {work_package_id:'wp1',to_agent_id:'vibpe',verified_by_agent_id:'qa',status:'COMPLETED',
  evidence_refs:['evidence-1','REVIEWED:evidence-1']},
 {work_package_id:'wp3',to_agent_id:'finance',verified_by_agent_id:'qa',status:'COMPLETED',
  evidence_refs:['evidence-2','REVIEWED:evidence-2']},
]};
test('reports only selected agent own work packages and documented reviewer references',()=>{
 const result=buildFounderAgentBrief({agentId:'vibpe',control,mission,observedAt:'2026-10-11T00:00:00Z'});
 assert.equal(result.status,'ROLE_QUALIFIED_FOR_REPORTING');
 assert.deepEqual(result.workPackages,{assigned:2,completed:1,withIndependentReviewReference:1,blockedOrFailed:1});
 assert.equal(result.source,'VAOS_PERSISTED_CONTROL_AND_MISSION_SNAPSHOT');
 assert.equal(result.generation,'DETERMINISTIC_NO_MODEL');
 assert.equal(result.agentReply,false);
 assert.equal(result.executionAuthorized,false);
});
test('missing independent verifier/reference never earns reviewed label',()=>{
 const result=buildFounderAgentBrief({agentId:'vibpe',control,
  mission:{...mission,handoffs:[{...mission.handoffs[0],verified_by_agent_id:'vibpe'}]}});
 assert.equal(result.workPackages.withIndependentReviewReference,0);
});
test('unqualified agent is explicitly held; missing mission is not fabricated',()=>{
 const result=buildFounderAgentBrief({agentId:'vibpe',control:{
  ...control,workforce:{digitalEmployees:[{id:'vibpe',status:'PROPOSED',qualificationLevel:0}]}}});
 assert.equal(result.status,'ROLE_QUALIFICATION_HOLD');
 assert.equal(result.missionId,null);
 assert.equal(result.runtimeLiveness,'UNVERIFIED');
});
test('unknown agent and untrusted snapshots fail closed',()=>{
 assert.throws(()=>buildFounderAgentBrief({agentId:'nonexistent',control}));
 assert.throws(()=>buildFounderAgentBrief({agentId:'vibpe',control:{}}));
 assert.throws(()=>buildFounderAgentBrief({agentId:'vibpe',control,mission:{mission:{id:'bad'}}}));
});
