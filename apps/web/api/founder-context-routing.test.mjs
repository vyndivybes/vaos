import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createFounderChatHandler} from './founder-chat.mjs';
import {FOUNDER_AI_MODEL} from '../lib/founder-ai-draft.mjs';
const id='00000000-0000-4000-8000-000000000112';
const prev='00000000-0000-4000-8000-000000000111';
const mid='MISSION-0001';
const request={messageId:id,recipientAgentId:'project',kind:'REPORT_REQUEST',
 status:'RECORDED_NOT_ROUTED',instruction:'Mission MISSION-0001. What about closure?'};
const history={threadId:'00000000-0000-4000-8000-000000000113',agentId:'project',
 missionId:mid,actionAuthorized:false,turns:[
 {messageId:prev,sequence:1,requestStatus:'RECORDED_NOT_ROUTED',
  instruction:'Mission MISSION-0001. Are any blockers recorded?',
  reply:{status:'AI_DRAFT_UNVERIFIED',sourceHash:'a'.repeat(64),evidenceRefs:[]}},
 {messageId:id,sequence:2,requestStatus:'RECORDED_NOT_ROUTED',instruction:request.instruction,reply:null}
 ]};
const body={operation:'GENERATE_READONLY_DRAFT',agentId:'project',messageId:id,missionId:mid};
function req(opts={}){const email=opts.email===undefined?'shyamsundhar1982@gmail.com':opts.email;
 return {method:'POST',url:'https://vaos.invalid/api/founder-chat',body,
 headers:{cookie:email?SESSION_COOKIE+'='+createSessionToken(email):'',
 origin:'https://vaos.invalid','content-type':'application/json'},
 env:{VAOS_FOUNDER_INBOX_CONTROL:'record-only-v1',VAOS_FOUNDER_AGENT_REPORT_CONTROL:'preview-only-v1',
 VAOS_FOUNDER_CHAT_CONTROL:'qualified-readonly-v1',
 VAOS_FOUNDER_CONVERSATION_CONTROL:opts.stage5===false?'off':'ledger-only-v1',
 VAOS_FOUNDER_CONTEXT_CONTROL:opts.stage6===false?'off':'bounded-v1'}};}
function response(){const o={status:200,body:null};const v={
 setHeader(){return v},status(s){o.status=s;return v},json(j){o.body=j;return v}};return {o,v};}
function fixture({hist=history,stored=null,claim='CLAIMED'}={}){
 const calls=[];
 const handler=createFounderChatHandler({
  getInbox:()=>({async list(){calls.push('inbox');return {messages:[request]}}}),
  getReplies:()=>({async get(){calls.push('get');return {reply:stored}},
   async claim(){calls.push('claim');return {outcome:claim}},
   async append(p){calls.push('append');return {outcome:'RECORDED',reply:{
    messageId:id,agentId:'project',missionId:mid,content:p.content,
    status:'AI_DRAFT_UNVERIFIED',model:FOUNDER_AI_MODEL,evidenceRefs:p.evidenceRefs}}}}),
  getConversation:()=>({async history(){calls.push('history');return hist}}),
  getMission:()=>({async snapshot(){calls.push('mission');return {
    mission:{id:mid,status:'READY_FOR_CLOSURE'},workPackages:[],handoffs:[]}}}),
  runAi:async()=>{calls.push('legacy');return {content:'Standalone report with evidence from Stage 4.',model:FOUNDER_AI_MODEL,
    actionAuthorized:false,status:'AI_DRAFT_UNVERIFIED'}},
  runContextAi:async({context})=>{calls.push('context');assert.equal(context.previousMessageId,prev);
   return {content:'Follow-up: evidence and mission closure still require review.',model:FOUNDER_AI_MODEL,
    actionAuthorized:false,status:'AI_DRAFT_UNVERIFIED'};}
 });return {handler,calls};}
async function call(f,o={}){const {o:out,v}=response();await f.handler(req(o),v);return out;}
test('Stage 6 enabled invokes bounded context exactly once after the immutable claim',async()=>{
 const f=fixture(),v=await call(f);
 assert.equal(v.status,201);
 assert.equal(v.body.data.actionAuthorized,false);
 assert.deepEqual(f.calls,['inbox','get','history','mission','claim','context','append']);
});
test('Stage 6 off preserves legacy Stage 4 routing with no history lookup',async()=>{
 const f=fixture(),v=await call(f,{stage6:false});assert.equal(v.status,201);
 assert.deepEqual(f.calls,['inbox','get','mission','claim','legacy','append']);
});
test('valid standalone Stage 4 request with no linked Stage 5 turn falls back safely',async()=>{
 const f=fixture({hist:{...history,threadId:null,turns:[]}}),v=await call(f);
 assert.equal(v.status,201);assert.equal(f.calls.includes('context'),false);
 assert.equal(f.calls.includes('legacy'),true);
});
test('Stage 6 cannot run when Stage 5 ledger is not commissioned',async()=>{
 const f=fixture(),v=await call(f,{stage5:false});
 assert.equal(v.status,409);assert.deepEqual(f.calls,['inbox','get']);
});
test('forged or stale history fails before claim or AI inference',async()=>{
 for(const hist of [{...history,agentId:'finance'},
  {...history,turns:[{...history.turns[0],reply:null},history.turns[1]]},
  {...history,turns:[{...history.turns[0],messageId:id},history.turns[1]]}]){
  const f=fixture({hist}),v=await call(f);
  assert.equal(v.status,503);assert.equal(f.calls.includes('claim'),false);
  assert.equal(f.calls.includes('context'),false);
 }
});
test('persisted replay returns without another history lookup or model invocation',async()=>{
 const stored={messageId:id,agentId:'project',missionId:mid,status:'AI_DRAFT_UNVERIFIED',
 content:'An earlier grounded reply was persisted.',model:FOUNDER_AI_MODEL,evidenceRefs:[]};
 const f=fixture({stored}),v=await call(f);
 assert.equal(v.status,200);assert.equal(v.body.data.outcome,'REPLAY');
 assert.deepEqual(f.calls,['inbox','get']);
});
test('checker identity denied before a persistent store read',async()=>{
 const f=fixture(),v=await call(f,{email:'kaaviyam1519@gmail.com'});
 assert.equal(v.status,403);assert.deepEqual(f.calls,[]);
});
