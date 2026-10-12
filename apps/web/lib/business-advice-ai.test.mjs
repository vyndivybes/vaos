import test from 'node:test';import assert from 'node:assert/strict';
import {rankAdvisoryOptions,validateAdvisoryRanking} from './business-advice-ai.mjs';
test('AI may ONLY rank two predefined policy-safe options from bounded signed evidence',async()=>{
 const calls=[];
 const ai={run:async(model,args)=>{calls.push({model,args});return {response:JSON.stringify({choice:2,reason:'Material shortages require checking supplier alternatives after stock reconciliation.'})};}};
 const out=await rankAdvisoryOptions({ai,domain:'procurement',observations:[{domain:'procurement',status:'OBSERVED',observation:{recordsObserved:2,summary:'2 shortage rows'}}]});
 assert.equal(out.choice,2);
 assert.equal(out.authority,'ADVISORY_ONLY');
 assert.ok(!JSON.stringify(calls).includes('customer_name'));
 assert.ok(calls[0].args.prompt.includes('No tools'));
});
test('model-generated currency, invented numerals, release approval and extra fields fail closed',()=>{
 for(const response of [
 {choice:1,reason:'You should pay ₹25000 to suppliers immediately.'},
 {choice:1,reason:'The plan is approved and guaranteed to succeed.'},
 {choice:3,reason:'Choose plan 3 because it is optimal.'},
 {choice:2,reason:'Good'},
 {choice:1,reason:'A valid reason that is safe.',other:'send money'},
 ]){
  assert.throws(()=>validateAdvisoryRanking(response),/ADVISORY_AI_/);
 }
});
test('malformed model result, tool call, or absence of signer is not accepted as qualified recommendation',async()=>{
 await assert.rejects(()=>rankAdvisoryOptions({ai:{run:async()=>({choices:[{message:{tool_calls:[{id:'do'}]}}]})},domain:'finance',observations:[]}),/ADVISORY_AI_/);
 await assert.rejects(()=>rankAdvisoryOptions({ai:null,domain:'procurement',observations:[]}),/ADVISORY_AI_/);
});
