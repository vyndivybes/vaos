import test from 'node:test';
import assert from 'node:assert/strict';
import {createFounderMission,formatFounderMissionResults} from './founder-mission-flow.mjs';

const messageId='52a8a9bd-3706-4d05-8941-045bfb64c661';
const missionId='founder-52a8a9bd37064d058941045bfb64c661';
const command={
 kind:'INSTRUCTION',recipientAgentId:'orchestrator',
 instruction:'Audit VYNDI operating readiness across permitted departments.',
 executionAuthorized:false,
};
const response=(data,ok=true)=>({ok,async json(){return {data};}});
function transport(){
 const calls=[];
 return {calls,request:async(url,opts)=>{
  calls.push({url,method:opts.method,credentials:opts.credentials,body:JSON.parse(opts.body)});
  if(url==='/api/founder-inbox')return response({message:{status:'RECORDED_NOT_ROUTED'}});
  if(url==='/api/missions')return response({sourceMessageId:messageId,missionId,
   assignedWorkPackages:7,totalWorkPackages:15,businessEffectsExecuted:false,status:'PARTIALLY_ASSIGNED'});
  throw Error('UNEXPECTED_URL');
 }};
}

test('one explicit founder instruction persists then automatically routes through existing governed mission contracts',async()=>{
 const f=transport();
 const result=await createFounderMission({command,messageId,request:f.request});
 assert.equal(result.missionId,missionId);
 assert.equal(result.assignedWorkPackages,7);
 assert.equal(result.totalWorkPackages,15);
 assert.deepEqual(f.calls.map(x=>x.url),['/api/founder-inbox','/api/missions']);
 assert.deepEqual(f.calls[0].body,{messageId,agentId:'orchestrator',kind:'INSTRUCTION',instruction:command.instruction});
 assert.deepEqual(f.calls[1].body,{operation:'ROUTE_FOUNDER_INSTRUCTION',messageId});
 assert.ok(f.calls.every(x=>x.method==='POST'&&x.credentials==='same-origin'));
});

test('failed route can retry same recorded command ID without authorizing extra work',async()=>{
 let attempts=0;const bodies=[];
 const request=async (url,opts)=>{
  bodies.push([url,JSON.parse(opts.body)]);
  if(url==='/api/founder-inbox')return response({message:{status:'RECORDED_NOT_ROUTED'}});
  attempts+=1;
  if(attempts===1)return response({code:'UNAVAILABLE'},false);
  return response({missionId,sourceMessageId:messageId,assignedWorkPackages:1,totalWorkPackages:1,
   status:'ASSIGNED',businessEffectsExecuted:false});
 };
 await assert.rejects(createFounderMission({command,messageId,request}),/FOUNDER_MISSION_ROUTING_UNCONFIRMED/);
 const recovered=await createFounderMission({command,messageId,request});
 assert.equal(recovered.missionId,missionId);
 assert.deepEqual(bodies[1][1],bodies[3][1]);
 assert.equal(attempts,2);
});

test('one-click transport never accepts impersonation, effectful jobs or forged source assignment response',async()=>{
 const f=transport();
 for(const wrong of [
  {...command,kind:'OVERRIDE_PROPOSAL'},
  {...command,recipientAgentId:'finance'},
  {...command,executionAuthorized:true},
  {...command,instruction:'x'},
 ])await assert.rejects(createFounderMission({command:wrong,messageId,request:f.request}),/FOUNDER_MISSION_COMMAND_INVALID/);
 assert.equal(f.calls.length,0);
 for(const invalid of [
  {missionId:'other-mission',sourceMessageId:messageId,assignedWorkPackages:15,totalWorkPackages:15,businessEffectsExecuted:false},
  {missionId,sourceMessageId:messageId,assignedWorkPackages:16,totalWorkPackages:15,businessEffectsExecuted:false},
  {missionId,sourceMessageId:messageId,assignedWorkPackages:1,totalWorkPackages:15,businessEffectsExecuted:true},
 ]) {
  const request=async url=>url==='/api/founder-inbox'
   ?response({message:{status:'RECORDED_NOT_ROUTED'}})
   :response(invalid);
  await assert.rejects(createFounderMission({command,messageId,request}),/FOUNDER_MISSION_ROUTING_UNCONFIRMED/);
 }
});

test('founder results formatter distinguishes assignment from saved and independently reviewed execution',()=>{
 const record={schemaVersion:'VAOS_FOUNDER_MISSION_RESULTS_V1',missionId,readOnly:true,actionAuthorized:false,
  missionStatus:'ACTIVE',
  summary:{total:2,verified:1,awaitingReview:1,recoverable:0,acceptedRetry:0,assignedNotStarted:0,unsupportedOrBlocked:0},
  jobs:[
   {ownerAgentId:'inventory',actionType:'INVENTORY.OBSERVE_STOCK',resultStatus:'VERIFIED_RESULT',
    result:{sourceSystem:'VYNDI_OS',observedRecords:2,sourceAuthority:'getAuthoritativeInventory',
     evidenceId:'vaos-evidence:one',findings:['BOUNDED_SELECTED_RECORDS:2']}},
   {ownerAgentId:'project',actionType:'PROJECT.TRACK_DEPENDENCY',resultStatus:'SUBMITTED_AWAITING_REVIEW',result:null},
  ],
  snapshot:{mission:{id:missionId,status:'ACTIVE'},workPackages:[],handoffs:[]}};
 const output=formatFounderMissionResults(record,missionId);
 assert.match(output,/Verified: 1\/2/);
 assert.match(output,/SUBMITTED_AWAITING_REVIEW/);
 assert.match(output,/getAuthoritativeInventory/);
 assert.match(output,/Receipts are bounded observations/);
 assert.doesNotMatch(output,/all 16 employees completed/);
});

test('invalid mission report and excessive job list fail closed without displaying unsupported claims',()=>{
 const record={schemaVersion:'VAOS_FOUNDER_MISSION_RESULTS_V1',missionId,readOnly:true,actionAuthorized:false,
  summary:{total:1},jobs:[],snapshot:{mission:{id:missionId}}};
 assert.throws(()=>formatFounderMissionResults(record,missionId),/FOUNDER_MISSION_RESULTS_INVALID/);
 const tooMany={...record,summary:{total:40},jobs:Array.from({length:40},()=>({}))};
 assert.throws(()=>formatFounderMissionResults(tooMany,missionId),/FOUNDER_MISSION_RESULTS_INVALID/);
});
