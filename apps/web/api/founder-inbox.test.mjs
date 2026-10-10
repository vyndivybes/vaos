import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createFounderInboxHandler} from './founder-inbox.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';

function req(method,body,options={}){
 const email=options.email===undefined?'shyamsundhar1982@gmail.com':options.email;
 return {method,url:'https://vaos.example/api/founder-inbox'+(options.query||''),
 headers:{cookie:email?SESSION_COOKIE+'='+createSessionToken(email):'',
 origin:options.origin===undefined?'https://vaos.example':options.origin,
 'content-type':options.contentType||'application/json'},body,
 env:{VAOS_FOUNDER_INBOX_CONTROL:options.enabled===false?'off':'record-only-v1'}};
}
function response(){
 const output={status:200,headers:{},body:null};
 const res={setHeader(k,v){output.headers[k]=v;return res},status(n){output.status=n;return res},
 json(b){output.body=b;return res}};
 return {output,res};
}
const input={messageId:'52a8a9bd-3706-4d05-8941-045bfb64c661',agentId:'vibpe',
 kind:'INSTRUCTION',instruction:'Assess the carbon frame validation gaps'};
function setup(result={outcome:'RECORDED',message:{messageId:input.messageId,status:'RECORDED_NOT_ROUTED'}}){
 const calls=[];const handler=createFounderInboxHandler({getStore:()=>({
 async append(x){calls.push(['append',x]);return result;},
 async list(x){calls.push(['list',x]);return {messages:[]}}})});
 return {handler,calls};
}
test('Stage 2 inbox is registered as an authenticated Cloudflare route',()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/founder-inbox'],'function');
});
test('unauthenticated and checker users cannot access founder messages',async()=>{
 const f=setup();
 for(const method of ['GET','POST']){
  for(const email of [null,'kaaviyam1519@gmail.com']){
   const q=response();await f.handler(req(method,input,{email}),q.res);
   assert.equal(q.output.status,email?403:401);
  }
 }
 assert.deepEqual(f.calls,[]);
});
test('send fails closed when switch is off or Origin/Content-Type invalid',async()=>{
 const f=setup();
 for(const [options,expected] of [[{enabled:false},409],[{origin:'https://evil.example'},403],
 [{origin:null},403],[{contentType:'text/plain'},415]]){
  const q=response();await f.handler(req('POST',input,options),q.res);assert.equal(q.output.status,expected);
 }
 assert.deepEqual(f.calls,[]);
});
test('rejects unknown employee, extra actor fields, malformed UUID and oversized messages',async()=>{
 const f=setup();
 for(const body of [{...input,agentId:'fake'},{...input,senderEmail:'admin@example.com'},
 {...input,messageId:'bad'},{...input,kind:'EXECUTE'},{...input,instruction:'x'.repeat(2001)},
 {...input,instruction:'  '}]){
  const q=response();await f.handler(req('POST',body),q.res);assert.equal(q.output.status,422);
 }
 assert.deepEqual(f.calls,[]);
});
test('a founder message is persisted as NOT ROUTED and cannot trigger agent execution',async()=>{
 const f=setup();const q=response();await f.handler(req('POST',input),q.res);
 assert.equal(q.output.status,201);
 assert.equal(q.output.body.data.outcome,'RECORDED');
 assert.equal(q.output.body.data.message.status,'RECORDED_NOT_ROUTED');
 assert.deepEqual(f.calls,[['append',{...input,actorEmail:'shyamsundhar1982@gmail.com'}]]);
 assert.equal(q.output.headers['Cache-Control'],'no-store');
});
test('GET scopes history to authenticated founder and validates agent query',async()=>{
 const f=setup();const q=response();
 await f.handler(req('GET',undefined,{query:'?agentId=vibpe'}),q.res);
 assert.equal(q.output.status,200);assert.deepEqual(f.calls,[['list',{agentId:'vibpe',actorEmail:'shyamsundhar1982@gmail.com'}]]);
 for(const query of ['?agentId=fake','?actorEmail=any','?agentId=vibpe&agentId=qa']){
  const t=response();await f.handler(req('GET',null,{query}),t.res);assert.equal(t.output.status,422);
 }
});
test('store failures never claim delivery or expose internals',async()=>{
 const f=createFounderInboxHandler({getStore:()=>({append(){throw Error('sensitive-secret')},list(){throw Error('secret')}})});
 const q=response();await f(req('POST',input),q.res);assert.equal(q.output.status,503);
 assert.doesNotMatch(JSON.stringify(q.output.body),/secret/);
});
