import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createNeuralKnowledgeHandler} from './neural-knowledge.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
const email='shyamsundhar1982@gmail.com';
const pin='a'.repeat(40);
const graph={schemaVersion:'VYNDI_VEDM_AUTHORITY_READ_V1',sourceRepository:'vayu-shastr/veloxis-engineering-design-manual',sourceCommit:pin,sourceAuthority:'compileVedmAuthorityGraph',asOfDate:'2026-11-03',readOnly:true,actionAuthorized:false,currentRuntimeAuthorityVerified:false,releaseReady:false,
 nodes:[{id:'VEDM-1',title:'Geometry',kind:'document_revision',sourceRef:'VEDM',releaseEffect:'none'},{id:'G5',title:'Gate',kind:'release_gate',sourceRef:'G5',releaseEffect:'none'}],edges:[{from:'VEDM-1',to:'G5',relation:'BLOCKED_BY'}]};
function request({who=email,source='vyndi-vedm',method='GET',env={}}={}){
 const cookie=who?SESSION_COOKIE+'='+createSessionToken(who):'';
 return{method,url:'https://vaos.local/api/neural-knowledge?source='+source,headers:{cookie},env:{VAOS_NEURAL_KNOWLEDGE_CONTROL:'founder-readonly-v1',...env}};
}
function response(){const data={status:200,body:null,headers:{}};const res={setHeader(k,v){data.headers[k]=v;return res},status(s){data.status=s;return res},json(o){data.body=o;return res}};return{res,data}}
async function invoke(req,handler){const {res,data}=response();await handler(req,res);return data}
test('route registered, founder-only, and never permits mutation or unapproved feature activation',async()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/neural-knowledge'],'function');
 let called=false;
 const handler=createNeuralKnowledgeHandler({getVyndiReader:()=>{called=true;throw Error('unused')}});
 assert.equal((await invoke(request({who:null}),handler)).status,401);
 assert.equal((await invoke(request({who:'kaaviyam1519@gmail.com'}),handler)).status,403);
 assert.equal((await invoke(request({method:'POST'}),handler)).status,405);
 assert.equal((await invoke(request({env:{VAOS_NEURAL_KNOWLEDGE_CONTROL:'off'}}),handler)).status,409);
 assert.equal((await invoke(request({source:'../../settings'}),handler)).status,422);
 assert.equal(called,false);
});
test('signed VYNDI read returns pinned graph nodes with source authority and no action permission',async()=>{
 let calls=0;const handler=createNeuralKnowledgeHandler({getVyndiReader:()=>({async execute(job){
  calls++;assert.equal(job.actionType,'KNOWLEDGE.OBSERVE_VEDM_GRAPH');
  return {actionType:job.actionType,sourceAuthority:'compileVedmAuthorityGraph',data:graph};
 }})});
 const data=await invoke(request({env:{VYNDI:{fetch(){}}}}),handler);
 assert.equal(data.status,200);
 assert.equal(data.body.data.source,'vyndi-vedm');
 assert.equal(data.body.data.nodes.length,2);
 assert.equal(data.body.data.actionAuthorized,false);
 assert.equal(data.body.data.currentBusinessTruthCertified,false);
 assert.equal(data.body.data.independentVerification,false);
 assert.equal(data.headers['Cache-Control'],'no-store');
 assert.equal(calls,1);
});
test('no signed binding and mismatched graph provenance fail closed rather than invent edges',async()=>{
 const handler=createNeuralKnowledgeHandler({getVyndiReader:()=>({async execute(){return {sourceAuthority:'getInventory',data:graph}}})});
 assert.equal((await invoke(request(),handler)).status,503);
 assert.equal((await invoke(request({env:{VYNDI:{fetch(){}}}}),handler)).status,503);
});
test('registry reports source types without falsely claiming live commissioned connectivity',async()=>{
 const handler=createNeuralKnowledgeHandler();
 const result=await invoke(request({source:'registry'}),handler);
 assert.equal(result.status,200);
 assert.equal(result.body.data.sources.length,7);
 assert.ok(result.body.data.sources.every(x=>x.status!=='LIVE_VERIFIED'));
});

test('registry distinguishes reviewed snapshots for Obsidian and Dify without claiming live connections',async()=>{
 const result=await invoke(request({source:'registry',env:{VAOS_ARTIFACTS:{async get(){return null}}}}),createNeuralKnowledgeHandler());
 const sources=result.body.data.sources;
 assert.equal(result.status,200);
 assert.deepEqual(sources.filter(s=>['obsidian','dify'].includes(s.id)).map(s=>s.status),['NOT_COMMISSIONED','NOT_COMMISSIONED']);
 assert.ok(sources.every(s=>s.status!=='LIVE_VERIFIED'));
});

test('neural source registry can be admitted through bundled free-tier feature control',async()=>{
 const handler=createNeuralKnowledgeHandler();
 const env={VAOS_NEURAL_KNOWLEDGE_CONTROL:undefined,VAOS_FEATURE_FLAGS:JSON.stringify({VAOS_NEURAL_KNOWLEDGE_CONTROL:'founder-readonly-v1'})};
 const response=await invoke(request({source:'registry',env}),handler);
 assert.equal(response.status,200);
 assert.ok(response.body.data.sources.length>=7);
});

test('neural registry reflects pinned metadata sources through free-tier config without claiming live SPARK',async()=>{
 const hashes={graphify:'a'.repeat(64),'brain-atlas':'b'.repeat(64),'llm-wiki':'c'.repeat(64)};
 const env={VAOS_ARTIFACTS:{get:async()=>null},VAOS_FEATURE_FLAGS:JSON.stringify({VAOS_NEURAL_GRAPH_SNAPSHOT_HASHES:JSON.stringify(hashes)})};
 const result=await invoke(request({source:'registry',env}),createNeuralKnowledgeHandler());
 assert.equal(result.status,200);
 const sources=Object.fromEntries(result.body.data.sources.map(s=>[s.id,s.status]));
 for(const key of Object.keys(hashes))assert.equal(sources[key],'PIN_CONFIGURED_UNVERIFIED');
 for(const key of ['graphiti','obsidian','dify'])assert.equal(sources[key],'NOT_COMMISSIONED');
});

test('founder may view Dify provider-observed run metadata without any write capability',async()=>{
 const envelope={schemaVersion:'VAOS_NEUTRAL_GRAPH_SOURCE_V1',sourceType:'dify',sourceRevision:'a'.repeat(64),observedAt:'2026-11-06T04:00:00Z',
 payload:{nodes:[{id:'dify:run-12345678',type:'workflow_run',title:'Workflow run succeeded'}],edges:[]}};
 let calls=0;
 const handler=createNeuralKnowledgeHandler({readDifyMetadata:async()=>{calls++;return envelope}});
 const env={DIFY_API_KEY:'bound-key',VAOS_FEATURE_FLAGS:JSON.stringify({VAOS_DIFY_NEURAL_READ_CONTROL:'founder-readonly-v1'})};
 const registry=await invoke(request({source:'registry',env}),handler);
 assert.equal(registry.status,200);
 assert.equal(registry.body.data.sources.find(x=>x.id==='dify').status,'CONFIGURED_UNVERIFIED');
 const result=await invoke(request({source:'dify',env}),handler);
 assert.equal(result.status,200);
 assert.equal(result.body.data.source,'dify');
 assert.equal(result.body.data.nodes.length,1);
 assert.equal(result.body.data.integrityVerified,false);
 assert.equal(result.body.data.actionAuthorized,false);
 assert.equal(calls,1);
});
test('Dify live reader remains disabled unless explicit founder-only control is present',async()=>{
 const handler=createNeuralKnowledgeHandler({readDifyMetadata:async()=>{throw Error('should not call')}});
 const result=await invoke(request({source:'dify',env:{DIFY_API_KEY:'bound-key'}}),handler);
 assert.equal(result.status,503);
});
