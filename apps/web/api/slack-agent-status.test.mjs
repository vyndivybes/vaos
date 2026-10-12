import test from 'node:test';import assert from 'node:assert/strict';
import {probeSlackFounderAgent} from '../../../platform/execution/slack-founder-agent.mjs';
import slackAgentStatus from './slack-agent-status.mjs';

function fetcher(payload){
 return async()=>new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
}
test('probe exposes only readiness booleans and founder visibility',async()=>{
 const env={VAOS_SLACK_AGENT_CONTROL:'founder-readonly-v1',SLACK_BOT_TOKEN:'xoxb-test'};
 const result=await probeSlackFounderAgent({env,fetchImpl:fetcher({ok:true,messages:[{type:'message',user:'U0C0XHRUFGE',text:'hi'}]})});
 assert.deepEqual(result,{status:'PASS',readable:true,founderVisible:true,actionAuthorized:false});
});
test('missing Slack history scope is safely classified',async()=>{
 const env={VAOS_SLACK_AGENT_CONTROL:'founder-readonly-v1',SLACK_BOT_TOKEN:'xoxb-test'};
 const result=await probeSlackFounderAgent({env,fetchImpl:fetcher({ok:false,error:'missing_scope'})});
 assert.equal(result.status,'HOLD');assert.equal(result.reason,'SLACK_SCOPE_MISSING');
});
test('public status endpoint returns no message content or credentials',async()=>{
 const req={method:'GET',env:{VAOS_SLACK_AGENT_CONTROL:'founder-readonly-v1',SLACK_BOT_TOKEN:'xoxb-test'}};
 const original=globalThis.fetch;
 globalThis.fetch=fetcher({ok:true,messages:[{type:'message',user:'U0C0XHRUFGE',text:'secret-looking user text'}]});
 try{
  const response=await slackAgentStatus(req);const body=await response.json();const text=JSON.stringify(body);
  assert.equal(response.status,200);assert.equal(body.founderVisible,true);
  assert.equal(text.includes('secret-looking'),false);assert.equal(text.includes('xoxb-'),false);
 }finally{globalThis.fetch=original}
});

test('status endpoint reports HOLD as HTTP 200 without leaking provider data',async()=>{
 const req={method:'GET',env:{VAOS_SLACK_AGENT_CONTROL:'founder-readonly-v1',SLACK_BOT_TOKEN:'xoxb-test'}};
 const original=globalThis.fetch;globalThis.fetch=fetcher({ok:false,error:'missing_scope'});
 try{const response=await slackAgentStatus(req);const body=await response.json();assert.equal(response.status,200);assert.equal(body.status,'HOLD');assert.equal(body.reason,'SLACK_SCOPE_MISSING');}finally{globalThis.fetch=original}
});
