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
      async put(k,v){map.set(k,{body:v});return null;}
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
 assert.equal(res.status,200);assert.equal(s.calls.length,0);
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
