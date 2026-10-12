import {createSessionToken,SESSION_COOKIE} from '../../apps/web/lib/auth.mjs';
import {invokeCloudflareHandler} from '../../apps/web/lib/cloudflare-adapter.mjs';
import voiceCommercial from '../../apps/web/api/voice-commercial.mjs';
import voiceEvidenceAi from '../../apps/web/api/voice-evidence-ai.mjs';

const CHANNEL='C0C90LK78KA';
const FOUNDER_SLACK_USER='U0C0XHRUFGE';
const FOUNDER_EMAIL='shyamsundhar1982@gmail.com';
const ORIGIN='https://vaos.vayushastr.workers.dev';
const CURSOR='runtime/slack-agent/last-ts.json';
const MAX_MESSAGES=3;

function cleanText(value){
  if(typeof value!=='string')return null;
  const text=value.replace(/<@[A-Z0-9]+>/g,'').replace(/\s+/g,' ').trim();
  if(text.length<1||text.length>500||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))return null;
  return text;
}
export function classifyFounderSlackQuestion(text){
  const q=text.toLowerCase();
  if(/^(hi|hello|hey|good morning|good evening|good afternoon)[!. ]*$/.test(q))return 'GREETING';
  if(/\b(sales|revenue|orders?|customers?|pipeline|quotation|invoice|receivable)\b/.test(q))return 'COMMERCIAL';
  if(/\b(integration|slack|windmill|activepieces|dify|stirling|zapier|langgraph|provider)\b/.test(q))return 'INTEGRATIONS';
  return 'ENGINEERING';
}
function integrationStatus(env){
  const items=[
    ['Slack',typeof env.SLACK_BOT_TOKEN==='string'],
    ['Windmill',typeof env.WINDMILL_BASE_URL==='string'&&Boolean(env.WINDMILL_ADMISSION)],
    ['Activepieces',Boolean(env.ACTIVEPIECES_HANDSHAKE)],
    ['Dify',typeof env.DIFY_API_KEY==='string'],
    ['Stirling',typeof env.STIRLING_API_BASE==='string'],
    ['Zapier',typeof env.ZAPIER_CATCH_HOOK_URL==='string'],
    ['LangGraph',env.VAOS_LANGGRAPH_CONTROL==='read-only-v1'],
  ];
  return 'VAOS integration bindings: '+items.map(([n,on])=>n+' '+(on?'connected':'not connected')).join('; ')+
    '. Connected does not imply write authorization; governed execution controls remain in force.';
}
function sessionCookie(){
  return SESSION_COOKIE+'='+createSessionToken(FOUNDER_EMAIL,300);
}
async function internalJson(handler,{method='GET',body}={},env){
  const headers={'Cookie':sessionCookie()};
  if(body!==undefined){headers['Content-Type']='application/json';headers['Origin']=ORIGIN;}
  const request=new Request(ORIGIN+'/internal',{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const response=await invokeCloudflareHandler(handler,request,env);
  let payload=null;try{payload=await response.json()}catch{}
  return {status:response.status,payload};
}
export async function answerFounderSlackQuestion(text,env){
  const q=cleanText(text);if(!q)throw new Error('SLACK_QUESTION_INVALID');
  const route=classifyFounderSlackQuestion(q);
  if(route==='GREETING')return {route,answer:'VAOS is online. Ask me about sales status, engineering risks, project evidence, or integration status. Read-only governance remains active.',actionAuthorized:false};
  if(route==='INTEGRATIONS')return {route,answer:integrationStatus(env),actionAuthorized:false};
  if(route==='COMMERCIAL'){
    const r=await internalJson(voiceCommercial,{},env);
    if(r.status!==200||typeof r.payload?.data?.answer!=='string')return {route,answer:'I could not verify the VYNDI OS commercial read at this time. I will not infer sales figures.',actionAuthorized:false};
    return {route,answer:r.payload.data.answer,actionAuthorized:false};
  }
  const r=await internalJson(voiceEvidenceAi,{method:'POST',body:{question:q.slice(0,119)}},env);
  if(r.status===200&&typeof r.payload?.data?.answer==='string'){
    const n=Array.isArray(r.payload.data.sources)?r.payload.data.sources.length:0;
    return {route,answer:r.payload.data.answer+(n?' Sources linked: '+n+'.':''),actionAuthorized:false};
  }
  return {route,answer:'I could not obtain qualified engineering evidence for that question. No engineering conclusion or action has been authorized.',actionAuthorized:false};
}
async function slackApi(env,method,payload,fetchImpl){
  if(typeof env.SLACK_BOT_TOKEN!=='string'||!env.SLACK_BOT_TOKEN.startsWith('xoxb-'))throw new Error('SLACK_TOKEN_UNAVAILABLE');
  const post=method==='chat.postMessage';
  const url='https://slack.com/api/'+method+(post?'':'?'+new URLSearchParams(payload).toString());
  const r=await fetchImpl(url,{method:post?'POST':'GET',headers:{Authorization:'Bearer '+env.SLACK_BOT_TOKEN,...(post?{'Content-Type':'application/json'}:{})},body:post?JSON.stringify(payload):undefined,redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw new Error('SLACK_HTTP_FAILED');
  const data=await r.json();if(data?.ok!==true){
    const safe={missing_scope:'SLACK_SCOPE_MISSING',not_in_channel:'SLACK_NOT_IN_CHANNEL',channel_not_found:'SLACK_CHANNEL_NOT_FOUND',invalid_auth:'SLACK_AUTH_INVALID',account_inactive:'SLACK_AUTH_INACTIVE'};
    throw new Error(safe[data?.error]||'SLACK_API_FAILED');
  }
  return data;
}
export async function probeSlackFounderAgent({env,fetchImpl=fetch}={}){
  if(env?.VAOS_SLACK_AGENT_CONTROL!=='founder-readonly-v1')return {status:'DISABLED',readable:false,founderVisible:false,actionAuthorized:false};
  try{
    const history=await slackApi(env,'conversations.history',{channel:CHANNEL,limit:'20'},fetchImpl);
    const founderVisible=(Array.isArray(history.messages)?history.messages:[]).some(m=>m?.type==='message'&&!m.subtype&&m.user===FOUNDER_SLACK_USER);
    return {status:'PASS',readable:true,founderVisible,actionAuthorized:false};
  }catch(error){
    const reason=typeof error?.message==='string'&&/^SLACK_[A-Z_]+$/.test(error.message)?error.message:'SLACK_AGENT_UNAVAILABLE';
    return {status:'HOLD',readable:false,founderVisible:false,reason,actionAuthorized:false};
  }
}
async function getCursor(env){
  try{const obj=await env.VAOS_ARTIFACTS.get(CURSOR);if(!obj)return null;const data=JSON.parse(await obj.text());return /^\d+\.\d+$/.test(data?.lastTs||'')?data.lastTs:null;}catch{return null}
}
async function setCursor(env,lastTs){
  await env.VAOS_ARTIFACTS.put(CURSOR,JSON.stringify({lastTs,updatedAt:new Date().toISOString()}),{httpMetadata:{contentType:'application/json'}});
}
export async function runSlackFounderAgent({env,fetchImpl=fetch,bootstrapLatest=true,answerFn=answerFounderSlackQuestion}={}){
  if(env?.VAOS_SLACK_AGENT_CONTROL!=='founder-readonly-v1')return {status:'DISABLED',processed:0};
  if(!env?.VAOS_ARTIFACTS?.get||!env?.VAOS_ARTIFACTS?.put)throw new Error('SLACK_CURSOR_STORE_UNAVAILABLE');
  const last=await getCursor(env);
  const history=await slackApi(env,'conversations.history',{channel:CHANNEL,limit:'20',...(last?{oldest:last}:{})},fetchImpl);
  const all=(Array.isArray(history.messages)?history.messages:[])
    .filter(m=>m?.type==='message'&&!m.subtype&&m.user===FOUNDER_SLACK_USER&&/^\d+\.\d+$/.test(m.ts||'')&&cleanText(m.text))
    .sort((a,b)=>Number(a.ts)-Number(b.ts));
  if(!last&&bootstrapLatest){
    const latest=all.at(-1);
    if(!latest)return {status:'READY',processed:0,initialized:true};
    const result=await answerFn(latest.text,env);
    await slackApi(env,'chat.postMessage',{channel:CHANNEL,thread_ts:latest.ts,text:result.answer,unfurl_links:false,unfurl_media:false},fetchImpl);
    await setCursor(env,latest.ts);
    return {status:'PASS',processed:1,initialized:true,route:result.route,actionAuthorized:false};
  }
  const queue=all.slice(0,MAX_MESSAGES);let processed=0;let cursor=last;
  for(const msg of queue){
    const result=await answerFn(msg.text,env);
    await slackApi(env,'chat.postMessage',{channel:CHANNEL,thread_ts:msg.ts,text:result.answer,unfurl_links:false,unfurl_media:false},fetchImpl);
    cursor=msg.ts;processed++;
  }
  if(cursor&&cursor!==last)await setCursor(env,cursor);
  return {status:'PASS',processed,initialized:false,actionAuthorized:false};
}
export const SLACK_AGENT_CHANNEL=CHANNEL;
export const SLACK_AGENT_FOUNDER=FOUNDER_SLACK_USER;
