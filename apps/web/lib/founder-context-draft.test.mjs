import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareConversationContext,runFounderContextDraft} from './founder-context-draft.mjs';
import {FOUNDER_AI_MODEL} from './founder-ai-draft.mjs';

const priorId='00000000-0000-4000-8000-000000000111';
const currentId='00000000-0000-4000-8000-000000000112';
const threadId='00000000-0000-4000-8000-000000000113';
const missionId='MISSION-0001';
const history={threadId,agentId:'project',missionId,actionAuthorized:false,turns:[
 {sequence:1,messageId:priorId,requestStatus:'RECORDED_NOT_ROUTED',
  instruction:'Mission MISSION-0001. Are any blockers recorded?',
  reply:{status:'AI_DRAFT_UNVERIFIED',sourceHash:'a'.repeat(64),evidenceRefs:['ev-1']}},
 {sequence:2,messageId:currentId,requestStatus:'RECORDED_NOT_ROUTED',
  instruction:'Mission MISSION-0001. What about closure?',reply:null}
]};
const report={status:'READ_ONLY_PREVIEW_NOT_AGENT_REPLY',agentId:'project',missionId,messageId:currentId,
 missionStatus:'READY_FOR_CLOSURE',verifiedWorkPackages:1,totalWorkPackages:1,
 blockedWorkPackageIds:[],evidenceRefs:['ev-1'],modelInvoked:false,actionAuthorized:false};
const facts={missionId,missionStatus:'READY_FOR_CLOSURE',verifiedWorkPackages:1,
 totalWorkPackages:1,blockedWorkPackageIds:[],evidenceRefs:['ev-1']};
const input={history,agentId:'project',missionId,messageId:currentId,
 instruction:history.turns[1].instruction};
test('context scope mismatch is rejected before inference',async()=>{
 let calls=0;
 const base={ai:{run:async()=>{calls++;}},agentId:'project',instruction:input.instruction,
  report,context:prepareConversationContext(input)};
 for(const candidate of [
  {...base,report:{...report,agentId:'orchestrator'}},
  {...base,context:{...base.context,sequence:13}},
  {...base,context:{...base.context,previousMessageId:currentId}}
 ])await assert.rejects(runFounderContextDraft(candidate),/FOUNDER_CONTEXT_EVIDENCE_INVALID/);
 assert.equal(calls,0);
});

test('scoped, sequential and independently recorded history yields bounded context',()=>{
 const c=prepareConversationContext(input);
 assert.equal(c.previousMessageId,priorId);
 assert.equal(c.currentMessageId,currentId);
 assert.equal(c.sequence,2);
 assert.equal(c.prior.length,1);
 assert.equal(c.prior[0].instruction,history.turns[0].instruction);
});
test('cross-agent, forged turn and incomplete previous reply fail closed',()=>{
 for(const candidate of [
  {history:{...history,agentId:'finance'}},
  {history:{...history,missionId:'ANOTHER'}},
  {history:{...history,turns:[{...history.turns[0],reply:null},history.turns[1]]}},
  {history:{...history,turns:[{...history.turns[0],sequence:2},history.turns[1]]}},
  {history:{...history,turns:[{...history.turns[0],requestStatus:'EXECUTED'},history.turns[1]]}},
  {history:{...history,actionAuthorized:true}},
  {messageId:priorId},{instruction:'forged report instruction'}
 ])assert.throws(()=>prepareConversationContext({...input,...candidate}));
});
test('live schema echo can select a contextual focus but cannot invent facts',async()=>{
 let calls=0;
 const ai={async run(model,opts){
   calls++;assert.equal(model,FOUNDER_AI_MODEL);
   assert.equal(opts.max_tokens,96);assert.ok(!Object.hasOwn(opts,'tools'));
   assert.match(opts.prompt,/What about closure/);
   assert.match(opts.prompt,/Are any blockers recorded/);
   return {response:JSON.stringify({focus:'closure',refersTo:priorId})};
 }};
 const context=prepareConversationContext(input);
 const d=await runFounderContextDraft({ai,agentId:'project',
  instruction:input.instruction,report,context});
 assert.equal(calls,1);
 assert.equal(d.status,'AI_DRAFT_UNVERIFIED');
 assert.equal(d.actionAuthorized,false);
 assert.match(d.content,/previous request/);
 assert.match(d.content,/not formally closed/i);
 assert.match(d.content,/READY_FOR_CLOSURE/);
 assert.match(d.content,/ev-1/);
});
test('factual drift, invented prior ID, unbounded prose and tools all fail',async()=>{
 const context=prepareConversationContext(input);
 for(const response of [
  {response:JSON.stringify({focus:'closure',refersTo:currentId})},
  {response:JSON.stringify({focus:'execute',refersTo:priorId})},
  {response:JSON.stringify({focus:'closure',refersTo:priorId,missionStatus:'CLOSED'})},
  {response:JSON.stringify({focus:'blockers',refersTo:priorId,blockedWorkPackageIds:['made-up']})},
  {response:'All tasks completed and approved'},
  {choices:[{message:{tool_calls:[{id:'x'}]}}]}
 ]){
  await assert.rejects(()=>runFounderContextDraft({ai:{async run(){return response;}},
   agentId:'project',instruction:input.instruction,report,context}));
 }
});
