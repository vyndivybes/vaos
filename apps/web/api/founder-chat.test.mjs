import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createFounderChatHandler} from './founder-chat.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
import {FOUNDER_AI_MODEL} from '../lib/founder-ai-draft.mjs';
const messageId='e71daead-e709-4298-9f9d-04bf2cbf3236';
const body={operation:'GENERATE_READONLY_DRAFT',agentId:'project',messageId,missionId:'MISSION-0001'};
const original={messageId,recipientAgentId:'project',kind:'REPORT_REQUEST',status:'RECORDED_NOT_ROUTED',instruction:'Provide a status summary for this mission'};
const snapshot={mission:{id:'MISSION-0001',status:'ACTIVE'},workPackages:[],handoffs:[]};
const goodReply={messageId,agentId:'project',missionId:'MISSION-0001',status:'AI_DRAFT_UNVERIFIED',
 model:FOUNDER_AI_MODEL,content:'A bounded, unverified draft summary based on the mission snapshot.',
 evidenceRefs:[]};
function req(opts={}){const email=opts.email===undefined?'shyamsundhar1982@gmail.com':opts.email;
return {method:opts.method||'POST',url:'https://vaos.example/api/founder-chat',
 headers:{cookie:email?SESSION_COOKIE+'='+createSessionToken(email):'',
 origin:opts.origin===undefined?'https://vaos.example':opts.origin,
 'content-type':opts.contentType||'application/json'},body:opts.body??body,
 env:{AI:{run:async()=>({response:'A successful draft based only on safe evidence.'})},
 VAOS_FOUNDER_INBOX_CONTROL:opts.inbox===false?'off':'record-only-v1',
 VAOS_FOUNDER_AGENT_REPORT_CONTROL:opts.report===false?'off':'preview-only-v1',
 VAOS_FOUNDER_CHAT_CONTROL:opts.chat===false?'off':'qualified-readonly-v1'}};}
function response(){const o={status:200,headers:{},body:null};const res={
 setHeader(k,v){o.headers[k]=v;return res},status(n){o.status=n;return res},
 json(x){o.body=x;return res}};return {o,res};}
function fixture({messages=[original],stored=null,write=true,model=true}={}){
 const calls=[];
 const handler=createFounderChatHandler({
 getInbox:()=>({async list(x){calls.push(['inbox',x]);return {messages}}}),
 getReplies:()=>({async get(x){calls.push(['get',x]);return {reply:stored}},
 async append(x){calls.push(['append',x]);return write?{outcome:'RECORDED',reply:goodReply}:{outcome:'RATE_LIMITED'}}}),
 getMission:()=>({async snapshot(x){calls.push(['mission',x]);return snapshot}}),
 runAi:async()=>{calls.push(['model']);if(!model)throw Error('model failed');
 return {content:'A successful draft based only on safe evidence.',status:'AI_DRAFT_UNVERIFIED',
 model:FOUNDER_AI_MODEL,actionAuthorized:false};}
 });return {calls,handler};
}
test('Stage 4 endpoint wired to Cloudflare without business execution',()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/founder-chat'],'function');
});
test('founder gate, disabled state, same-origin and POST requirements fail closed',async()=>{
 const f=fixture();
 for(const [opts,status] of [[{email:null},401],[{email:'kaaviyam1519@gmail.com'},403],
  [{chat:false},409],[{inbox:false},409],[{report:false},409],
  [{origin:'https://malicious.example'},403],[{origin:null},403],
  [{method:'GET'},405],[{contentType:'text/plain'},415]]){
  const out=response();await f.handler(req(opts),out.res);assert.equal(out.o.status,status);
 }
 assert.equal(f.calls.length,0);
});
test('untrusted input cannot grant authority or send arbitrary agents',async()=>{
 const f=fixture();
 for(const candidate of [{...body,agentId:'finance'},{...body,operation:'DISPATCH'},
  {...body,actorEmail:'anything'},{...body,messageId:'not-uuid'},
  {...body,missionId:'../../secrets'}]){
  const out=response();await f.handler(req({body:candidate}),out.res);assert.equal(out.o.status,422);
 }
 assert.equal(f.calls.length,0);
});
test('unrecorded requests or different message kinds never invoke a model',async()=>{
 for(const messages of [[],[{...original,kind:'INSTRUCTION'}],
 [{...original,recipientAgentId:'finance'}],[{...original,status:'DRAFT_NOT_SENT'}]]){
  const f=fixture({messages}),out=response();
  await f.handler(req(),out.res);assert.equal(out.o.status,409);
  assert.equal(f.calls.filter(x=>x[0]==='model').length,0);
 }
});
test('existing persisted reply is read back without another model call',async()=>{
 const f=fixture({stored:goodReply}),out=response();await f.handler(req(),out.res);
 assert.equal(out.o.status,200);assert.equal(out.o.body.data.outcome,'REPLAY');
 assert.equal(out.o.body.data.modelInvoked,false);
 assert.equal(f.calls.filter(x=>x[0]==='model').length,0);
});
test('existing draft for another mission must not leak across mission ID',async()=>{
 const f=fixture({stored:{...goodReply,missionId:'MISSION-0002'}}),out=response();
 await f.handler(req(),out.res);assert.equal(out.o.status,409);
 assert.equal(f.calls.filter(x=>x[0]==='model').length,0);
});
test('new draft requires evidence lookup, bounded model and durable append',async()=>{
 const f=fixture(),out=response();await f.handler(req(),out.res);
 assert.equal(out.o.status,201);
 assert.equal(out.o.body.data.reply.status,'AI_DRAFT_UNVERIFIED');
 assert.equal(out.o.body.data.actionAuthorized,false);
 assert.deepEqual(f.calls.map(x=>x[0]),['inbox','get','mission','model','append']);
 assert.match(f.calls.find(x=>x[0]==='append')[1].sourceHash,/^[a-f0-9]{64}$/);
});
test('provider and persistence failure fail closed without model pass claims',async()=>{
 for(const opts of [{model:false},{write:false}]){
  const f=fixture(opts),out=response();await f.handler(req(),out.res);
  assert.equal(out.o.status,503);assert.doesNotMatch(JSON.stringify(out.o.body),/A successful draft/);
 }
});
