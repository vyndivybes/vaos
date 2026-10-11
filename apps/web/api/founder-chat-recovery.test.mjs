import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createFounderChatHandler} from './founder-chat.mjs';
import {FOUNDER_AI_MODEL} from '../lib/founder-ai-draft.mjs';

const id='00000000-0000-4000-8000-000000000175',missionId='MISSION-0001',agentId='project';
const record={messageId:id,recipientAgentId:agentId,kind:'REPORT_REQUEST',
 status:'RECORDED_NOT_ROUTED',instruction:'Provide evidence report for MISSION-0001'};
const persisted={messageId:id,agentId,missionId,status:'AI_DRAFT_UNVERIFIED',
 model:FOUNDER_AI_MODEL,content:'Independently stored read-only evidence report.',evidenceRefs:[]};
const flags={VAOS_FOUNDER_INBOX_CONTROL:'record-only-v1',
 VAOS_FOUNDER_AGENT_REPORT_CONTROL:'preview-only-v1',
 VAOS_FOUNDER_CHAT_CONTROL:'qualified-readonly-v1'};
function request(){return {method:'POST',url:'https://vaos.example/api/founder-chat',
 headers:{cookie:SESSION_COOKIE+'='+createSessionToken('shyamsundhar1982@gmail.com'),
  origin:'https://vaos.example','content-type':'application/json'},env:flags,
 body:{operation:'GENERATE_READONLY_DRAFT',agentId,messageId:id,missionId}};}
function output(){const result={status:200,body:null},res={
 setHeader(){return res},status(n){result.status=n;return res},
 json(x){result.body=x;return res}};return {result,res};}
function fixture({lateReply=null,readbackFails=false,claim='ALREADY_CLAIMED'}={}){
 const calls=[],handler=createFounderChatHandler({
 getInbox:()=>({async list(){calls.push('inbox');return {messages:[record]}}}),
 getReplies:()=>({async get(){calls.push('get');
   if(calls.filter(x=>x==='get').length===2&&readbackFails)throw Error('backend');
   return {reply:calls.filter(x=>x==='get').length===2?lateReply:null};
  },async claim(){calls.push('claim');return {outcome:claim}},
  async append(){calls.push('append');throw Error('SHOULD_NOT_APPEND');}}),
 getMission:()=>({async snapshot(){calls.push('mission');return {
  mission:{id:missionId,status:'READY_FOR_CLOSURE'},workPackages:[],handoffs:[]}}}),
 runAi:async()=>{calls.push('model');throw Error('SHOULD_NOT_INFER');}
 });return {calls,handler};}
async function invoke(f){const out=output();await f.handler(request(),out.res);return out.result;}
test('Stage 8 duplicate claim reconciles a concurrently persisted reply without new AI',async()=>{
 const f=fixture({lateReply:persisted}),out=await invoke(f);
 assert.equal(out.status,200);
 assert.equal(out.body.data.outcome,'REPLAY');
 assert.equal(out.body.data.modelInvoked,false);
 assert.equal(out.body.data.actionAuthorized,false);
 assert.deepEqual(f.calls,['inbox','get','mission','claim','get']);
});
test('Stage 8 unresolved claim remains held without retry or synthetic reply',async()=>{
 const f=fixture(),out=await invoke(f);
 assert.equal(out.status,409);
 assert.equal(out.body.error.code,'FOUNDER_CHAT_CLAIMED_NO_REPLY');
 assert.deepEqual(f.calls,['inbox','get','mission','claim','get']);
});
test('Stage 8 unreadable claim readback fails closed',async()=>{
 const f=fixture({readbackFails:true}),out=await invoke(f);
 assert.equal(out.status,503);
 assert.equal(out.body.error.code,'FOUNDER_CHAT_READBACK_UNAVAILABLE');
 assert.deepEqual(f.calls,['inbox','get','mission','claim','get']);
});
