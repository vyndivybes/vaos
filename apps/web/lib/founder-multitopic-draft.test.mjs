import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareConversationContext} from './founder-context-draft.mjs';
import {getMandatoryTopics,runFounderMultiTopicDraft} from './founder-multitopic-draft.mjs';
import {FOUNDER_AI_MODEL} from './founder-ai-draft.mjs';

const priorId='00000000-0000-4000-8000-000000000111';
const id='00000000-0000-4000-8000-000000000112';
const missionId='MISSION-0001';
const question='Mission MISSION-0001. Considering earlier questions, is this formally closed or ready for closure? State verified evidence and outstanding blockers.';
const history={threadId:'00000000-0000-4000-8000-000000000113',missionId,agentId:'project',
 actionAuthorized:false,turns:[
  {sequence:1,messageId:priorId,requestStatus:'RECORDED_NOT_ROUTED',instruction:'Mission MISSION-0001. Is it ready for closure?',reply:{status:'AI_DRAFT_UNVERIFIED',sourceHash:'a'.repeat(64),evidenceRefs:['evidence-1']}},
  {sequence:2,messageId:id,requestStatus:'RECORDED_NOT_ROUTED',instruction:question,reply:null}
 ]};
const context=prepareConversationContext({history,agentId:'project',missionId,messageId:id,instruction:question});
const report={status:'READ_ONLY_PREVIEW_NOT_AGENT_REPLY',agentId:'project',messageId:id,missionId,
 missionStatus:'READY_FOR_CLOSURE',verifiedWorkPackages:1,totalWorkPackages:1,
 blockedWorkPackageIds:[],evidenceRefs:['evidence-1'],actionAuthorized:false,modelInvoked:false};
const params={agentId:'project',instruction:question,report,context};
test('Stage 7 detects EVERY expressly requested topic, with stable order',()=>{
 assert.deepEqual(getMandatoryTopics(question),['verification','blockers','evidence','closure']);
 assert.deepEqual(getMandatoryTopics('Please confirm the mission status and blockers'),['status','blockers']);
 assert.deepEqual(getMandatoryTopics('What next?'),[]);
});
test('Stage 7 answers all mandatory parts even if model picks only one topic',async()=>{
 let called=0;
 const ai={async run(model,opts){
  called++;assert.equal(model,FOUNDER_AI_MODEL);
  assert.ok(opts.max_tokens<=160);assert.equal(opts.temperature,0);
  assert.equal(Object.hasOwn(opts,'tools'),false);
  assert.match(opts.prompt,/outstanding blockers/);
  return {response:JSON.stringify({topics:['closure'],refersTo:priorId})};
 }};
 const draft=await runFounderMultiTopicDraft({...params,ai});
 assert.equal(called,1);
 assert.equal(draft.status,'AI_DRAFT_UNVERIFIED');
 assert.equal(draft.actionAuthorized,false);
 assert.match(draft.content,/READY_FOR_CLOSURE/);
 assert.match(draft.content,/NOT formally closed/);
 assert.match(draft.content,/1 of 1/);
 assert.match(draft.content,/No blocked work packages/);
 assert.match(draft.content,/evidence-1/);
 assert.match(draft.content,/No business action or approval/);
 assert.ok(draft.content.length<=1200);
});
test('model cannot inject facts, references, execution, unbounded topics or tools',async()=>{
 const responses=[
 {response:JSON.stringify({topics:['closure'],refersTo:id})},
 {response:JSON.stringify({topics:['execute'],refersTo:priorId})},
 {response:JSON.stringify({topics:['closure','closure'],refersTo:priorId})},
 {response:JSON.stringify({topics:['closure'],refersTo:priorId,status:'CLOSED'})},
 {response:JSON.stringify({topics:[],refersTo:priorId})},
 {response:'Mission is closed and approved.'},
 {choices:[{message:{tool_calls:[{id:'x'}]}}]}
 ];
 for(const response of responses)await assert.rejects(()=>runFounderMultiTopicDraft({...params,
  ai:{async run(){return response;}}}));
});
test('trust boundary rejects mismatched mission, agent, prior ID and unverified report',async()=>{
 const ai={async run(){return {response:JSON.stringify({topics:['status'],refersTo:priorId})}}};
 for(const change of [
  {agentId:'finance'}, {report:{...report,missionId:'OTHER'}},
  {report:{...report,actionAuthorized:true}},
  {context:{...context,previousMessageId:id}},
  {context:{...context,prior:[]}},
  {report:{...report,blockedWorkPackageIds:'forged'}}
 ])await assert.rejects(()=>runFounderMultiTopicDraft({...params,ai,...change}));
});
test('model topic selection may add one allowed implicit topic without overruling verified data',async()=>{
 const ai={async run(){return {response:JSON.stringify({topics:['status','closure'],refersTo:priorId})}}};
 const draft=await runFounderMultiTopicDraft({...params,ai});
 assert.match(draft.content,/Mission MISSION-0001/);
 assert.match(draft.content,/No blocked work packages/);
 assert.equal(draft.modelInvoked,true);
});
