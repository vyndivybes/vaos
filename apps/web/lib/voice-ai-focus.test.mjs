import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyVoiceQuestion,claimVoiceAiDailyBudget} from './voice-ai-focus.mjs';

const mkBucket=()=>{
  const data=new Map();let writes=0;
  return {data,get writes(){return writes;},
    async get(k){const v=data.get(k);return v?{etag:v.etag,async json(){return v.data;}}:null;},
    async put(k,raw,opts){
      const prev=data.get(k),cond=opts?.onlyIf||{};
      if(cond.etagDoesNotMatch==='*'&&prev)return null;
      if(cond.etagMatches&&prev?.etag!==cond.etagMatches)return null;
      const rec={etag:'etag-'+(++writes),data:JSON.parse(raw)};data.set(k,rec);return rec;
    }
  };
};
test('strict daily global budget permits only three model invocations and stores no transcripts',async()=>{
 const bucket=mkBucket();
 for(let n=0;n<3;n++){
  const claim=await claimVoiceAiDailyBudget(bucket,()=>Date.parse('2026-10-11T12:00:00Z'));
  assert.equal(claim.allowed,true);
 }
 assert.equal((await claimVoiceAiDailyBudget(bucket,()=>Date.parse('2026-10-11T13:00:00Z'))).allowed,false);
 assert.equal(bucket.writes,3);
 assert.equal(bucket.data.size,1);
 assert.doesNotMatch(JSON.stringify([...bucket.data]),/mission|question|email|transcript/i);
 assert.equal((await claimVoiceAiDailyBudget(bucket,()=>Date.parse('2026-10-12T00:00:00Z'))).allowed,true);
});
test('missing or conflicting durable budget fails closed',async()=>{
 await assert.rejects(()=>claimVoiceAiDailyBudget(undefined),/QUOTA/);
 const conflict={get:async()=>null,put:async()=>null};
 await assert.rejects(()=>claimVoiceAiDailyBudget(conflict),/QUOTA/);
});
test('model classifies only a bounded topic set, does not author facts, and cannot use tools',async()=>{
 const calls=[];const ai={run:async(name,opts)=>{calls.push({name,opts});return {response:JSON.stringify({topics:['blockers']})};}};
 const result=await classifyVoiceQuestion({ai,question:'What is the current status and blockers?',priorTopics:['status']});
 assert.deepEqual(result.topics,['status','blockers']);
 assert.equal(result.modelInvoked,true);
 assert.equal(result.actionAuthorized,false);
 assert.equal(calls.length,1);
 assert.ok(calls[0].opts.max_tokens<=100);
 assert.equal(calls[0].opts.temperature,0);
 assert.doesNotMatch(JSON.stringify(calls[0].opts),/VAOS-CARBON-FRAME|workPackages/);
});
test('unsafe, malformed or unrestricted question never reaches AI',async()=>{
 let runs=0;const ai={run:async()=>{runs++;return {response:'{"topics":["status"]}'}}};
 for(const question of ['approve purchases and report status','delete mission now','hello','',"a".repeat(901)]){
  await assert.rejects(()=>classifyVoiceQuestion({ai,question,priorTopics:[]}),/INVALID|DENIED/);
 }
 assert.equal(runs,0);
});
test('hallucinated topics, tool calls or model prose are rejected',async()=>{
 for(const reply of [{response:'I suggest closing it now.'},{response:'{"topics":["approve"]}'},{response:'{"topics":["status"],"action":"purchase"}'},{choices:[{message:{tool_calls:[{name:'execute'}]}}]}]){
  const ai={run:async()=>reply};
  await assert.rejects(()=>classifyVoiceQuestion({ai,question:'What is status?',priorTopics:[]}),/INVALID|REJECTED|FORBIDDEN/);
 }
});
