import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyFounderSlackQuestion,runSlackFounderAgent,SLACK_AGENT_CHANNEL,SLACK_AGENT_FOUNDER} from './slack-founder-agent.mjs';

function r2(){
  const m=new Map();
  return {
    async get(k){const v=m.get(k);return v==null?null:{text:async()=>v};},
    async put(k,v){m.set(k,v);},
    _m:m,
  };
}
function slackFetch(messages,posted){
 return async(url,opts={})=>{
   if(url.startsWith('https://slack.com/api/conversations.history')){
     return new Response(JSON.stringify({ok:true,messages}),{status:200,headers:{'content-type':'application/json'}});
   }
   if(url==='https://slack.com/api/chat.postMessage'){
     const body=JSON.parse(opts.body);posted.push(body);
     return new Response(JSON.stringify({ok:true,channel:body.channel,ts:'999.0001'}),{status:200,headers:{'content-type':'application/json'}});
   }
   throw new Error('unexpected '+url);
 };
}
test('classifier routes greetings, commercial, integration and engineering questions',()=>{
 assert.equal(classifyFounderSlackQuestion('hi'),'GREETING');
 assert.equal(classifyFounderSlackQuestion('what is our sales status?'),'COMMERCIAL');
 assert.equal(classifyFounderSlackQuestion('integration status'),'INTEGRATIONS');
 assert.equal(classifyFounderSlackQuestion('what are the carbon frame risks?'),'ENGINEERING');
});
test('first commissioning run reads only founder Slack identity and replies once in thread',async()=>{
 const posted=[];const store=r2();
 const env={VAOS_SLACK_AGENT_CONTROL:'founder-readonly-v1',SLACK_BOT_TOKEN:'xoxb-test',VAOS_ARTIFACTS:store};
 const messages=[
  {type:'message',user:'UOTHER',ts:'101.0001',text:'hi'},
  {type:'message',user:SLACK_AGENT_FOUNDER,ts:'102.0001',text:'hi'},
 ];
 const out=await runSlackFounderAgent({env,fetchImpl:slackFetch(messages,posted),answerFn:async()=>({route:'GREETING',answer:'VAOS online.',actionAuthorized:false})});
 assert.equal(out.status,'PASS');assert.equal(out.processed,1);assert.equal(posted.length,1);
 assert.equal(posted[0].channel,SLACK_AGENT_CHANNEL);assert.equal(posted[0].thread_ts,'102.0001');
 assert.equal(posted[0].text,'VAOS online.');assert.equal(out.actionAuthorized,false);
});
test('cursor prevents replay and processes only newer founder messages',async()=>{
 const posted=[];const store=r2();
 await store.put('runtime/slack-agent/last-ts.json',JSON.stringify({lastTs:'102.0001'}));
 const env={VAOS_SLACK_AGENT_CONTROL:'founder-readonly-v1',SLACK_BOT_TOKEN:'xoxb-test',VAOS_ARTIFACTS:store};
 const messages=[{type:'message',user:SLACK_AGENT_FOUNDER,ts:'103.0001',text:'integration status'}];
 const out=await runSlackFounderAgent({env,fetchImpl:slackFetch(messages,posted),answerFn:async()=>({route:'INTEGRATIONS',answer:'status',actionAuthorized:false})});
 assert.equal(out.processed,1);assert.equal(posted.length,1);
 const cursor=JSON.parse(store._m.get('runtime/slack-agent/last-ts.json'));assert.equal(cursor.lastTs,'103.0001');
});
test('control flag fails closed without Slack calls',async()=>{
 let calls=0;const env={VAOS_SLACK_AGENT_CONTROL:'off',SLACK_BOT_TOKEN:'xoxb-test',VAOS_ARTIFACTS:r2()};
 const out=await runSlackFounderAgent({env,fetchImpl:async()=>{calls++;}});
 assert.equal(out.status,'DISABLED');assert.equal(calls,0);
});

test('Slack provider fetch uses Workers-compatible manual redirect policy',async()=>{
 const env={VAOS_SLACK_AGENT_CONTROL:'founder-readonly-v1',SLACK_BOT_TOKEN:'xoxb-test'};let redirect;
 const result=await (await import('./slack-founder-agent.mjs')).probeSlackFounderAgent({env,fetchImpl:async(_url,opts)=>{redirect=opts.redirect;return new Response(JSON.stringify({ok:true,messages:[]}),{status:200,headers:{'content-type':'application/json'}});}});
 assert.equal(redirect,'manual');assert.equal(result.status,'PASS');
});
