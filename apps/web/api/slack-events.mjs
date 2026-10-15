import {runZapierOneShot} from '../../../platform/execution/zapier-slack-one-shot.mjs';
// Signed Slack Events API ingress. Only founder read-only observations are permitted.
// Subscription configuration and production enablement are separate live approval gates.
import {answerFounderSlackQuestion} from '../../../platform/execution/slack-founder-agent.mjs';
import {saveFounderSlackContext} from '../../../platform/execution/slack-founder-operations.mjs';

const TEAM='T0C0T8YQLLT';
const FOUNDER='U0C0XHRUFGE';
const OPERATIONS='C0C90LK78KA';
const MAX_BODY=8192;
const MAX_AGE_SECONDS=300;
const EVIDENCE_PREFIX='runtime/slack-events/';
const response=(status,obj)=>new Response(JSON.stringify(obj),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff'
}});
function constantTimeMatch(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
async function verifiedBody(request,secret,now){
  // Slack URL verification can arrive without HMAC headers, depending on
  // the app/provisioning path. It is never permission to process events.
  const ts=request.headers.get('x-slack-request-timestamp');
  const sig=request.headers.get('x-slack-signature');
  const hasSignatureHeaders=ts!==null||sig!==null;
  if(Number(request.headers.get('content-length')||0)>MAX_BODY)return null;
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_BODY)return null;

  if(!hasSignatureHeaders){
    // The ONLY unsigned allowance: documented initial verification handshake.
    // Never admit an event_callback, message, app_mention or any side effects.
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||'')||raw.length>1024)
      return null;
    try{
      const payload=JSON.parse(raw);
      if(!payload||typeof payload!=='object'||Array.isArray(payload))return null;
      if(Object.keys(payload).sort().join(',')!=='challenge,token,type')return null;
      if(payload.type!=='url_verification')return null;
      if(typeof payload.token!=='string'||!/^[-_a-zA-Z0-9]{4,256}$/.test(payload.token))return null;
      if(typeof payload.challenge!=='string'||!/^[-_.a-zA-Z0-9]{1,256}$/.test(payload.challenge))return null;
      return payload;
    }catch{return null}
  }

  // Every signed request, and every real event, must pass standard Slack HMAC.
  // Malformed or partial signature headers never fall through to the challenge.
  if(!/^\d{10,11}$/.test(ts||'')||!/^v0=[a-f0-9]{64}$/.test(sig||''))return null;
  if(Math.abs(Math.floor(now()/1000)-Number(ts))>MAX_AGE_SECONDS)return null;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const hash=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('v0:'+ts+':'+raw));
  const expected='v0='+Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
  if(!constantTimeMatch(sig,expected))return null;
  try{return JSON.parse(raw)}catch{return null}
}
function admittedEvent(body){
  if(body?.type!=='event_callback'||body?.team_id!==TEAM)return null;
  if(!/^Ev[A-Za-z0-9_-]{4,80}$/.test(body.event_id||''))return null;
  const e=body.event;
  if(!e||e.user!==FOUNDER||e.bot_id||e.subtype||e.hidden)return null;
  if(!/^\d+\.\d+$/.test(e.ts||''))return null;
  if(typeof e.text!=='string'||!e.text.trim()||e.text.length>500)return null;
  if(e.type==='message'&&e.channel_type==='im'&&/^D[A-Z0-9]+$/.test(e.channel||''))
    return {eventId:body.event_id,channel:e.channel,threadTs:e.thread_ts||e.ts,text:e.text,kind:'dm'};
  if(e.type==='app_mention'&&e.channel===OPERATIONS)
    return {eventId:body.event_id,channel:OPERATIONS,threadTs:e.thread_ts||e.ts,text:e.text,kind:'mention'};
  return null;
}
async function slackPost(env,entry,text,fetchImpl){
  const body={channel:entry.channel,thread_ts:entry.threadTs,text:text.slice(0,2500),
    unfurl_links:false,unfurl_media:false,link_names:false};
  const result=await fetchImpl('https://slack.com/api/chat.postMessage',{
    method:'POST',headers:{'Authorization':'Bearer '+env.SLACK_BOT_TOKEN,
      'Content-Type':'application/json'},body:JSON.stringify(body),
    redirect:'manual',signal:AbortSignal.timeout(8000)
  });
  if(!result.ok||result.status!==200)throw Error('SLACK_DELIVERY_FAILED');
  const data=await result.json();
  if(data.ok!==true||data.channel!==entry.channel||!/^\d+\.\d+$/.test(data.ts||''))
    throw Error('SLACK_DELIVERY_UNVERIFIED');
  return data.ts;
}
async function processEvent(entry,env,{answerFn,fetchImpl,now}){
  const key=EVIDENCE_PREFIX+entry.eventId+'.json';
  const base={schemaVersion:'vaos.slack.inbound.v1',eventId:entry.eventId,
    kind:entry.kind,actionAuthorized:false};
  try{
    // Public channel never discloses read-side business evidence.
    const result=entry.kind==='mention'
      ? {answer:'VAOS founder channel ingress is active. Use my direct message for private read-only business questions.'}
      : entry.kind==='dm' && entry.text.trim().toLowerCase().startsWith('vaos zapier synthetic verification once')
        ? {answer:(await runZapierOneShot(env,{send:fetchImpl,now}))?.answer}
        : await answerFn(entry.text,env,{kind:entry.kind,channel:entry.channel,
           eventId:entry.eventId,threadTs:entry.threadTs});
    const answer=result?.answer;
    if(typeof answer!=='string'||!answer.trim())throw Error('SLACK_ANSWER_UNAVAILABLE');
    const ts=await slackPost(env,entry,answer,fetchImpl);
    if(entry.kind==='dm'&&result?.contextToSave){
      await saveFounderSlackContext(env,{kind:'dm',channel:entry.channel},
       {...result.contextToSave,at:now()});
    }
    await env.VAOS_ARTIFACTS.put(key,JSON.stringify({...base,state:'SENT',replyTs:ts,
      processedAt:new Date(now()).toISOString()}),{httpMetadata:{contentType:'application/json'}});
  }catch{
    // Unknown provider delivery outcomes are HOLD, never blindly retried.
    try{await env.VAOS_ARTIFACTS.put(key,JSON.stringify({...base,state:'HOLD',
      reason:'SLACK_REPLY_NOT_QUALIFIED',processedAt:new Date(now()).toISOString()}),
      {httpMetadata:{contentType:'application/json'}});}catch{}
  }
}
export async function handleSlackEvent(request,env,ctx,{
  now=()=>Date.now(),fetchImpl=fetch,answerFn=answerFounderSlackQuestion
}={}){
  if(request.method!=='POST')return response(405,{error:'METHOD_NOT_ALLOWED'});
  // A configured encrypted binding is authoritative; never downgrade when malformed.
  // Legacy plaintext is a temporary migration fallback only.
  const signingSecret=env?.VAOS_SLACK_SIGNING_SECRET_SECURE!==undefined
    ? env.VAOS_SLACK_SIGNING_SECRET_SECURE : env?.SLACK_SIGNING_SECRET;
  if(typeof signingSecret!=='string'||signingSecret.length<8)
    return response(503,{status:'HOLD',reason:'SLACK_EVENTS_NOT_COMMISSIONED'});
  let body;
  try{body=await verifiedBody(request,signingSecret,now)}
  catch{return response(401,{error:'SIGNATURE_INVALID'})}
  if(!body)return response(401,{error:'SIGNATURE_INVALID'});
  if(body.type==='url_verification'){
    if(typeof body.challenge!=='string'||body.challenge.length>256)
      return response(400,{error:'CHALLENGE_INVALID'});
    return response(200,{challenge:body.challenge});
  }
  if(env.VAOS_SLACK_EVENTS_CONTROL!=='founder-readonly-v1')
    return response(503,{status:'HOLD',reason:'SLACK_EVENTS_NOT_COMMISSIONED'});
  const entry=admittedEvent(body);
  if(!entry)return response(200,{ok:true,ignored:true});
  if(typeof env.SLACK_BOT_TOKEN!=='string'||!env.SLACK_BOT_TOKEN.startsWith('xoxb-')||
    !env.VAOS_ARTIFACTS?.get||!env.VAOS_ARTIFACTS?.put||
    !ctx||typeof ctx.waitUntil!=='function')
    return response(503,{status:'HOLD',reason:'SLACK_RUNTIME_NOT_READY'});
  const key=EVIDENCE_PREFIX+entry.eventId+'.json';
  try{
    // Cloudflare R2 conditional create uses If-None-Match:* to admit exactly one
    // concurrent delivery of an event ID; null means a matching admission exists.
    const admitted=await env.VAOS_ARTIFACTS.put(key,JSON.stringify({
      schemaVersion:'vaos.slack.inbound.v1',eventId:entry.eventId,kind:entry.kind,
      state:'ACCEPTED',actionAuthorized:false,acceptedAt:new Date(now()).toISOString()
    }),{onlyIf:new Headers({'If-None-Match':'*'}),
      httpMetadata:{contentType:'application/json'}});
    if(admitted===null)return response(200,{ok:true,duplicate:true});
  }catch{return response(503,{status:'HOLD',reason:'SLACK_EVIDENCE_UNAVAILABLE'})}
  ctx.waitUntil(Promise.resolve().then(()=>processEvent(entry,env,{now,fetchImpl,answerFn})));
  return response(200,{ok:true,accepted:true});
}
