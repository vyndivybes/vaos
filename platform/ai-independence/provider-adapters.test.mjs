import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiFreeAdapter } from './gemini-free-adapter.mjs';
import { createLoopbackModelAdapter } from './loopback-model-adapter.mjs';
import { routeInference } from './provider-router.mjs';

const task={classification:'PUBLIC',capability:'text',input:'Summarize public sample'};
const okResponse={ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:'Evidence-oriented answer'}]}}]})};
const fakeFetch=async()=>okResponse;
const remoteConfig={apiKey:'dummy-secret',model:'gemini-3.8-flash',freeTierVerified:true,maxRequestsPerProcess:2,fetchImpl:fakeFetch};

test('RED Gemini adapter requires a verified free-tier account',()=>{
 assert.throws(()=>createGeminiFreeAdapter({...remoteConfig,freeTierVerified:false}),/FREE_TIER_NOT_VERIFIED/);
});
test('RED Gemini adapter requires an exact free-tier approved model',()=>{
 assert.throws(()=>createGeminiFreeAdapter({...remoteConfig,model:'gemini-4-argon'}),/MODEL_NOT_APPROVED_FREE/);
});
test('RED Gemini adapter never puts API key into URL or request body',async()=>{
 let url,options;const adapter=createGeminiFreeAdapter({...remoteConfig,fetchImpl:async(u,o)=>{url=u;options=o;return okResponse}});
 const output=await adapter.invoke(task);
 assert.equal(output.text,'Evidence-oriented answer');
 assert.equal(adapter.kind,'external');
 assert.equal(adapter.costTier,'free');
 assert.equal(adapter.capabilities.includes('text'),true);
 assert.ok(url.startsWith('https://generativelanguage.googleapis.com/'));
 assert.ok(!url.includes('dummy-secret'));
 assert.ok(!options.body.includes('dummy-secret'));
 assert.equal(options.headers['x-goog-api-key'],'dummy-secret');
 assert.match(options.body,/Summarize public sample/);
});
test('RED Gemini adapter blocks confidential input even when directly invoked',async()=>{
 let sent=0;const adapter=createGeminiFreeAdapter({...remoteConfig,fetchImpl:async()=>{sent++;return okResponse}});
 await assert.rejects(()=>adapter.invoke({...task,classification:'CONFIDENTIAL'}),/DATA_CLASSIFICATION_DENIED/);
 assert.equal(sent,0);
});
test('RED Gemini adapter enforces free-only process request budget',async()=>{
 let sent=0;const adapter=createGeminiFreeAdapter({...remoteConfig,fetchImpl:async()=>{sent++;return okResponse}});
 await adapter.invoke(task);await adapter.invoke(task);
 await assert.rejects(()=>adapter.invoke(task),/REQUEST_BUDGET_EXHAUSTED/);
 assert.equal(sent,2);
});
test('RED Gemini adapter fails closed on unsupported modalities',async()=>{
 const adapter=createGeminiFreeAdapter(remoteConfig);
 await assert.rejects(()=>adapter.invoke({...task,capability:'audio'}),/UNSUPPORTED_CAPABILITY/);
});
test('RED Gemini adapter suppresses upstream error details, including secrets',async()=>{
 const adapter=createGeminiFreeAdapter({...remoteConfig,fetchImpl:async()=>{throw new Error('dummy-secret') }});
 await assert.rejects(()=>adapter.invoke(task),e=>e.message==='REMOTE_PROVIDER_FAILED');
});
test('RED Gemini adapter rejects empty, blocked, or oversized provider outputs',async()=>{
 const empty=createGeminiFreeAdapter({...remoteConfig,fetchImpl:async()=>({...okResponse,json:async()=>({candidates:[]})})});
 await assert.rejects(()=>empty.invoke(task),/REMOTE_PROVIDER_FAILED/);
 const huge=createGeminiFreeAdapter({...remoteConfig,fetchImpl:async()=>({...okResponse,json:async()=>({candidates:[{content:{parts:[{text:'a'.repeat(50000)}]}}]})})});
 await assert.rejects(()=>huge.invoke(task),/REMOTE_PROVIDER_FAILED/);
});
test('RED adapter can run end to end through policy router with synthetic input',async()=>{
 const adapter=createGeminiFreeAdapter(remoteConfig);
 const result=await routeInference({task:{...task,classification:'SYNTHETIC'},providers:[adapter],allowExternal:true});
 assert.equal(result.status,'OK');
 assert.equal(result.providerId,'gemini-free');
 assert.equal(result.output.text,'Evidence-oriented answer');
});
test('RED local inference adapter rejects anything except exact loopback endpoint',()=>{
 for(const url of ['http://example.com:11434','http://localhost:11434','https://127.0.0.1:11434','http://127.0.0.1:8000','http://127.0.0.1:11434/evil']) {
  assert.throws(()=>createLoopbackModelAdapter({baseUrl:url,model:'gemma3:1b',fetchImpl:fakeFetch}),/INVALID_LOOPBACK_ENDPOINT/);
 }
});
test('RED local inference adapter uses localhost with no credential or external network',async()=>{
 let url,options;
 const adapter=createLoopbackModelAdapter({model:'gemma3:1b',fetchImpl:async(u,o)=>{url=u;options=o;return {ok:true,json:async()=>({response:'offline reasoning'})}}});
 const output=await adapter.invoke({...task,classification:'CONFIDENTIAL'});
 assert.equal(url,'http://127.0.0.1:11434/api/generate');
 assert.equal(output.text,'offline reasoning');
 assert.equal(adapter.kind,'local');
 assert.equal(adapter.costTier,'free');
 assert.deepEqual(Object.keys(options.headers),['content-type']);
});
test('RED local inference adapter declines missing models and oversized outputs',async()=>{
 assert.throws(()=>createLoopbackModelAdapter({model:''}),/INVALID_LOCAL_MODEL/);
 const adapter=createLoopbackModelAdapter({model:'gemma3:1b',fetchImpl:async()=>({ok:true,json:async()=>({response:'x'.repeat(50000)})})});
 await assert.rejects(()=>adapter.invoke(task),/LOCAL_PROVIDER_FAILED/);
});
test('RED local inference adapter supports independence router mode',async()=>{
 const local=createLoopbackModelAdapter({model:'gemma3:1b',fetchImpl:async()=>({ok:true,json:async()=>({response:'local answer'})})});
 const result=await routeInference({task:{...task,classification:'CONFIDENTIAL'},mode:'independence',providers:[local]});
 assert.equal(result.status,'OK');
 assert.equal(result.output.text,'local answer');
});
