import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {runDevelopmentProbe} from './development-probe.mjs';
test('real local R2 binding atomically admits one request across concurrent probe instances',async()=>{
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local fixture")}}',compatibilityDate:'2026-10-07',r2Buckets:['AUDIT']}));
 try{
  const bucket=await runtime.getR2Bucket('AUDIT');let calls=0;
  const now=Date.now();
  const env={VAOS_AI_DEVELOPMENT_CONTROL:'synthetic-one-shot-v1',GEMINI_API_KEY:'dummy',VAOS_ARTIFACTS:bucket,
   VAOS_AI_FREE_TIER_EVIDENCE:JSON.stringify({id:'local-r2-test',project:'test-project',model:'gemini-3.8-flash',billingEnabled:false,tier:'free',approved:true,reviewedAt:now-1000,expiresAt:now+60000,rpm:1,tpm:1000,rpd:1})};
  const fetchImpl=async()=>{calls++;return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'2'}]}}]})}};
  const results=await Promise.all(Array.from({length:4},()=>runDevelopmentProbe({env,request:{confirm:true},now,fetchImpl})));
  assert.equal(results.filter(x=>x.status==='OK').length,1);assert.equal(calls,1);
  assert.equal((await bucket.get('ai-independence/reservations/test-project/local-r2-test')).key,'ai-independence/reservations/test-project/local-r2-test');
 }finally{await runtime.dispose();}
});
