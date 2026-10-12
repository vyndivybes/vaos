// incident.io --> Slack #incidents --> VAOS governed read-only observation.
// Never executes, relays or interprets incident Slack message text as commands.
const INCIDENT_CHANNEL='C0C91HKG8TA';
const OPS_CHANNEL='C0C90LK78KA';
const INCIDENT_BOT='U0C894NQVG9';
const CURSOR='runtime/slack-incident/cursor.json';
const PREFIX='runtime/slack-incident/announcements/';
const unverified=(reason='INCIDENT_SOURCE_UNVERIFIED')=>({status:'HOLD',reason,actionAuthorized:false,answer:'VAOS incident feed: HOLD ('+reason+'). The read-only Slack incident channel could not be qualified.'});
async function fetchRecent(env,fetchImpl){
 const token=env?.SLACK_BOT_TOKEN;
 if(typeof token!=='string'||!token.startsWith('xoxb-'))throw Error('SLACK_TOKEN_UNAVAILABLE');
 const url='https://slack.com/api/conversations.history?channel='+INCIDENT_CHANNEL+'&limit=30';
 const r=await fetchImpl(url,{method:'GET',headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(8000)});
 if(r.status!==200)throw Error('SLACK_HISTORY_FAILED');
 const p=await r.json();
 if(p?.ok!==true){
   const errors={missing_scope:'INCIDENT_SLACK_SCOPE_MISSING',
     not_in_channel:'INCIDENT_SLACK_MEMBERSHIP_MISSING',
     channel_not_found:'INCIDENT_SLACK_CHANNEL_NOT_FOUND',
     invalid_auth:'INCIDENT_SLACK_AUTH_INVALID',
     token_revoked:'INCIDENT_SLACK_AUTH_INVALID'};
   throw Error(errors[p?.error]||'INCIDENT_SLACK_API_FAILED');
 }
 if(!Array.isArray(p.messages))throw Error('INCIDENT_HISTORY_INVALID');
 return p.messages.filter(x=>x?.type==='message'&&x?.user===INCIDENT_BOT&&
  !x?.subtype&&/^\d{10,12}\.\d+$/.test(x?.ts||'')).slice(0,30);
}
export async function readSlackIncidentStatus(env,{fetchImpl=fetch}={}){
 try{
  const messages=await fetchRecent(env,fetchImpl);
  return {status:'PASS',announcements:messages.length,actionAuthorized:false,
   answer:'VAOS incident.io Slack feed: '+messages.length+
     ' recent allowlisted announcements visible in #incidents. This is a message-read verification, not proof of current open incidents or incident.io API access.'};
 }catch(error){const code=typeof error?.message==='string'&&/^INCIDENT_[A-Z_]+$/.test(error.message)?error.message:'INCIDENT_SOURCE_UNVERIFIED';return unverified(code);}
}
async function put(store,key,entry,more={}){
 return store.put(key,JSON.stringify(entry),{...more,httpMetadata:{contentType:'application/json'}});
}
export async function runHourlyIncidentAlerts(env,{fetchImpl=fetch,postImpl=fetch,now=()=>Date.now()}={}){
 if(env?.VAOS_INCIDENT_SLACK_CONTROL!=='read-only-v1')return {status:'DISABLED',alerted:0,actionAuthorized:false};
 const store=env?.VAOS_ARTIFACTS;
 if(!store?.get||!store?.put)return {status:'HOLD',alerted:0,reason:'INCIDENT_AUDIT_UNAVAILABLE',actionAuthorized:false};
 let messages;try{messages=await fetchRecent(env,fetchImpl)}catch{return {status:'HOLD',alerted:0,reason:'INCIDENT_SOURCE_UNVERIFIED',actionAuthorized:false}}
 let previous;try{previous=await store.get(CURSOR)}catch{return {status:'HOLD',alerted:0,reason:'INCIDENT_CURSOR_UNAVAILABLE',actionAuthorized:false}}
 const latest=messages.map(x=>x.ts);
 if(!previous){
  try{await put(store,CURSOR,{schema:'vaos.incident-watch.v1',seen:latest,at:new Date(now()).toISOString()})}
  catch{return {status:'HOLD',alerted:0,reason:'INCIDENT_BOOTSTRAP_FAILED',actionAuthorized:false}}
  return {status:'READY',alerted:0,actionAuthorized:false};
 }
 let cursor;try{cursor=JSON.parse(await previous.text());if(!Array.isArray(cursor.seen))throw Error('bad cursor')}
 catch{return {status:'HOLD',alerted:0,reason:'INCIDENT_CURSOR_INVALID',actionAuthorized:false}}
 const known=new Set(cursor.seen.filter(x=>typeof x==='string'&&/^\d+\.\d+$/.test(x)));
 let alerted=0,held=false;
 for(const msg of messages.filter(m=>!known.has(m.ts)).slice(0,2).reverse()){
  const id=msg.ts.replace('.','-'),key=PREFIX+id+'.json';
  const audit={schema:'vaos.slack.incident-alert.v1',messageTs:msg.ts,state:'ADMITTED',actionAuthorized:false};
  try{
   const admitted=await put(store,key,audit,{onlyIf:new Headers({'If-None-Match':'*'})});
   if(admitted===null){known.add(msg.ts);continue}
  }catch{held=true;break}
  try{
   const body={channel:OPS_CHANNEL,text:'[VAOS] WARNING · incident.io announcement\nA new incident.io announcement was published in #incidents. Review the incident channel and follow the governed response process. No incident action, approval, or production change has been authorized.',
     unfurl_links:false,unfurl_media:false,link_names:false};
   const resp=await postImpl('https://slack.com/api/chat.postMessage',{
    method:'POST',headers:{Authorization:'Bearer '+env.SLACK_BOT_TOKEN,'Content-Type':'application/json'},
    body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(8000)
   });
   if(resp.status!==200)throw Error('SLACK_POST_FAILURE');
   const receipt=await resp.json();
   if(receipt?.ok!==true||receipt.channel!==OPS_CHANNEL||!/^\d+\.\d+$/.test(receipt.ts||''))throw Error('SLACK_DELIVERY_UNKNOWN');
   await put(store,key,{...audit,state:'SENT',replyTs:receipt.ts,at:new Date(now()).toISOString()});alerted++;
  }catch{
   held=true;
   try{await put(store,key,{...audit,state:'HOLD',reason:'DELIVERY_UNCERTAIN',at:new Date(now()).toISOString()})}catch{}
  }
  known.add(msg.ts);
 }
 try{await put(store,CURSOR,{schema:'vaos.incident-watch.v1',seen:[...new Set([...known,...latest])].slice(-100),at:new Date(now()).toISOString()})}
 catch{return {status:'HOLD',alerted,reason:'INCIDENT_CURSOR_WRITE_FAILED',actionAuthorized:false}}
 return {status:held?'HOLD':'PASS',alerted,actionAuthorized:false};
}
