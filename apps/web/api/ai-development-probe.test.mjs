import test from 'node:test';
import assert from 'node:assert/strict';
import {createJarvisMultimodalHandler} from './jarvis-multimodal.mjs';
function harness(email='shyamsundhar1982@gmail.com') {
 let calls=0,status,body;
 const handler=createJarvisMultimodalHandler({getSession:()=>email?{email}:null,developmentProbe:async({request})=>{calls++;assert.deepEqual(request,{confirm:true});return {status:'OK',actionAuthorized:false}}});
 return {get calls(){return calls},async run(extra={},origin='https://vaos.test'){
 const res={setHeader(){},status(n){status=n;return this},json(x){body=x;return this}};
 await handler({method:'POST',url:'https://vaos.test/api/jarvis-multimodal',headers:{origin,'content-type':'application/json'},env:{},body:{operation:'DEVELOPMENT_TEXT_PROBE',confirm:true,...extra}},res);return {status,body};
 }};
}
test('existing founder route dispatches synthetic-only development probe independently of vision control',async()=>{
 const h=harness();const r=await h.run();assert.equal(r.status,200);assert.equal(h.calls,1);assert.equal(r.body.data.actionAuthorized,false);
});
test('probe route rejects unauthenticated, unauthorized, cross-origin and arbitrary prompt requests before inference',async()=>{
 for(const email of ['', 'other@example.test']){const h=harness(email);assert.ok([401,403].includes((await h.run()).status));assert.equal(h.calls,0);}
 const h=harness();assert.equal((await h.run({},'https://evil.test')).status,403);assert.equal((await h.run({prompt:'secret'})).status,422);assert.equal(h.calls,0);
});
