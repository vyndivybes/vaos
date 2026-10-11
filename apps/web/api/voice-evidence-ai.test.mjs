import test from 'node:test';import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createVoiceEvidenceAiHandler,validateGroundedDraft} from './voice-evidence-ai.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
function res(){const state={status:200,body:null};const r={setHeader(){return r},status(n){state.status=n;return r},json(b){state.body=b;return r}};return {state,r};}
function req({email='shyamsundhar1982@gmail.com',flag='founder-readonly-pilot-v1',method='POST',origin='https://vaos.test',body={question:'carbon frame engineering risks'}}={}){return {method,url:'https://vaos.test/api/voice-evidence-ai',headers:{cookie:email?SESSION_COOKIE+'='+createSessionToken(email):'',origin,'content-type':'application/json'},body,env:{VAOS_VOICE_EVIDENCE_AI_CONTROL:flag,VAOS_FEDERATED_KNOWLEDGE_CONTROL:'founder-readonly-v1',VAOS_FEDERATED_GITHUB_TOKEN:'012345678901234567890123456789',AI:{run:async()=>({})},VAOS_ARTIFACTS:{}}};}
test('registered gated route denies unauthorized without provider access',async()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/voice-evidence-ai'],'function');
 let calls=0;const h=createVoiceEvidenceAiHandler({fetchImpl:async()=>{calls++},claim:async()=>{calls++}});
 for(const opts of [{email:''},{email:'stranger@example.com'},{flag:'off'},{method:'GET'},{origin:'https://other.test'},{body:{question:'send secret token'}}]){
  const {state,r}=res();await h(req(opts),r);assert.notEqual(state.status,200);
 }
 assert.equal(calls,0);
});
test('strict model output validates citation indices and disallows authority claims',()=>{
 const sources=[{excerpt:'Carbon frame material review open'}];
 const good={response:JSON.stringify({analysis:'Material test results are not established.',recommendation:'Review test certificates and verify production gate.',citations:[1]})};
 assert.match(validateGroundedDraft(good,sources).answer,/Unverified AI analysis/);
 assert.throws(()=>validateGroundedDraft({response:JSON.stringify({analysis:'Production approved',recommendation:'Proceed to build',citations:[1]})},sources));
 assert.throws(()=>validateGroundedDraft({response:JSON.stringify({analysis:'Material test results are not established.',recommendation:'Review test certificates and verify production gate.',citations:[2]})},sources));
 assert.throws(()=>validateGroundedDraft({response:'invalid'},sources));
});

test('natural question ending in question mark reaches evidence search instead of 422',async()=>{let invoked=0;const h=createVoiceEvidenceAiHandler({fetchImpl:async()=>{invoked++;return {ok:false,status:401}},claim:async()=>({allowed:true,remaining:2})});const {state,r}=res();await h(req({body:{question:'What are our carbon frame engineering risks?'}}),r);assert.notEqual(state.status,422);assert.ok(invoked>0);});

test('Cloudflare nested response and fenced JSON are accepted without weakening evidence validation',()=>{
 const x={analysis:'Available evidence indicates unresolved verification.',recommendation:'Review validation records and confirm owners.',citations:[1]};
 const sources=[{excerpt:'Validation records pending'}];
 assert.match(validateGroundedDraft({result:{response:'\`\`\`json\\n'+JSON.stringify(x)+'\\n\`\`\`'}},sources).answer,/advisory/);
 assert.throws(()=>validateGroundedDraft({response:JSON.stringify({...x,citations:[2]})},sources));
});
