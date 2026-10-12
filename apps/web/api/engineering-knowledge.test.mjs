import test from 'node:test';import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createEngineeringKnowledgeHandler} from './engineering-knowledge.mjs';
const sha='a'.repeat(40);
const current=`# Current configuration status
**Current issue:** \`00_CONTROL/CURRENT_CONFIGURATION_STATUS_Rev-0.8_20260920-FK75-DEVELOPMENT.md\`

| Configuration object | Authority state |
|---|---|
| VEDM-301 Rev 5.3.9 Candidate E-K75 | **CONTROLLING FRAME-GEOMETRY AUTHORITY** |
| Rev 5.4 FK75 | **DEVELOPMENT — NOT RELEASED** |
Open decisive gates remain native FEA and MATERIAL-01.`;
const docNames=['CURRENT_CONFIGURATION_STATUS.md','00_CONTROL/CURRENT_CONFIGURATION_STATUS_Rev-0.8_20260920-FK75-DEVELOPMENT.md','VIBPE_Copilot/KNOWLEDGE_PACK_REGISTER.md'];
const documents={
 [docNames[0]]:current,
 [docNames[1]]:'# Controlling development issue\nEngineering configuration authority: Rev 5.4 FK75 remains NOT RELEASED; human signoff required.',
 [docNames[2]]:'# KP-13 Engineering Change\n# KP-14 Risk\n# KP-15 Integration',
 'docs/VIBPE-COPILOT-2-ARCHITECTURE.md':'# VIBPE Co-Pilot 2\nAdvisory only, human approval required.',
};
function mockFetch(url){
 const u=new URL(url);const match=u.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/(.*)$/);
 if(!match)return Promise.resolve({ok:false,status:404});
 if(match[2]==='git/ref/heads/main')return Promise.resolve({ok:true,json:async()=>({object:{sha}})});
 const path=match[2].replace(/^contents\//,'').split('/').map(decodeURIComponent).join('/');
 if(path.startsWith('contents/')||!Object.hasOwn(documents,path))return Promise.resolve({ok:false,status:404});
 const body=documents[path];
 return Promise.resolve({ok:true,json:async()=>({encoding:'base64',
   content:Buffer.from(body).toString('base64'),size:Buffer.byteLength(body),sha:'b'.repeat(40)})});
}
function response(){const state={code:200,body:null,headers:{}};const res={
 setHeader(k,v){state.headers[k]=v;return res},status(n){state.code=n;return res},json(v){state.body=v;return res}
};return {res,state};}
function req(email='shyamsundhar1982@gmail.com'){return {method:'GET',
 url:'https://vaos.example/api/engineering-knowledge?q=What%20are%20our%20present%20engineering%20changes',
 headers:{cookie:email?SESSION_COOKIE+'='+createSessionToken(email):''},
 env:{VAOS_VOICE_CONTROL:'founder-readonly-browser-v1',VAOS_FEDERATED_GITHUB_TOKEN:'fake-test-token-01234567890123456789'}};}
const getReader=()=>({execute:async job=>({actionType:job.actionType,sourceAuthority:'getEngineeringChangeControlState',
 data:{changeOrders:[],baselines:[{id:'E-K75',status:'released',revision_code:'5.3.9'}]}})});
test('private VEDM and VIBPE sources require authenticated founder and no writes',async()=>{
 let calls=0;const h=createEngineeringKnowledgeHandler({fetchImpl:async (...args)=>{calls++;return mockFetch(...args);},getReader});
 for(const user of ['', 'other@example.com']){const {res,state}=response();await h(req(user),res);
  assert.ok([401,403].includes(state.code));}
 assert.equal(calls,0);
});
test('combined engineering answer cites commit-pinned VEDM, VIBPE and ERP sources with caveats',async()=>{
 const h=createEngineeringKnowledgeHandler({fetchImpl:mockFetch,getReader});
 const {res,state}=response();await h(req(),res);
 assert.equal(state.code,200);
 const data=state.body.data;
 assert.equal(data.status,'OBSERVED');
 assert.match(data.answer,/no registered ECO rows/i);
 assert.match(data.answer,/5\.3\.9.*CONTROLLING/i);
 assert.match(data.answer,/KP-13/);
 assert.equal(data.advisoryOnly,true);
 assert.equal(data.actionAuthorized,false);
 assert.ok(data.sources.some(x=>x.repository==='vayu-shastr/adv-vibpe'));
 assert.ok(data.sources.every(x=>x.url.includes('/blob/'+sha+'/')));
});
test('missing controlling VEDM record is HOLD, even with KP context and ERP data',async()=>{
 const h=createEngineeringKnowledgeHandler({fetchImpl:async url=>{
  if(String(url).includes('CURRENT_CONFIGURATION_STATUS.md'))return {ok:false,status:404};
  return mockFetch(url);
 },getReader});
 const {res,state}=response();await h(req(),res);
 assert.equal(state.code,200);
 assert.equal(state.body.data.status,'HOLD');
 assert.doesNotMatch(state.body.data.answer,/5\.3\.9.*CONTROLLING/);
});
test('provider auth or missing token fails closed without leaking GitHub token or business records',async()=>{
 const h=createEngineeringKnowledgeHandler({fetchImpl:mockFetch,getReader});
 const incoming=req();incoming.env.VAOS_FEDERATED_GITHUB_TOKEN=undefined;
 const {res,state}=response();await h(incoming,res);
 assert.equal(state.body.data.status,'HOLD');
 assert.ok(!JSON.stringify(state.body).includes('fake-test-token'));
});
