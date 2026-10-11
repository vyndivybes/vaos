import test from 'node:test';
import assert from 'node:assert/strict';
import {runFounderAiDraft,FOUNDER_AI_MODEL} from './founder-ai-draft.mjs';
const report={status:'READ_ONLY_PREVIEW_NOT_AGENT_REPLY',agentId:'project',
 missionId:'MISSION-0001',missionStatus:'READY_FOR_CLOSURE',
 verifiedWorkPackages:1,totalWorkPackages:1,blockedWorkPackageIds:[],
 evidenceRefs:['ev-1'],readyForHumanClosure:true,sourceUpdatedAt:'2026-10-11T00:00:00Z',
 modelInvoked:false,actionAuthorized:false};
const respond=content=>({choices:[{message:{role:'assistant',content},finish_reason:'stop'}]});
test('Cloudflare GLM model schema is parsed correctly, with all tools disabled',async()=>{
 const calls=[];const ai={async run(model,opts){calls.push({model,opts});return respond('Draft status summary cites ev-1; no release authorized.');}};
 const result=await runFounderAiDraft({ai,agentId:'project',instruction:'Summarize mission evidence',report});
 assert.equal(result.status,'AI_DRAFT_UNVERIFIED');assert.equal(result.actionAuthorized,false);
 assert.equal(result.model,'@cf/zai-org/glm-4.7-flash');
 assert.equal(calls.length,1);assert.equal(calls[0].model,FOUNDER_AI_MODEL);
 assert.equal(calls[0].opts.max_completion_tokens,256);
 assert.equal(calls[0].opts.tool_choice,'none');
 assert.equal(calls[0].opts.parallel_tool_calls,false);
 assert.equal(calls[0].opts.store,false);
 assert.ok(calls[0].opts.prompt.includes('ev-1'));
 assert.ok(!Object.hasOwn(calls[0].opts,'tools'));
});
test('legacy model response fields, missing facts, tool calls, wrong agents fail closed',async()=>{
 const ai={async run(){return {response:'Legacy response must be rejected'};}};
 await assert.rejects(()=>runFounderAiDraft({ai,agentId:'project',instruction:'Summarize mission evidence',report}),/FOUNDER_AI_OUTPUT_INVALID/);
 for(const change of [{ai:null},{agentId:'finance'},{report:{...report,actionAuthorized:true}},
   {report:{...report,modelInvoked:true}},{report:{...report,agentId:'qa'}}])
 await assert.rejects(()=>runFounderAiDraft({ai,agentId:'project',instruction:'Summarize mission evidence',report,...change}));
 const calls={async run(){return {choices:[{message:{content:'Generated text with forbidden tool call',tool_calls:[{id:'x'}]}}]};}};
 await assert.rejects(()=>runFounderAiDraft({ai:calls,agentId:'project',instruction:'Summarize mission evidence',report}),/FOUNDER_AI_TOOLS_FORBIDDEN/);
});
test('generated text is normalized and bounded before immutable audit',async()=>{
 const ai={async run(){return respond('Mission report draft:\n1 of 1 independently verified. Evidence ev-1.');}};
 const d=await runFounderAiDraft({ai,agentId:'project',instruction:'Summarize mission evidence',report});
 assert.ok(!d.content.includes('\n'));assert.ok(d.content.length<=1200);
});
