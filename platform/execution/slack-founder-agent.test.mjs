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


test('read-only commissioning classifies operational domains without authorizing writes',()=>{
 const expected={
   'what material shortages do we have?':'PROCUREMENT',
   'show inventory stock status':'INVENTORY',
   'show our production WIP':'PRODUCTION',
   'finance ledger status':'FINANCE',
   'project schedule milestones':'PROJECT',
   'engineering configuration change status':'CONFIGURATION',
   'maintenance asset status':'MAINTENANCE',
   'workforce people status':'PEOPLE',
   'executive daily business brief':'EXECUTIVE',
   'show customer sales pipeline':'COMMERCIAL',
 };
 for(const [question,route] of Object.entries(expected))assert.equal(classifyFounderSlackQuestion(question),route,question);
});
test('operational source read is verified and never discloses source records into public Slack',async()=>{
 const {readFounderBusinessDomain}=await import('./founder-business-brief.mjs');
 const calls=[];
 const secret='confidential-ledger-balance-9999';
 const result=await readFounderBusinessDomain('FINANCE',{},{
   createReader:()=>({execute:async input=>{calls.push(input);
     return {actionType:input.actionType,sourceAuthority:'getAccountingWorkbench',data:{records:[{secret}]}};}})
 });
 assert.equal(calls.length,1);
 assert.equal(calls[0].actionType,'FINANCE.OBSERVE_LEDGER');
 assert.equal(result.route,'FINANCE');
 assert.equal(result.status,'PASS');
 assert.equal(result.actionAuthorized,false);
 assert.doesNotMatch(result.answer,/confidential-ledger-balance|9999|record count/i);
 assert.match(result.answer,/read-only|read only/i);
});
test('source-authority mismatch holds and does not claim business qualification',async()=>{
 const {readFounderBusinessDomain}=await import('./founder-business-brief.mjs');
 await assert.rejects(()=>readFounderBusinessDomain('FINANCE',{},{
   createReader:()=>({execute:async input=>({actionType:input.actionType,sourceAuthority:'wrong',data:{records:[]}})})
 }),/BUSINESS_SOURCE_UNVERIFIED/);
});
test('executive brief isolates unavailable domains and never fabricates metrics',async()=>{
 const {readFounderExecutiveBrief}=await import('./founder-business-brief.mjs');
 const out=await readFounderExecutiveBrief({},{
   createReader:()=>({execute:async input=>{
     if(input.actionType==='FINANCE.OBSERVE_LEDGER')throw Error('PRIVATE_PROVIDER_ERROR_123');
     return {actionType:input.actionType,sourceAuthority:{
       'PROJECT.OBSERVE_SCHEDULE':'readGovernedProgramSchedule',
       'PROCUREMENT.OBSERVE_SHORTAGE':'getConfiguredDemandShortages',
       'PRODUCTION.OBSERVE_WIP':'getProductionJobCards',
     }[input.actionType],data:{records:[]}};
   }})
 });
 assert.equal(out.route,'EXECUTIVE');
 assert.equal(out.status,'HOLD');
 assert.equal(out.actionAuthorized,false);
 assert.match(out.answer,/FINANCE.*HOLD/);
 assert.doesNotMatch(out.answer,/PRIVATE_PROVIDER_ERROR|revenue|profit|\b0 units\b/i);
});


test('ChatGPT Slack attribution footer does not change founder greeting intent',async()=>{
 const {answerFounderSlackQuestion}=await import('./slack-founder-agent.mjs');
 const r=await answerFounderSlackQuestion('hello'+String.fromCharCode(10)+'*Sent using* <@U0C2DMN2TG8|ChatGPT>',{});
 assert.equal(r.route,'GREETING');
 assert.match(r.answer,/VAOS is online/i);
 assert.equal(r.actionAuthorized,false);
});
test('no-cost integrations are listed truthfully without provider token disclosure',async()=>{
 const {answerFounderSlackQuestion}=await import('./slack-founder-agent.mjs');
 const secret='xoxb-sensitive-test';
 const r=await answerFounderSlackQuestion('VAOS free tier status'+String.fromCharCode(10)+'*Sent using* <@U0C2DMN2TG8|ChatGPT>',{
    SLACK_BOT_TOKEN:secret,VAOS_SLACK_EVENTS_CONTROL:'founder-readonly-v1',
    VAOS_SLACK_AGENT_CONTROL:'founder-readonly-v1',
    ZAPIER_CATCH_HOOK_URL:'https://hooks.zapier.com/hooks/catch/sensitive/',
    VAOS_ARTIFACTS:{get:async()=>{}}
 });
 assert.equal(r.route,'FREE_TIER');
 assert.match(r.answer,/Slack.*enabled/i);
 assert.match(r.answer,/Zapier.*paid/i);
 assert.match(r.answer,/100 tasks/i);
 assert.doesNotMatch(r.answer,/xoxb-sensitive-test|sensitive\/|hooks\.zapier\.com/);
 assert.equal(r.actionAuthorized,false);
});
test('free-tier question does not authorize paid Zapier or write actions',async()=>{
 const {answerFounderSlackQuestion}=await import('./slack-founder-agent.mjs');
 const r=await answerFounderSlackQuestion('Which free integrations can VAOS use?',{});
 assert.equal(r.route,'FREE_TIER');
 assert.match(r.answer,/read-only/i);
 assert.match(r.answer,/not activated|not provisioned/i);
 assert.equal(r.actionAuthorized,false);
});


test('live UI footer tolerates encoded newline and attribution formatting variations',async()=>{
 const {answerFounderSlackQuestion}=await import('./slack-founder-agent.mjs');
 const forms=[
  'hello'+String.fromCharCode(10)+'*Sent using* <@U0C2DMN2TG8|ChatGPT>',
  'hello'+String.fromCharCode(92)+'n*Sent using* <@U0C2DMN2TG8|ChatGPT>',
  'hello'+String.fromCharCode(10)+'*Sent using* <@U0C2DMN2TG8|ChatGPT>'+String.fromCharCode(10)+' ',
  'hello'+String.fromCharCode(10)+'Sent using <@U0C2DMN2TG8|ChatGPT>'
 ];
 for(const text of forms){
  const r=await answerFounderSlackQuestion(text,{});
  assert.equal(r.route,'GREETING',JSON.stringify(text));
  assert.equal(r.actionAuthorized,false);
 }
});

test('founder Slack maps HR records and job-card status to responsible department, not engineering',()=>{
 const cases={
  'HR RECORDS':'PEOPLE',
  'show HR records':'PEOPLE',
  'Human resources status':'PEOPLE',
  'employee attendance':'PEOPLE',
  'staff recruitment status':'PEOPLE',
  'payroll status':'PEOPLE',
  'JOB CARD STATUS':'PRODUCTION',
  'Jobcard status':'PRODUCTION',
  'job cards pending':'PRODUCTION',
  'Show production job cards':'PRODUCTION',
  'open work orders in manufacturing':'PRODUCTION',
 };
 for(const [q,route] of Object.entries(cases))
  assert.equal(classifyFounderSlackQuestion(q),route,q);
 for(const [q,route] of Object.entries({
  'github CI status':'GITHUB_CI',
  'engineering change records':'CONFIGURATION',
  'show current inventory stock':'INVENTORY',
  'what are the carbon frame risks?':'ENGINEERING'
 }))
  assert.equal(classifyFounderSlackQuestion(q),route,q);
});

test('Slack departmental questions never fall back to engineering or expose unverified HR or jobcard data',async()=>{
 const {answerFounderSlackQuestion}=await import('./slack-founder-agent.mjs');
 for(const [question,route] of [['HR RECORDS','PEOPLE'],['JOB CARD STATUS','PRODUCTION']]){
  const result=await answerFounderSlackQuestion(question,{});
  assert.equal(result.route,route);
  assert.equal(result.actionAuthorized,false);
  assert.match(result.answer,new RegExp('VAOS '+route+' read-only observation: HOLD'));
  assert.doesNotMatch(result.answer,/qualified engineering evidence|no engineering conclusion|employee names|approved job cards/i);
 }
});
