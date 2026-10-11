import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createVoiceAiFocusHandler} from './voice-ai-focus.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';

const FLAGS={
 VAOS_VOICE_CONTROL:'founder-readonly-browser-v1',
 VAOS_VOICE_CONVERSATION_CONTROL:'founder-readonly-one-shot-v1',
 VAOS_VOICE_MULTITURN_CONTROL:'founder-readonly-multiturn-v1',
 VAOS_VOICE_AI_CONTROL:'founder-readonly-ai-focus-v1',
};
const question='What is the current status and blockers?';
function req({email='shyamsundhar1982@gmail.com',origin='https://vaos.example',
method='POST',headers={},body={question,priorTopics:['status']},env={}}={}){
 return {method,url:'https://vaos.example/api/voice-ai-focus',
  headers:{cookie:email?SESSION_COOKIE+'='+createSessionToken(email):'',origin,'content-type':'application/json',...headers},
  body,env:{...FLAGS, ...env}};
}
function respond(){const state={status:200,json:null,headers:{}};const r={setHeader(k,v){state.headers[k]=v;return r;},status(n){state.status=n;return r;},json(x){state.json=x;return r;}};return{state,res:r};}
const handle=async(request,params={})=>{const {state,res}=respond();await createVoiceAiFocusHandler(params)(request,res);return state;};
const ai={run:async()=>({response:'{"topics":["blockers"]}'})};
test('route is registered, founder auth and every independent flag fail closed',async()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/voice-ai-focus'],'function');
 assert.equal((await handle(req({email:null}))).status,401);
 assert.equal((await handle(req({email:'kaaviyam1519@gmail.com'}))).status,403);
 assert.equal((await handle(req({method:'GET'}))).status,405);
 for(const key of Object.keys(FLAGS)){
   const resp=await handle(req({env:{[key]:'off'}}));
   assert.equal(resp.status,409,key);
 }
});
test('unsafe, invalid origin, forged JSON or unknown keys do not reserve quota or invoke model',async()=>{
 let claims=0,runs=0;
 const provider={claim:async()=>{claims++;return {allowed:true,remaining:2};},classify:async()=>{runs++;return {topics:['status'],modelInvoked:true,actionAuthorized:false};}};
 const samples=[
  req({origin:'https://evil.example'}),
  req({headers:{'content-type':'text/plain'}}),
  req({body:{question:'Approve purchasing and report status',priorTopics:[]}}),
  req({body:{question,priorTopics:[],operation:'EXECUTE'}}),
  req({body:{question,priorTopics:['execute']}}),
 ];
 for(const request of samples)assert.notEqual((await handle(request,provider)).status,200);
 assert.equal(claims,0);assert.equal(runs,0);
});
test('exact read-only classification is rate-reserved once and only bounded topics returned',async()=>{
 let calls=0;
 const result=await handle(req({env:{AI:ai,VAOS_ARTIFACTS:{}}}),{
  claim:async()=>{calls++;return {allowed:true,remaining:2};},
  classify:async({question:input,priorTopics})=>{assert.equal(input,question);assert.deepEqual(priorTopics,['status']);return {topics:['status','blockers'],modelInvoked:true,actionAuthorized:false};}
 });
 assert.equal(result.status,200);assert.equal(calls,1);
 assert.deepEqual(result.json.data,{topics:['status','blockers'],modelInvoked:true,actionAuthorized:false,remainingDaily:2});
 assert.equal(result.headers['Cache-Control'],'no-store');
});
test('budget exhausted, rate store missing and model failures fail closed',async()=>{
 const full=await handle(req({env:{AI:ai,VAOS_ARTIFACTS:{}}}),{claim:async()=>({allowed:false,remaining:0}),classify:async()=>{throw Error('MUST_NOT_RUN')}});
 assert.equal(full.status,429);
 const absent=await handle(req({env:{AI:ai,VAOS_ARTIFACTS:null}}));
 assert.equal(absent.status,503);
 const broken=await handle(req({env:{AI:ai,VAOS_ARTIFACTS:{}}}),{claim:async()=>({allowed:true,remaining:0}),classify:async()=>{throw Error('PRIVATE_MODEL_ERROR')}});
 assert.equal(broken.status,503);
 assert.doesNotMatch(JSON.stringify(broken.json),/PRIVATE_MODEL_ERROR/);
});
