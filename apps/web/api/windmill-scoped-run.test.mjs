import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken} from '../lib/auth.mjs';
import {createWindmillScopedRunHandler} from './windmill-scoped-run.mjs';
const owner='shyamsundhar1982@gmail.com';
const cookie='vaos_session='+encodeURIComponent(createSessionToken(owner));
function response(){let status=200,body;return{
 setHeader(){return this},status(n){status=n;return this},json(v){body=v;return this},
 get output(){return {status,body}},
};}
const baseReq=()=>({
 method:'POST',url:'https://vaos.vayushastr.workers.dev/api/windmill-scoped-run',
 headers:{cookie,origin:'https://vaos.vayushastr.workers.dev',
   'content-type':'application/json','x-vaos-csrf-intent':'windmill-scoped-ping-v1'},
 body:{operation:'RUN_ONE_QUALIFICATION_PING'},
 env:{VAOS_WINDMILL_EXECUTE_OWNERS:owner},
});
test('unauthenticated or unauthorized caller cannot launch a Windmill script',async()=>{
 let called=0;const h=createWindmillScopedRunHandler({run:async()=>{called++}});
 const bad=baseReq();delete bad.headers.cookie;
 const r=response();await h(bad,r);assert.equal(r.output.status,401);
 const other=baseReq();other.env.VAOS_WINDMILL_EXECUTE_OWNERS='other@example.com';
 const s=response();await h(other,s);assert.equal(s.output.status,403);
 assert.equal(called,0);
});
test('cross-site requests, extra payload parameters, missing scope header fail before execution',async()=>{
 let called=0;const h=createWindmillScopedRunHandler({run:async()=>{called++}});
 for(const changes of [
  r=>r.headers.origin='https://evil.example',
  r=>{delete r.headers['x-vaos-csrf-intent']},
  r=>r.body.scriptPath='f/vaos/evil',
  r=>r.body.operation='RUN_ARBITRARY_CODE',
  r=>r.headers['content-type']='text/plain',
 ]){
  const req=baseReq();changes(req);const res=response();
  await h(req,res);assert.notEqual(res.output.status,200);
 }
 assert.equal(called,0);
});
test('authorized request returns only sanitized trusted qualification fields',async()=>{
 const req=baseReq(),r=response();
 const h=createWindmillScopedRunHandler({run:async()=>({
 status:'PASS',providerId:'windmill',scriptPath:'f/vaos/qualification_ping',
 providerJobId:'019effff-aaaa-7bbb-8ccc-0123456789ab',
 independentProviderReadback:true,
 maxConcurrentRuns:1,businessWritesAllowed:false,automaticRetry:false,
 })});
 await h(req,r);
 assert.equal(r.output.status,200);
 assert.equal(r.output.body.data.status,'PASS');
 assert.equal(JSON.stringify(r.output.body).includes('token'),false);
});
test('provider or runtime unavailable returns HOLD without error details',async()=>{
 const req=baseReq(),r=response();
 const h=createWindmillScopedRunHandler({run:async()=>{throw Error('secret token should not leak')}});
 await h(req,r);assert.equal(r.output.status,503);
 assert.doesNotMatch(JSON.stringify(r.output.body),/secret token/);
});
