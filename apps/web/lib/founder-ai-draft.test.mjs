import test from 'node:test';
import assert from 'node:assert/strict';
import {runFounderAiDraft,FOUNDER_AI_MODEL} from './founder-ai-draft.mjs';
const report={status:'READ_ONLY_PREVIEW_NOT_AGENT_REPLY',agentId:'project',
 missionId:'MISSION-0001',missionStatus:'READY_FOR_CLOSURE',
 verifiedWorkPackages:1,totalWorkPackages:1,blockedWorkPackageIds:[],
 evidenceRefs:['ev-1'],readyForHumanClosure:true,sourceUpdatedAt:'2026-10-11T00:00:00Z',
 modelInvoked:false,actionAuthorized:false};
test('Workers AI is only used in read-only prompt mode, no tools or execution',async()=>{
 const calls=[];
 const ai={async run(model,opts){calls.push({model,opts});return {response:'Draft status summary with verified reference ev-1. No release authorized.'};}};
 const result=await runFounderAiDraft({ai,agentId:'project',instruction:'Summarize mission evidence',report});
 assert.equal(result.status,'AI_DRAFT_UNVERIFIED');
 assert.equal(result.actionAuthorized,false);
 assert.equal(result.model,FOUNDER_AI_MODEL);
 assert.equal(calls.length,1);
 assert.ok(calls[0].opts.max_tokens<=256);
 assert.ok(calls[0].opts.prompt.includes('ev-1'));
 assert.equal(Object.keys(calls[0].opts).includes('tools'),false);
});
test('rejects unverified or missing source, wrong agent, invalid response, no binding',async()=>{
 const ai={async run(){return {response:'too short'};}};
 for(const change of [{ai:null},{agentId:'finance'},{report:{...report,actionAuthorized:true}},
 {report:{...report,modelInvoked:true}},{report:{...report,agentId:'qa'}}])
 await assert.rejects(()=>runFounderAiDraft({ai,agentId:'project',instruction:'Summarize mission evidence',report,...change}));
 await assert.rejects(()=>runFounderAiDraft({ai,agentId:'project',instruction:'Summarize mission evidence',report}),/FOUNDER_AI_OUTPUT_INVALID/);
});
test('generated text is whitespace-normalized and bounded before immutable audit',async()=>{
 const ai={async run(){return {response:'Mission report draft:\n 1 of 1 verified.  Evidence is ev-1.'};}};
 const d=await runFounderAiDraft({ai,agentId:'project',instruction:'Summarize evidence for this mission',report});
 assert.ok(!d.content.includes('\n'));
 assert.ok(d.content.length<=1200);
});
