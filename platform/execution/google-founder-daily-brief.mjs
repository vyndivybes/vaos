// A daily, private, read-only founder aggregate: no appointments, file names,
// OAuth tokens or business records are posted to a public Slack channel.
import {readGoogleWorkspaceBrief} from '../../apps/web/api/google-workspace.mjs';
const KEY='runtime/google-workspace/daily-brief/';
const DM='D0C7RKVTRK9';
export async function runFounderWorkspaceDigest(env,{
 now=()=>Date.now(),fetchImpl=fetch,brief=readGoogleWorkspaceBrief
}={}){
 if(env?.VAOS_GOOGLE_BRIEF_CONTROL!=='founder-daily-readonly-v1')
  return {status:'DISABLED',actionAuthorized:false};
 const d=new Date(now()),day=d.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
 const hour=Number(d.toLocaleString('en-US',{timeZone:'Asia/Kolkata',hour:'2-digit',hourCycle:'h23'}));
 if(hour!==8)return {status:'READY',actionAuthorized:false};
 if(!env.VAOS_ARTIFACTS?.put||!env.VAOS_ARTIFACTS?.get||
    typeof env.SLACK_BOT_TOKEN!=='string'||!env.SLACK_BOT_TOKEN.startsWith('xoxb-'))
 return {status:'HOLD',reason:'GOOGLE_DAILY_RUNTIME_MISSING',actionAuthorized:false};
 const key=KEY+day+'.json';
 try{if(await env.VAOS_ARTIFACTS.get(key))return {status:'READY',actionAuthorized:false}}catch{
  return {status:'HOLD',reason:'GOOGLE_DAILY_AUDIT_FAILED',actionAuthorized:false};
 }
 const r=await brief(env,{now,fetchImpl});
 if(r?.status!=='PASS'||r.actionAuthorized!==false||typeof r.answer!=='string')
  return {status:'HOLD',reason:'GOOGLE_DAILY_SOURCE_UNQUALIFIED',actionAuthorized:false};
 const base={schema:'vaos.google.daily.v1',day,actionAuthorized:false};
 try{
  const adm=await env.VAOS_ARTIFACTS.put(key,JSON.stringify({...base,state:'ADMITTED'}),{
   onlyIf:new Headers({'If-None-Match':'*'}),httpMetadata:{contentType:'application/json'}});
  if(!adm)return {status:'READY',actionAuthorized:false};
 }catch{return {status:'HOLD',reason:'GOOGLE_DAILY_AUDIT_FAILED',actionAuthorized:false}}
 try{
  const result=await fetchImpl('https://slack.com/api/chat.postMessage',{
   method:'POST',headers:{Authorization:'Bearer '+env.SLACK_BOT_TOKEN,'Content-Type':'application/json'},
   body:JSON.stringify({channel:DM,text:'VAOS founder daily Google Workspace brief (read-only):\\n'+r.answer.slice(0,1100),
    unfurl_links:false,unfurl_media:false,link_names:false}),
   redirect:'error',signal:AbortSignal.timeout(8000)
  });
  if(result.status!==200)throw Error('SLACK_DELIVERY_FAILED');
  const data=await result.json();
  if(data.ok!==true||data.channel!==DM||!/^\d+\.\d+$/.test(data.ts||''))
   throw Error('SLACK_DELIVERY_UNVERIFIED');
  await env.VAOS_ARTIFACTS.put(key,JSON.stringify({...base,state:'SENT',messageTs:data.ts}),{
   httpMetadata:{contentType:'application/json'}});
  return {status:'PASS',actionAuthorized:false};
 }catch{
  try{await env.VAOS_ARTIFACTS.put(key,JSON.stringify({...base,state:'HOLD',reason:'DELIVERY_UNCERTAIN'}),{
   httpMetadata:{contentType:'application/json'}})}catch{}
  return {status:'HOLD',reason:'GOOGLE_DAILY_DELIVERY_UNCERTAIN',actionAuthorized:false};
 }
}
