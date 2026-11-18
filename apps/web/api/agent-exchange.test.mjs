import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createAgentExchangeHandler} from './agent-exchange.mjs';
import {createCloudflareApp,DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
const repoOrigin='https://vaos.example';
const auth=email=>({cookie:SESSION_COOKIE+'='+createSessionToken(email)});
function bucketWith(report){
 const objects=new Map(report?[['runtime/jarvis-exchange/v1/latest/daily.json',JSON.stringify(report)]]:[]);
 return {objects,async get(key){const data=objects.get(key);return data?{text:async()=>data}:null;}};
}
const app=env=>createCloudflareApp({apiHandlers:{'/api/agent-exchange':createAgentExchangeHandler()},
 assetFetcher:()=>new Response('not found',{status:404}),runtimeEnv:env});
test('JARVIS exchange is founder-only, read-only, and validates bounded periods',async()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/agent-exchange'],'function');
 const worker=app({VAOS_ARTIFACTS:bucketWith()});
 const get=(q='',headers={})=>worker.fetch(new Request(repoOrigin+'/api/agent-exchange'+q,{headers}));
 assert.equal((await get()).status,401);
 assert.equal((await get('',auth('kaaviyam1519@gmail.com'))).status,403);
 assert.equal((await get('?period=all',auth('shyamsundhar1982@gmail.com'))).status,422);
 assert.equal((await get('?period=daily&extra=1',auth('shyamsundhar1982@gmail.com'))).status,422);
 assert.equal((await worker.fetch(new Request(repoOrigin+'/api/agent-exchange',{method:'POST',headers:auth('shyamsundhar1982@gmail.com')}))).status,405);
});
test('missing digest remains unavailable rather than an empty healthy briefing',async()=>{
 const r=await app({VAOS_ARTIFACTS:bucketWith()}).fetch(new Request(repoOrigin+'/api/agent-exchange?period=weekly',{
  headers:auth('shyamsundhar1982@gmail.com')}));
 assert.equal(r.status,404);
 assert.equal((await r.json()).error.code,'EXCHANGE_REPORT_NOT_FOUND');
});
test('founder may inspect archived bounded digest but cannot see arbitrary storage contents',async()=>{
 const report={schemaVersion:'VAOS_AGENT_EXCHANGE_V1',period:{kind:'daily'},
  summary:{observedAgents:0,heldAgents:16},agents:[],jarvis:{semanticMemoryUpdated:false}};
 const r=await app({VAOS_ARTIFACTS:bucketWith(report)}).fetch(new Request(repoOrigin+'/api/agent-exchange?period=daily',{
  headers:auth('shyamsundhar1982@gmail.com')}));
 assert.equal(r.status,200);
 assert.deepEqual((await r.json()).data,report);
 assert.equal(r.headers.get('cache-control'),'no-store');
});
