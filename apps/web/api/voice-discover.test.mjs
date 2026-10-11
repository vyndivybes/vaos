import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createVoiceDiscoverHandler} from './voice-discover.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';

function response(){const state={status:200,body:null};const res={
 setHeader(){return res;},status(x){state.status=x;return res;},json(x){state.body=x;return res;}};return {state,res};}
async function call({email='shyamsundhar1982@gmail.com',flag='founder-readonly-browser-v1',q='carbon frame status',method='GET'}={}){
 const {state,res}=response();let reads=0;
 const service={listRunnableMissions:async()=>({missionIds:['FRAME-M','OTHER-A']}),
 snapshot:async id=>{reads++;return {mission:{id,objective:id==='FRAME-M'?'Carbon frame engineering':'Warehouse inspection',status:'ACTIVE'},workPackages:[{status:'COMPLETED'},{status:'BLOCKED'}]};}};
 const req={method,url:'https://vaos.example/api/voice-discover?q='+encodeURIComponent(q),
 env:{VAOS_VOICE_CONTROL:flag},headers:{cookie:email?`${SESSION_COOKIE}=${createSessionToken(email)}`:''}};
 await createVoiceDiscoverHandler({getService:()=>service})(req,res);
 return {state,reads};
}
test('mission discovery is routed',()=>assert.equal(typeof DEFAULT_API_HANDLERS['/api/voice-discover'],'function'));
test('founder only and fail-closed flag',async()=>{
 assert.equal((await call({email:null})).state.status,401);
 assert.ok([401,403].includes((await call({email:'somebody@example.com'})).state.status));
 assert.equal((await call({flag:'off'})).state.status,409);
 assert.equal((await call({method:'POST'})).state.status,405);
});
test('reject write-like intent without touching store',async()=>{
 const r=await call({q:'approve carbon frame purchase'});
 assert.equal(r.state.status,422);assert.equal(r.reads,0);
});
test('discover relevant runnable mission without user-supplied mission ID',async()=>{
 const {state,reads}=await call();
 assert.equal(state.status,200);assert.equal(reads,2);
 assert.equal(state.body.data.matches[0].id,'FRAME-M');
 assert.equal(state.body.data.matches.length,1);
 assert.equal(state.body.data.actionAuthorized,false);
 assert.equal(state.body.data.scope,'RUNNABLE_MISSIONS_ONLY');
});
test('no match admits incomplete search coverage',async()=>{
 const r=await call({q:'aviation maintenance progress'});
 assert.equal(r.state.body.data.matches.length,0);
 assert.match(r.state.body.data.answer,/does not mean no relevant mission exists/i);
});
