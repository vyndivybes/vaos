import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken, SESSION_COOKIE} from '../lib/auth.mjs';
import {createVoiceCapabilitiesHandler} from './voice-capabilities.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';

function request({email='shyamsundhar1982@gmail.com',method='GET',control='off',conversation='off',multiturn='off'}={}) {
  return {method,headers:{cookie:email ? `${SESSION_COOKIE}=${createSessionToken(email)}` : ''},
    env:{VAOS_VOICE_CONTROL:control,VAOS_VOICE_CONVERSATION_CONTROL:conversation,VAOS_VOICE_MULTITURN_CONTROL:multiturn},url:'https://vaos.example/api/voice-capabilities'};
}
function response() {
  const state={status:200,body:null,headers:{}};
  const res={setHeader(k,v){state.headers[k]=v;return res;},status(n){state.status=n;return res;},json(v){state.body=v;return res;}};
  return {res,state};
}
async function handle(params) {
  const {res,state}=response(); await createVoiceCapabilitiesHandler()(request(params),res);return state;
}
test('voice capability is an explicit, registered Worker route',()=>{
  assert.equal(typeof DEFAULT_API_HANDLERS['/api/voice-capabilities'],'function');
});
test('deny unauthenticated callers and other identities',async()=>{
  assert.equal((await handle({email:null})).status,401);
  assert.equal((await handle({email:'kaaviyam1519@gmail.com'})).status,403);
  assert.equal((await handle({method:'POST'})).status,405);
});
test('default and unknown flags remain off, with no action authority',async()=>{
  for(const control of ['off','enabled',undefined]){
    const state=await handle({control});
    assert.equal(state.status,200);
    assert.equal(state.body.data.enabled,false);
    assert.equal(state.body.data.actionAuthorized,false);
    assert.equal(state.body.data.serverAudioEnabled,false);
    assert.equal(state.headers['Cache-Control'],'no-store');
  }
});
test('qualified founder-only browser pilot exposes no dispatch or automatic submission',async()=>{
  const state=await handle({control:'founder-readonly-browser-v1'});
  assert.equal(state.status,200);
  assert.deepEqual(state.body.data,{
    enabled:true,oneShotEnabled:false,oneShotMode:'DISABLED',multiTurnEnabled:false,multiTurnMode:'DISABLED',mode:'BROWSER_DICTATION_READONLY',transport:'BROWSER_WEB_SPEECH',
    manualReviewRequired:true,speechRecognitionMayUseBrowserVendorService:true,
    automaticSubmission:false,agentDispatch:false,actionAuthorized:false,serverAudioEnabled:false,
  });
});

test('one-shot voice capability is separately enabled only for authenticated founder with base pilot active',async()=>{
 const accepted=await handle({control:'founder-readonly-browser-v1',conversation:'founder-readonly-one-shot-v1'});
 assert.equal(accepted.status,200);
 assert.equal(accepted.body.data.oneShotEnabled,true);
 assert.equal(accepted.body.data.oneShotMode,'FOUNDER_ONE_SHOT_READONLY_GET');
 assert.equal(accepted.body.data.automaticSubmission,false);
 assert.equal(accepted.body.data.agentDispatch,false);
 assert.equal(accepted.body.data.actionAuthorized,false);
 assert.equal((await handle({control:'off',conversation:'founder-readonly-one-shot-v1'})).body.data.oneShotEnabled,false);
 assert.equal((await handle({control:'founder-readonly-browser-v1',conversation:'invalid'})).body.data.oneShotEnabled,false);
 assert.equal((await handle({email:'kaaviyam1519@gmail.com',control:'founder-readonly-browser-v1',conversation:'founder-readonly-one-shot-v1'})).status,403);
 assert.equal((await handle({email:null,control:'founder-readonly-browser-v1',conversation:'founder-readonly-one-shot-v1'})).status,401);
});

test('Stage V3 requires all three independent flags and founder identity',async()=>{
 const flags={control:'founder-readonly-browser-v1',conversation:'founder-readonly-one-shot-v1',multiturn:'founder-readonly-multiturn-v1'};
 const ok=await handle(flags);
 assert.equal(ok.status,200);
 assert.equal(ok.body.data.multiTurnEnabled,true);
 assert.equal(ok.body.data.multiTurnMode,'FOUNDER_MULTITURN_READONLY_GET');
 assert.equal(ok.body.data.actionAuthorized,false);
 assert.equal(ok.body.data.automaticSubmission,false);
 for(const key of Object.keys(flags)) {
   const q=await handle({...flags,[key]:'off'});
   assert.equal(q.body.data.multiTurnEnabled,false,key);
 }
 assert.equal((await handle({...flags,email:'kaaviyam1519@gmail.com'})).status,403);
 assert.equal((await handle({...flags,email:null})).status,401);
});
