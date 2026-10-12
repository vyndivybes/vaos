import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handleSlackEvent} from './slack-events.mjs';

const secret='slack-signing-test-only';
const founder='U0C0XHRUFGE';
const channel='C0C90LK78KA';
const now=1791763200000;
function setup(){
  const map=new Map();
  const env={
    VAOS_SLACK_EVENTS_CONTROL:'founder-readonly-v1',
    SLACK_SIGNING_SECRET:secret,SLACK_BOT_TOKEN:'xoxb-test',
    VAOS_ARTIFACTS:{
      async get(k){return map.get(k)||null;},
      async put(k,v,options){
        if(options?.onlyIf?.get('If-None-Match')==='*'&&map.has(k))return null;
        map.set(k,{body:v});return {etag:'mock-etag'};
      }
    }
  };
  const ctx={pending:[],waitUntil(p){this.pending.push(p);}};
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push({url,body:JSON.parse(init.body)});
    return new Response(JSON.stringify({ok:true,channel:JSON.parse(init.body).channel,ts:'1791763200.000045'}),{status:200});
  };
  const answerFn=async()=>({route:'INTEGRATIONS',answer:'Verified read-only integrations status.',actionAuthorized:false});
  return {env,ctx,calls,map,fetchImpl,answerFn};
}
function makeRequest(body,{key=secret,ts=String(now/1000),signature}={}){
  const raw=JSON.stringify(body);
  const sig=signature??'v0='+createHmac('sha256',key).update('v0:'+ts+':'+raw).digest('hex');
  return new Request('https://vaos.vayushastr.workers.dev/api/slack/events',{method:'POST',headers:{
    'Content-Type':'application/json','x-slack-request-timestamp':ts,'x-slack-signature':sig
  },body:raw});
}
const payload=(event,id='EvVAOS001')=>({token:'ignored',team_id:'T0C0T8YQLLT',type:'event_callback',event_id:id,event});
const dm={type:'message',user:founder,channel:'D0C0DMTEST',channel_type:'im',ts:'1791763200.000001',text:'VAOS, integration status'};
const invoke=(req,s)=>handleSlackEvent(req,s.env,s.ctx,{now:()=>now,fetchImpl:s.fetchImpl,answerFn:s.answerFn});

test('fails closed when event feature is disabled or signing secret missing',async()=>{
 const s=setup();delete s.env.SLACK_SIGNING_SECRET;
 assert.equal((await invoke(makeRequest(payload(dm)),s)).status,503);
 s.env.SLACK_SIGNING_SECRET=secret;s.env.VAOS_SLACK_EVENTS_CONTROL='disabled';
 assert.equal((await invoke(makeRequest(payload(dm)),s)).status,503);
 assert.equal(s.calls.length,0);
});
test('rejects invalid signatures and stale requests',async()=>{
 const s=setup();
 assert.equal((await invoke(makeRequest(payload(dm),{key:'wrong-key'}),s)).status,401);
 assert.equal((await invoke(makeRequest(payload(dm),{ts:String(now/1000-400)}),s)).status,401);
 assert.equal(s.calls.length,0);
});
test('only signed Slack URL verification receives challenge',async()=>{
 const s=setup();const req=makeRequest({type:'url_verification',challenge:'verification-ok'});
 const res=await invoke(req,s);assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{challenge:'verification-ok'});
 assert.equal(s.calls.length,0);
});
test('valid founder DM is processed asynchronously, records evidence, and never executes actions',async()=>{
 const s=setup();const res=await invoke(makeRequest(payload(dm)),s);
 assert.equal(res.status,200);
 await Promise.all(s.ctx.pending);
 assert.equal(s.calls.length,1);
 assert.equal(s.calls[0].body.channel,dm.channel);
 assert.equal(s.calls[0].body.thread_ts,dm.ts);
 assert.match(s.calls[0].body.text,/read-only/);
 assert.equal(JSON.parse(s.map.get('runtime/slack-events/EvVAOS001.json').body).state,'SENT');
});
test('duplicate event id does not post a second reply',async()=>{
 const s=setup();await invoke(makeRequest(payload(dm)),s);await Promise.all(s.ctx.pending);
 s.ctx.pending=[];
 const r=await invoke(makeRequest(payload(dm)),s);assert.equal(r.status,200);
 await Promise.all(s.ctx.pending);assert.equal(s.calls.length,1);
});
test('only founder DM or founder mention in allowed channel is admitted',async()=>{
 const s=setup();
 await invoke(makeRequest(payload({...dm,user:'UOTHER'},'EvVAOS002')),s);
 await invoke(makeRequest(payload({...dm,channel_type:'channel',channel:'COTHER',type:'app_mention'},'EvVAOS003')),s);
 await invoke(makeRequest(payload({...dm,subtype:'bot_message'},'EvVAOS004')),s);
 await invoke(makeRequest({...payload(dm,'EvVAOS005'),team_id:'TOTHER'}),s);
 assert.equal(s.ctx.pending.length,0);
 const mention={type:'app_mention',user:founder,channel,type:'app_mention',ts:dm.ts,text:'<@BOT> report status'};
 const resp=await invoke(makeRequest(payload(mention,'EvVAOS006')),s);
 assert.equal(resp.status,200);
 await Promise.all(s.ctx.pending);
 assert.equal(s.calls.length,1);
 assert.equal(s.calls[0].body.channel,channel);
 assert.equal(s.calls[0].body.thread_ts,dm.ts);
});
test('missing asynchronous execution context fails closed without acknowledging work',async()=>{
 const s=setup();
 const r=await handleSlackEvent(makeRequest(payload(dm)),s.env,null,{now:()=>now,fetchImpl:s.fetchImpl,answerFn:s.answerFn});
 assert.equal(r.status,503);
 assert.equal(s.map.size,0);
});
test('provider failure records HOLD and never retries',async()=>{
 const s=setup();
 s.fetchImpl=async()=>new Response(JSON.stringify({ok:false,error:'missing_scope'}),{status:200});
 const r=await invoke(makeRequest(payload(dm)),s);assert.equal(r.status,200);
 await Promise.all(s.ctx.pending);
 const evidence=JSON.parse(s.map.get('runtime/slack-events/EvVAOS001.json').body);
 assert.equal(evidence.state,'HOLD');
 assert.equal(evidence.actionAuthorized,false);
});
test('unknown Slack bot events and oversized content are ignored safely',async()=>{
 const s=setup();
 await invoke(makeRequest(payload({...dm,bot_id:'BOT123'},'EvVAOS009')),s);
 await invoke(makeRequest(payload({...dm,text:'x'.repeat(600)},'EvVAOS010')),s);
 assert.equal(s.ctx.pending.length,0);
});

test('public mentions never reveal private business source content',async()=>{
 const s=setup();s.answerFn=async()=>({answer:'CONFIDENTIAL FINANCE DATA'});
 const mention={type:'app_mention',user:founder,channel,ts:dm.ts,text:'VAOS finance status'};
 await invoke(makeRequest(payload(mention,'EvVAOS011')),s);
 await Promise.all(s.ctx.pending);
 assert.equal(s.calls.length,1);
 assert.equal(s.calls[0].body.text.includes('CONFIDENTIAL'),false);
 assert.match(s.calls[0].body.text,/direct message/);
});

test('signed URL verification works before live event control is enabled',async()=>{
 const s=setup();s.env.VAOS_SLACK_EVENTS_CONTROL='disabled';
 const challenge=await invoke(makeRequest({type:'url_verification',challenge:'url-ready'}),s);
 assert.equal(challenge.status,200);
 assert.deepEqual(await challenge.json(),{challenge:'url-ready'});
 const event=await invoke(makeRequest(payload(dm)),s);
 assert.equal(event.status,503);
 assert.equal(s.ctx.pending.length,0);
});

test('concurrent delivery of same signed event admits only one message',async()=>{
 const s=setup();
 const [a,b]=await Promise.all([
   invoke(makeRequest(payload(dm)),s),invoke(makeRequest(payload(dm)),s)
 ]);
 assert.equal(a.status,200);assert.equal(b.status,200);
 await Promise.all(s.ctx.pending);
 assert.equal(s.calls.length,1);
});


function makeUnsignedRequest(body, headers={}){
  return new Request('https://vaos.vayushastr.workers.dev/api/slack/events',{
    method:'POST',
    headers:{'content-type':'application/json',...headers},
    body:JSON.stringify(body)
  });
}
test('Slack can verify unsigned initial URL challenge without activating inbound events',async()=>{
 const s=setup();s.env.VAOS_SLACK_EVENTS_CONTROL='disabled';
 const response=await invoke(makeUnsignedRequest({
   token:'SlackInitialVerificationToken',
   challenge:'Slack-HTTP-url-verification-2026',
   type:'url_verification'
 }),s);
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{challenge:'Slack-HTTP-url-verification-2026'});
 assert.equal(s.ctx.pending.length,0);
 assert.equal(s.calls.length,0);
});
test('unsigned event callbacks and malformed challenges never bypass Slack signature validation',async()=>{
 const s=setup();
 const unauthEvent=await invoke(makeUnsignedRequest(payload(dm)),s);
 assert.equal(unauthEvent.status,401);
 const noToken=await invoke(makeUnsignedRequest({type:'url_verification',challenge:'challenge-only'}),s);
 assert.equal(noToken.status,401);
 const invalidChallenge=await invoke(makeUnsignedRequest({
   type:'url_verification',token:'token',challenge:'bad\\nchallenge'
 }),s);
 assert.equal(invalidChallenge.status,401);
 const extraEventField=await invoke(makeUnsignedRequest({
   type:'url_verification',token:'token',challenge:'challenge-ok',event:dm
 }),s);
 assert.equal(extraEventField.status,401);
 const signedButWrong=await invoke(makeRequest({type:'url_verification',token:'token',challenge:'hello'},{key:'bad-key'}),s);
 assert.equal(signedButWrong.status,401);
 assert.equal(s.ctx.pending.length,0);
 assert.equal(s.calls.length,0);
});
test('unsigned URL challenges with partial Slack signature headers cannot bypass verification',async()=>{
 const s=setup();
 for(const header of [
  {'x-slack-signature':'v0=12345'},
  {'x-slack-request-timestamp':String(now/1000)},
 ]) {
  const result=await invoke(makeUnsignedRequest({
    type:'url_verification',token:'token',challenge:'test-challenge'
  },header),s);
  assert.equal(result.status,401);
 }
});

test('signed founder DM sends one qualified synthetic Zapier webhook; unauthorized DM cannot',async()=>{
 const s=setup(),outbound=[];
 s.env.VAOS_ZAPIER_ONESHOT_CONTROL='approved-synthetic-v1';
 s.env.ZAPIER_CATCH_HOOK_URL='https://hooks.zapier.com/hooks/catch/123456/secureAbC/';
 s.fetchImpl=async(url,opts)=>{
  outbound.push({url,opts});
  if(url.startsWith('https://hooks.zapier.com/'))return new Response('accepted',{status:200});
  const body=JSON.parse(opts.body);
  return new Response(JSON.stringify({ok:true,channel:body.channel,ts:'1791763200.000045'}),{status:200});
 };
 const command={...dm,text:'VAOS Zapier synthetic verification once'};
 const unauthorized=await invoke(makeRequest(payload({...command,user:'UOTHER'},'EvVAOS099')),s);
 assert.equal(unauthorized.status,200);assert.equal(outbound.length,0);
 const channelAttempt=await invoke(makeRequest(payload({...command,type:'app_mention',channel,channel_type:'channel'},'EvVAOS100')),s);
 await Promise.all(s.ctx.pending);s.ctx.pending=[];
 assert.equal(channelAttempt.status,200);
 assert.equal(outbound.filter(x=>x.url.startsWith('https://hooks.zapier.com/')).length,0);
 const r=await invoke(makeRequest(payload(command,'EvVAOS101')),s);
 assert.equal(r.status,200);await Promise.all(s.ctx.pending);
 assert.equal(outbound.filter(x=>x.url.startsWith('https://hooks.zapier.com/')).length,1);
 const slack=outbound.filter(x=>x.url==='https://slack.com/api/chat.postMessage').at(-1);
 assert.match(JSON.parse(slack.opts.body).text,/Independent Zap History/);
 s.ctx.pending=[];
 await invoke(makeRequest(payload(command,'EvVAOS102')),s);await Promise.all(s.ctx.pending);
 assert.equal(outbound.filter(x=>x.url.startsWith('https://hooks.zapier.com/')).length,1);
});

test('one-shot command recognizes Slack ChatGPT message attribution without permitting additional instructions',async()=>{
 const s=setup(),urls=[];
 s.env.VAOS_ZAPIER_ONESHOT_CONTROL='approved-synthetic-v1';
 s.env.ZAPIER_CATCH_HOOK_URL='https://hooks.zapier.com/hooks/catch/123456/secureAbC/';
 s.fetchImpl=async(url,opts)=>{
  urls.push(url);
  if(url.startsWith('https://hooks.zapier.com/'))return new Response('accepted',{status:200});
  const b=JSON.parse(opts.body);
  return new Response(JSON.stringify({ok:true,channel:b.channel,ts:'1791763200.000077'}),{status:200});
 };
 const attributed={...dm,text:'VAOS Zapier synthetic verification once'+String.fromCharCode(10)+'*Sent using* <@U0C2DMN2TG8|ChatGPT>'};
 const r=await invoke(makeRequest(payload(attributed,'EvVAOS201')),s);
 assert.equal(r.status,200);await Promise.all(s.ctx.pending);
 assert.equal(urls.filter(x=>x.startsWith('https://hooks.zapier.com/')).length,1);
 const slack=s.map.get('qualification/zapier/slack-one-shot-20261012-round3.json');
 assert.equal(Boolean(slack),true);
});

test('Slack founder one-shot tolerates extra proprietary attribution beyond the known format',async()=>{
 const s=setup(),out=[];
 s.env.VAOS_ZAPIER_ONESHOT_CONTROL='approved-synthetic-v1';
 s.env.ZAPIER_CATCH_HOOK_URL='https://hooks.zapier.com/hooks/catch/123456/secureAbC/';
 s.fetchImpl=async(url,opts)=>{
  out.push(url);
  if(url.startsWith('https://hooks.zapier.com/'))return new Response('accepted',{status:200});
  const body=JSON.parse(opts.body);
  return new Response(JSON.stringify({ok:true,channel:body.channel,ts:'1791763200.000089'}),{status:200});
 };
 const extra={...dm,text:'VAOS Zapier synthetic verification once'+String.fromCharCode(10)+
    'Sent using ChatGPT proprietary attribution metadata https://example.invalid'};
 const r=await invoke(makeRequest(payload(extra,'EvVAOS220')),s);
 assert.equal(r.status,200);await Promise.all(s.ctx.pending);
 assert.equal(out.filter(x=>x.startsWith('https://hooks.zapier.com/')).length,1);
});
