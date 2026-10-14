import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFounderMissionAnswer} from './founder-mission-answers.mjs';

const source={
 schemaVersion:'VAOS_FOUNDER_MISSION_SUMMARY_V1',
 sourceAuthority:'vaos_founder_mission_answer_summary',
 totalMissions:3,sourceWindow:'LATEST_10_MISSIONS',
 missions:[
  {id:'mission-a',status:'ACTIVE',workPackages:5,completedWorkPackages:2,
   blockedWorkPackages:1,unfinishedHandoffs:2,awaitingReview:1,failedHandoffs:0,latestUpdate:'2026-10-15T08:00:00Z'},
  {id:'mission-b',status:'ACTIVE',workPackages:3,completedWorkPackages:3,
   blockedWorkPackages:0,unfinishedHandoffs:0,awaitingReview:0,failedHandoffs:0,latestUpdate:'2026-10-15T07:00:00Z'},
  {id:'mission-c',status:'CLOSED',workPackages:2,completedWorkPackages:2,
   blockedWorkPackages:0,unfinishedHandoffs:0,awaitingReview:0,failedHandoffs:0,latestUpdate:'2026-10-15T06:00:00Z'},
 ],
 latestVerifiedWork:{missionId:'mission-b',actionType:'PROJECT.TRACK_DEPENDENCY',
  ownerAgentId:'project',evidenceId:'vaos-evidence:abcdef1234',verifiedAt:'2026-10-15T07:30:00Z'},
};
test('unfinished missions are answered from persisted mission status, not an unrelated adaptive graph hold',()=>{
 const data=buildFounderMissionAnswer('Can you tell me which assigned missions remain unfinished and why?',source);
 assert.equal(data.status,'OBSERVED');
 assert.match(data.answer,/mission-a/);
 assert.match(data.answer,/2 of 5 completed/);
 assert.match(data.answer,/1 blocked/);
 assert.match(data.answer,/cause|reason.*not established/i);
 assert.doesNotMatch(data.answer,/mission-c.*unfinished/i);
 assert.equal(data.sourceSystem,'VAOS_MISSION_CONTROL');
 assert.equal(data.businessEffectsExecuted,false);
});
test('latest verified work includes its actual immutable evidence ID and never upgrades a handoff to a closed mission',()=>{
 const data=buildFounderMissionAnswer('What happened in the latest completed departmental mission? Identify the saved evidence.',source);
 assert.match(data.answer,/mission-b/);
 assert.match(data.answer,/vaos-evidence:abcdef1234/);
 assert.match(data.answer,/PROJECT.TRACK_DEPENDENCY/);
 assert.match(data.answer,/verified handoff/i);
 assert.match(data.answer,/not.*mission.*closed/i);
});
test('recovery explanation identifies the existing durable readback chain, not a fictitious incident',()=>{
 const data=buildFounderMissionAnswer('If a departmental task is interrupted after saving its report how is the result recovered?',source);
 assert.match(data.answer,/handoff.*version/i);
 assert.match(data.answer,/persisted evidence/i);
 assert.match(data.answer,/checker/i);
 assert.doesNotMatch(data.answer,/restarted.*successfully/i);
});
test('unavailable or invalid historical summary cannot become a completed-mission claim',()=>{
 assert.throws(()=>buildFounderMissionAnswer('latest completed mission',{}),/MISSION_SUMMARY_UNVERIFIED/);
 const empty={...source,missions:[],totalMissions:0,latestVerifiedWork:null};
 const data=buildFounderMissionAnswer('latest completed mission and evidence',empty);
 assert.equal(data.status,'HOLD');
 assert.match(data.answer,/no verified.*handoff/i);
});

test('G5 persisted HOLD missions are valid pending missions',()=>{
 const sample={...source,missions:source.missions.map((m,i)=>i===0?{...m,status:'HOLD'}:m)};
 const answer=buildFounderMissionAnswer('Which assigned missions are unfinished and why?',sample);
 assert.equal(answer.status,'OBSERVED');
 assert.match(answer.answer,/mission-a \(HOLD/);
 assert.match(answer.answer,/1 blocked/);
});


test('G5 distinguishes outstanding work from ready-for-closure and cancelled historical missions',()=>{
 const live={...source,missions:[
  {...source.missions[0],status:'HOLD',workPackages:9,completedWorkPackages:0,
   blockedWorkPackages:5,unfinishedHandoffs:0},
  {...source.missions[1],status:'READY_FOR_CLOSURE',workPackages:3,completedWorkPackages:3},
  {...source.missions[2],status:'CANCELLED',workPackages:2,completedWorkPackages:1},
 ]};
 const result=buildFounderMissionAnswer('Which assigned missions remain unfinished, and why?',live);
 assert.equal(result.status,'OBSERVED');
 const [outstanding,rest]=result.answer.split('Awaiting closure:');
 assert.match(outstanding,/mission-a \(HOLD: 0 of 9 completed; 5 blocked/);
 assert.doesNotMatch(outstanding,/mission-b|mission-c/);
 assert.match(rest,/mission-b/);
 assert.doesNotMatch(result.answer,/mission-c/);
 assert.match(result.answer,/cancelled missions? excluded/i);
});
test('G5 finished work awaiting closure is not mislabeled as unfinished departmental execution',()=>{
 const live={...source,totalMissions:1,missions:[
  {...source.missions[0],status:'READY_FOR_CLOSURE',workPackages:5,
   completedWorkPackages:5,blockedWorkPackages:0,unfinishedHandoffs:0,awaitingReview:0},
 ],latestVerifiedWork:null};
 const result=buildFounderMissionAnswer('Which assigned missions remain unfinished?',live);
 assert.match(result.answer,/No unfinished work/);
 assert.match(result.answer,/Awaiting closure: mission-a/);
});
