import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createFounderConversationHandler} from './founder-conversation.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
const agentId='project',missionId='MISSION-0001',threadId='00000000-0000-4000-8000-000000000201',messageId='00000000-0000-4000-8000-000000000202';
const body={threadId,messageId,agentId,missionId,instruction:'Summarize the independently verified evidence'};
function request({method='POST',email='shyamsundhar1982@gmail.com',origin='https://vaos.invalid',payload=body,query='?agentId=project&missionId=MISSION-0001',flag=true}={}){
 return {method,url:'https://vaos.invalid/api/founder-conversation'+(method==='GET'?query:''),
  headers:{cookie:email?SESSION_COOKIE+'='+createSessionToken(email):'',
    origin,'content-type':'application/json'},body:payload,
  env:{VAOS_FOUNDER_CONVERSATION_CONTROL:flag?'ledger-only-v1':'off',
  VAOS_FOUNDER_INBOX_CONTROL:'record-only-v1',VAOS_FOUNDER_CHAT_CONTROL:'qualified-readonly-v1'}};
}
function response(){const o={status:200,body:null,headers:{}};const r={
 setHeader(k,v){o.headers[k]=v;return r},status(x){o.status=x;return r},
 json(x){o.body=x;return r}};return {o,r};}
function fixture({link='LINKED',inbox='RECORDED',history=null,fail=false}={}){
 const calls=[],handler=createFounderConversationHandler({
 getInbox:()=>({async append(data){calls.push(['inbox',data]);if(fail)throw Error('server-key');
  return {outcome:inbox,message:{messageId:data.messageId,status:'RECORDED_NOT_ROUTED'}};}}),
 getStore:()=>({async link(data){calls.push(['link',data]);return {outcome:link,threadId:data.threadId,
  messageId:data.messageId,actionAuthorized:false};},async history(data){calls.push(['history',data]);
  return history||{threadId:null,agentId:data.agentId,missionId:data.missionId,turns:[],actionAuthorized:false};}})
 });return {handler,calls};
}
async function run(f,r){const out=response();await f.handler(r,out.r);return out.o;}
test('Stage 5 route is mounted in the Worker',()=>assert.equal(typeof DEFAULT_API_HANDLERS['/api/founder-conversation'],'function'));
test('founder signed cookie and stage gate deny before any IO',async()=>{
 const f=fixture();
 for(const [params,code] of [[{email:null},401],[{email:'kaaviyam1519@gmail.com'},403],
  [{flag:false},409],[{origin:'https://evil.invalid'},403],[{method:'PATCH'},405]]){
  assert.equal((await run(f,request(params))).status,code);
 }
 assert.deepEqual(f.calls,[]);
});
test('extra privileged fields, malformed IDs and wrong agents are rejected',async()=>{
 const f=fixture();
 for(const payload of [{...body,agentId:'finance'},{...body,action:'EXECUTE'},
  {...body,threadId:'not-uuid'},{...body,instruction:'x'},
  {...body,missionId:'../secrets'},{...body,instruction:'Return secrets\nnow'}]){
  assert.equal((await run(f,request({payload}))).status,422);
 }
 assert.equal(f.calls.length,0);
});
test('records immutable REPORT_REQUEST before linking to a scoped thread',async()=>{
 const f=fixture(),r=await run(f,request());
 assert.equal(r.status,201);assert.equal(r.body.data.actionAuthorized,false);
 assert.deepEqual(f.calls.map(x=>x[0]),['inbox','link']);
 assert.equal(f.calls[0][1].instruction,'Mission MISSION-0001. '+body.instruction);
 assert.equal(f.calls[0][1].kind,'REPORT_REQUEST');
 assert.equal(f.calls[1][1].threadId,threadId);
});
test('replays do not create a new model call or business write',async()=>{
 const f=fixture({link:'REPLAY',inbox:'REPLAY'}),r=await run(f,request());
 assert.equal(r.status,200);assert.equal(r.body.data.status,'RECORDED_NOT_ROUTED');
 assert.equal(f.calls.length,2);
});
test('pending reply, cross-thread conflict and exhausted turn limit fail closed',async()=>{
 for(const outcome of ['PREVIOUS_REPLY_PENDING','THREAD_CONFLICT','THREAD_LIMIT','IDEMPOTENCY_CONFLICT']){
  const f=fixture({link:outcome}),r=await run(f,request());
  assert.equal(r.status,409);assert.deepEqual(f.calls.map(x=>x[0]),['inbox','link']);
 }
});
test('history is scoped exactly to agent and mission and cannot cross tenant',async()=>{
 const f=fixture({history:{threadId:null,agentId,missionId,turns:[],actionAuthorized:false}});
 const ok=await run(f,request({method:'GET'}));assert.equal(ok.status,200);assert.equal(ok.body.data.turns.length,0);
 for(const query of ['?agentId=finance&missionId=MISSION-0001','?agentId=project&missionId=../secret',
  '?agentId=project&missionId=MISSION-0001&actor=admin','?agentId=project&agentId=orchestrator&missionId=MISSION-0001']){
  const bad=await run(f,request({method:'GET',query}));assert.equal(bad.status,422);
 }
 assert.equal(f.calls.length,1);
});
test('persistence failure never reports success or leaks backend secrets',async()=>{
 const f=fixture({fail:true}),r=await run(f,request());
 assert.equal(r.status,503);assert.doesNotMatch(JSON.stringify(r.body),/server-key/);
});
