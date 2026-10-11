import test from 'node:test';
import assert from 'node:assert/strict';
import {runFounderAiDraft,FOUNDER_AI_MODEL} from './founder-ai-draft.mjs';
const report={status:'READ_ONLY_PREVIEW_NOT_AGENT_REPLY',agentId:'project',
 missionId:'MISSION-0001',missionStatus:'READY_FOR_CLOSURE',
 verifiedWorkPackages:1,totalWorkPackages:1,blockedWorkPackageIds:[],
 evidenceRefs:['ev-1'],readyForHumanClosure:true,sourceUpdatedAt:'2026-10-11T00:00:00Z',
 modelInvoked:false,actionAuthorized:false};
const facts={missionId:'MISSION-0001',missionStatus:'READY_FOR_CLOSURE',
 verifiedWorkPackages:1,totalWorkPackages:1,blockedWorkPackageIds:[],evidenceRefs:['ev-1']};
const respond=val=>({response:JSON.stringify(val)});
const input={agentId:'project',instruction:'Prepare factual mission evidence report',report};
test('independent facts round-trip through a real-schema model output, no tools',async()=>{
 const calls=[];
 const ai={async run(model,opts){calls.push({model,opts});return respond(facts);}};
 const result=await runFounderAiDraft({...input,ai});
 assert.equal(FOUNDER_AI_MODEL,'@cf/meta/llama-3.1-8b-instruct-fp8');
 assert.equal(result.status,'AI_DRAFT_UNVERIFIED');
 assert.equal(result.actionAuthorized,false);
 assert.match(result.content,/No blocked work packages/);
 assert.match(result.content,/1 of 1/);
 assert.match(result.content,/ev-1/);
 assert.equal(calls[0].model,FOUNDER_AI_MODEL);
 assert.equal(calls[0].opts.max_tokens,256);
 assert.equal(calls[0].opts.temperature,0);
 assert.ok(!Object.hasOwn(calls[0].opts,'tools'));
});
test('unsupported claims about extra blockers, status or work count FAIL CLOSED',async()=>{
 for(const wrong of [{...facts,blockedWorkPackageIds:['invented-blocker']},
  {...facts,missionStatus:'CLOSED'},{...facts,totalWorkPackages:2},
  {...facts,evidenceRefs:['invented-evidence']}]) {
  const ai={async run(){return respond(wrong);}};
  await assert.rejects(()=>runFounderAiDraft({...input,ai}),/FOUNDER_AI_FACT_MISMATCH/);
 }
});
test('untrusted model prose and malformed JSON FAIL CLOSED',async()=>{
 const outputs=[{response:'One blocker exists.'},{response:'no json'},
   {choices:[{message:{content:'Project complete'}}]},
   {choices:[{message:{tool_calls:[{id:'x'}]}}]}];
 for(const out of outputs){
  const ai={async run(){return out;}};
  await assert.rejects(()=>runFounderAiDraft({...input,ai}));
 }
});
test('model must not invent extra JSON keys, freeform summary or irrelevant output',async()=>{
 for(const val of [{...facts,summary:'One blocker exists.'},[facts],{...facts,verifiedWorkPackages:'1'}]){
  const ai={async run(){return respond(val);}};
  await assert.rejects(()=>runFounderAiDraft({...input,ai}),/FOUNDER_AI_FACT_MISMATCH/);
 }
});
test('wrong actor, missing AI binding and invalid source cannot produce a draft',async()=>{
 const ai={async run(){return respond(facts);}};
 for(const change of [{ai:null},{agentId:'finance'},{report:{...report,modelInvoked:true}},
  {report:{...report,actionAuthorized:true}},{report:{...report,agentId:'qa'}}]){
  await assert.rejects(()=>runFounderAiDraft({...input,ai,...change}));
 }
});
