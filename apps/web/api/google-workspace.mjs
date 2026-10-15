// Founder-scoped Google Calendar OAuth, disabled without
// hardened founder authentication, dedicated Google client and AES-256-GCM vault.
// OAuth tokens never enter Slack, GitHub, URLs, logs or public response bodies.
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';

const ORIGIN='https://vaos.vayushastr.workers.dev';
const FOUNDER='shyamsundhar1982@gmail.com';
const PREFIX='runtime/google-workspace/';
const RECORD=PREFIX+'founder-token.v1.json';
const PENDING=PREFIX+'oauth-pending/';
const SCOPES=Object.freeze([
 'openid','email',
 'https://www.googleapis.com/auth/calendar.events'
]);
// Request only the Calendar permission configured for VAOS; Gmail and Drive
// require separate explicit integrations and are not part of Calendar consent.
const EXTENDED_SCOPES=SCOPES;
const AAD=new TextEncoder().encode('vaos:google-workspace:founder-readonly:v1');
const enc=new TextEncoder();
function reply(status,body){
 return new Response(JSON.stringify(body),{status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'referrer-policy':'no-referrer','x-content-type-options':'nosniff'
 }});
}
function hold(reason='GOOGLE_OAUTH_UNQUALIFIED'){
 return {status:'HOLD',reason,actionAuthorized:false,
  answer:'VAOS Google Calendar: HOLD ('+reason+'). No calendar information has been inferred or released.'};
}
function tokenKeyReady(key){
 return key?.type==='secret'&&key.extractable===false&&
 key.algorithm?.name==='AES-GCM'&&key.algorithm?.length===256&&
 key.usages?.includes('encrypt')&&key.usages?.includes('decrypt');
}
export function googleWorkspaceReadiness(env){
 const ready=env?.VAOS_GOOGLE_CONTROL==='founder-oauth-readonly-v1' &&
 env?.VAOS_AUTH_HARDENED_CONTROL==='dedicated-hmac-v1' &&
 typeof env.GOOGLE_OAUTH_CLIENT_ID==='string'&&
 /^[a-zA-Z0-9_.-]{12,180}\.apps\.googleusercontent\.com$/.test(env.GOOGLE_OAUTH_CLIENT_ID) &&
 typeof env.GOOGLE_OAUTH_CLIENT_SECRET==='string'&&env.GOOGLE_OAUTH_CLIENT_SECRET.length>=12 &&
 tokenKeyReady(env.VAOS_GOOGLE_VAULT_KEY) &&
 typeof env.VAOS_ARTIFACTS?.get==='function'&&typeof env.VAOS_ARTIFACTS?.put==='function';
 return {status:ready?'READY':'HOLD',ready:Boolean(ready),actionAuthorized:false,
  scopes:['calendar.events','openid','email'],
  productionWritesAuthorized:false};
}
const isFounder=(req)=>verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE])?.email===FOUNDER;
function randomUrl(n=32){const b=crypto.getRandomValues(new Uint8Array(n));return bytes64(b)}
function bytes64(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function decode64(str){
 if(typeof str!=='string'||! /^[A-Za-z0-9_-]{5,20000}$/.test(str))throw Error('INVALID_ENVELOPE');
 const raw=atob(str.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-str.length%4)%4));
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function encryptRecord(record,key){
 if(!tokenKeyReady(key))throw Error('GOOGLE_VAULT_UNAVAILABLE');
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const c=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:AAD},key,enc.encode(JSON.stringify(record)));
 return {version:1,iv:bytes64(iv),ciphertext:bytes64(new Uint8Array(c))};
}
async function decryptRecord(doc,key){
 if(!tokenKeyReady(key)||doc?.version!==1)throw Error('GOOGLE_VAULT_INVALID');
 const iv=decode64(doc.iv);if(iv.length!==12)throw Error('GOOGLE_VAULT_INVALID');
 const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:AAD},key,decode64(doc.ciphertext));
 const record=JSON.parse(new TextDecoder().decode(bytes));
 if(record?.email!==FOUNDER||typeof record.accessToken!=='string'||record.accessToken.length<8||
 typeof record.refreshToken!=='string'||record.refreshToken.length<8||
 !Number.isFinite(record.expiresAt)||record.expiresAt<=0||
 !SCOPES.every(s=>record.scopes.includes(s)))throw Error('GOOGLE_VAULT_INVALID');
 return record;
}
async function saveTokens(env,record){
 const encrypted=await encryptRecord(record,env.VAOS_GOOGLE_VAULT_KEY);
 try {
  await env.VAOS_ARTIFACTS.put(RECORD,JSON.stringify(encrypted),{
   httpMetadata:{contentType:'application/json'}});
 } catch { throw Error('OAUTH_VAULT_WRITE_FAILED'); }
}
async function postToken(fetchImpl,data){
 const r=await fetchImpl('https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams(data).toString(),redirect:'error',
  signal:AbortSignal.timeout(8000)
 });
 if(r.status!==200){
  // Classify Google OAuth errors without returning Google's descriptions,
  // tokens, credentials or other upstream response details.
  let type;
  try{type=(await r.json())?.error}catch{}
  if(type==='invalid_client'||type==='unauthorized_client')
   throw Error('OAUTH_CLIENT_CREDENTIALS_REJECTED');
  if(type==='invalid_grant')
   throw Error('OAUTH_AUTHORIZATION_CODE_REJECTED');
  throw Error('GOOGLE_TOKEN_EXCHANGE_FAILED');
 }
 const value=await r.json();
 if(value.token_type!=='Bearer'||typeof value.access_token!=='string'||value.access_token.length<8||
 !Number.isInteger(value.expires_in)||value.expires_in<60||value.expires_in>86400)
 throw Error('GOOGLE_TOKEN_RESPONSE_INVALID');
 return value;
}
function normalizeGrantedScopes(raw){
 const scopes=typeof raw==='string'?raw.split(/\s+/).filter(Boolean):[];
 // Google's OIDC response may canonicalize the requested "email" scope.
 if(scopes.includes('https://www.googleapis.com/auth/userinfo.email'))
  scopes.push('email');
 return [...new Set(scopes)];
}
function allowedScopes(raw){
 const granted=normalizeGrantedScopes(raw);
 return SCOPES.every(scope=>granted.includes(scope));
}
async function oauthStart(env,now){
 const check=googleWorkspaceReadiness(env);
 if(!check.ready)return reply(503,{...check,reason:'OAUTH_CLIENT_OR_HARDENED_AUTH_MISSING'});
 const state=randomUrl(),verifier=randomUrl(),sha=await crypto.subtle.digest('SHA-256',enc.encode(verifier));
 const pending={state,verifier,expiresAt:now()+600000,consumed:false};
 const result=await env.VAOS_ARTIFACTS.put(PENDING+state+'.json',JSON.stringify(pending),{
  onlyIf:new Headers({'If-None-Match':'*'}),httpMetadata:{contentType:'application/json'}});
 if(!result)return reply(503,hold('OAUTH_STATE_STORAGE_UNAVAILABLE'));
 const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 u.search=new URLSearchParams({
  client_id:env.GOOGLE_OAUTH_CLIENT_ID,response_type:'code',
  redirect_uri:ORIGIN+'/api/google-workspace/callback',scope:EXTENDED_SCOPES.join(' '),
  access_type:'offline',prompt:'consent',state,
  code_challenge:bytes64(new Uint8Array(sha)),code_challenge_method:'S256',
  login_hint:FOUNDER
 }).toString();
 return new Response(null,{status:302,headers:{
  location:u.toString(),'cache-control':'no-store',
  'referrer-policy':'no-referrer',
  'set-cookie':'vaos_gws_oauth='+state+'; HttpOnly; Secure; SameSite=Lax; Path=/api/google-workspace/callback; Max-Age=600'
 }});
}
async function oauthCallback(req,env,fetchImpl,now){
 const u=new URL(req.url),state=u.searchParams.get('state'),code=u.searchParams.get('code');
 const cookie=parseCookies(req.headers?.cookie||'').vaos_gws_oauth;
 if(!state||!code||!/^[A-Za-z0-9_-]{40,128}$/.test(state)||
 !/^[A-Za-z0-9_/.~-]{6,2048}$/.test(code)||cookie!==state)return reply(400,hold('OAUTH_STATE_INVALID'));
 if(!googleWorkspaceReadiness(env).ready)return reply(503,hold('OAUTH_CLIENT_OR_HARDENED_AUTH_MISSING'));
 const prior=await env.VAOS_ARTIFACTS.get(PENDING+state+'.json');
 if(!prior?.httpEtag)return reply(400,hold('OAUTH_STATE_MISSING'));
 let p;try{p=JSON.parse(await prior.text())}catch{return reply(400,hold('OAUTH_STATE_INVALID'))}
 if(p.state!==state||p.consumed||p.expiresAt<now()||p.expiresAt>now()+600001||
 typeof p.verifier!=='string')return reply(400,hold('OAUTH_STATE_EXPIRED'));
 // Exactly one callback can exchange this code. Concurrent or replayed
 // callbacks fail conditional R2 ETag admission before accessing Google.
 const updated=await env.VAOS_ARTIFACTS.put(PENDING+state+'.json',JSON.stringify({...p,consumed:true}),{
  onlyIf:new Headers({'If-Match':prior.httpEtag}),httpMetadata:{contentType:'application/json'}});
 if(!updated)return reply(409,hold('OAUTH_STATE_REPLAYED'));
 try{
  const tok=await postToken(fetchImpl,{
   client_id:env.GOOGLE_OAUTH_CLIENT_ID,
   client_secret:env.GOOGLE_OAUTH_CLIENT_SECRET,redirect_uri:ORIGIN+'/api/google-workspace/callback',
   code,code_verifier:p.verifier,grant_type:'authorization_code'
  });
  if(!allowedScopes(tok.scope)||typeof tok.refresh_token!=='string'||tok.refresh_token.length<8)
   return reply(503,hold('OAUTH_SCOPES_OR_REFRESH_TOKEN_MISSING'));
  let identity;
  try {
   identity=await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo',{
    method:'GET',headers:{Authorization:'Bearer '+tok.access_token},
    redirect:'error',signal:AbortSignal.timeout(8000)});
  } catch { throw Error('OAUTH_IDENTITY_FETCH_FAILED'); }
  if(identity.status!==200)return reply(503,hold('OAUTH_IDENTITY_UNVERIFIED'));
  const person=await identity.json();
  if(person?.email_verified!==true||String(person.email||'').toLowerCase()!==FOUNDER)
   return reply(403,hold('OAUTH_FOUNDER_IDENTITY_MISMATCH'));
  await saveTokens(env,{
   email:FOUNDER,accessToken:tok.access_token,refreshToken:tok.refresh_token,
   expiresAt:now()+tok.expires_in*1000,scopes:normalizeGrantedScopes(tok.scope)
  });
  return reply(200,{status:'CONNECTED',actionAuthorized:false,
   message:'Founder Google Calendar OAuth authorized. Calendar event creation is permitted only after a direct authenticated founder request.'});
 }catch(error){
  const code=String(error?.message||'');
  const safe=new Set(['OAUTH_CLIENT_CREDENTIALS_REJECTED',
   'OAUTH_AUTHORIZATION_CODE_REJECTED','GOOGLE_TOKEN_EXCHANGE_FAILED',
   'GOOGLE_TOKEN_RESPONSE_INVALID','OAUTH_IDENTITY_FETCH_FAILED',
   'GOOGLE_VAULT_UNAVAILABLE','OAUTH_VAULT_WRITE_FAILED']);
  return reply(503,hold(safe.has(code)?code:'OAUTH_EXCHANGE_UNVERIFIED'));
 }
}
async function googleGet(url,token,fetchImpl){
 const r=await fetchImpl(url,{method:'GET',headers:{Authorization:'Bearer '+token},
  redirect:'error',signal:AbortSignal.timeout(8000)});
 if(r.status!==200)throw Error('GOOGLE_API_UNQUALIFIED');
 return r.json();
}
export async function readGoogleWorkspaceBrief(env,{fetchImpl=fetch,now=()=>Date.now()}={}){
 if(!googleWorkspaceReadiness(env).ready)return hold('OAUTH_CLIENT_OR_HARDENED_AUTH_MISSING');
 try{
  const blob=await env.VAOS_ARTIFACTS.get(RECORD);
  if(!blob)return hold('GOOGLE_FOUNDER_CONSENT_REQUIRED');
  const record=await decryptRecord(JSON.parse(await blob.text()),env.VAOS_GOOGLE_VAULT_KEY);
  if(record.expiresAt<=now()+90000){
   const tok=await postToken(fetchImpl,{client_id:env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret:env.GOOGLE_OAUTH_CLIENT_SECRET,refresh_token:record.refreshToken,
    grant_type:'refresh_token'});
   if(!allowedScopes(tok.scope||record.scopes.join(' ')))return hold('GOOGLE_SCOPE_CHANGED');
   record.accessToken=tok.access_token;record.expiresAt=now()+tok.expires_in*1000;
   await saveTokens(env,record);
  }
  const from=new Date(now()).toISOString(),to=new Date(now()+7*86400000).toISOString();
  const calUrl='https://www.googleapis.com/calendar/v3/calendars/primary/events?'+
   new URLSearchParams({timeMin:from,timeMax:to,maxResults:'10',singleEvents:'true',orderBy:'startTime',
    fields:'items(id,status,start),nextPageToken'}).toString();
  const cal=await googleGet(calUrl,record.accessToken,fetchImpl);
  if(!Array.isArray(cal?.items))return hold('GOOGLE_SOURCE_SCHEMA_INVALID');
  const calendarEvents=cal.items.filter(x=>x?.status!=='cancelled').length;
  return {status:'PASS',actionAuthorized:false,calendarEvents,
   answer:'VAOS Google Calendar connectivity brief (founder): next 7 days: '+
    calendarEvents+' calendar events in the first 10. Event titles and participants are not posted to Slack. '+
    'No scheduling writes are authorized without a direct authenticated founder request.'};
 }catch{return hold('GOOGLE_SOURCE_UNVERIFIED')}
}

const validIso=s=>typeof s==='string' && /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s));
async function founderGoogleCredential(env,{fetchImpl=fetch,now=()=>Date.now(),required=[]}={}){
 if(!googleWorkspaceReadiness(env).ready)throw Error('GOOGLE_OAUTH_UNAVAILABLE');
 const blob=await env.VAOS_ARTIFACTS.get(RECORD);
 if(!blob)throw Error('GOOGLE_FOUNDER_CONSENT_REQUIRED');
 const record=await decryptRecord(JSON.parse(await blob.text()),env.VAOS_GOOGLE_VAULT_KEY);
 if(!required.every(s=>record.scopes.includes(s)))throw Error('GOOGLE_SCOPE_RECONNECT_REQUIRED');
 if(record.expiresAt<=now()+90000){
  const tok=await postToken(fetchImpl,{client_id:env.GOOGLE_OAUTH_CLIENT_ID,
   client_secret:env.GOOGLE_OAUTH_CLIENT_SECRET,refresh_token:record.refreshToken,grant_type:'refresh_token'});
  if(!allowedScopes(tok.scope||record.scopes.join(' ')))throw Error('GOOGLE_SCOPE_CHANGED');
  record.accessToken=tok.access_token;record.expiresAt=now()+tok.expires_in*1000;
  await saveTokens(env,record);
 }
 return record.accessToken;
}
export async function readFounderGmail(env,q,{fetchImpl=fetch,now=()=>Date.now()}={}){
 const mailScope='https://www.googleapis.com/auth/gmail.readonly';
 if(typeof q!=='string'||q.trim().length<2||q.length>120||/[\x00-\x1f]/.test(q))
  return hold('MAIL_QUERY_INVALID');
 try{
  const token=await founderGoogleCredential(env,{fetchImpl,now,required:[mailScope]});
  const base='https://gmail.googleapis.com/gmail/v1/users/me/messages';
  const url=base+'?'+new URLSearchParams({q:q.trim(),maxResults:'8'}).toString();
  const matches=await googleGet(url,token,fetchImpl);
  if(!Array.isArray(matches?.messages)&&matches?.resultSizeEstimate!==0)
   return hold('GMAIL_SEARCH_SCHEMA_INVALID');
  const messages=await Promise.all((matches.messages||[]).slice(0,8).map(async item=>{
   if(!/^[A-Za-z0-9_-]{5,100}$/.test(item?.id||''))throw Error('MAIL_ID_INVALID');
   const detail=await googleGet(base+'/'+encodeURIComponent(item.id)+
    '?'+new URLSearchParams({format:'full'}).toString(),token,fetchImpl);
   if(detail.id!==item.id||!Array.isArray(detail.payload?.headers))throw Error('MAIL_SCHEMA_INVALID');
   const header=name=>String(detail.payload.headers.find(x=>String(x.name).toLowerCase()===name)?.value||'').slice(0,220);
   const plain=detail.payload.parts?.find(x=>x?.mimeType==='text/plain'&&x.body?.data)?.body?.data||detail.payload?.body?.data;
   let body='';try{if(plain)body=new TextDecoder().decode(decode64(plain)).slice(0,1600)}catch{}
   return {id:item.id,from:header('from'),subject:header('subject'),date:header('date'),
    snippet:String(detail.snippet||'').slice(0,400),body};
  }));
  return {status:'PASS',actionAuthorized:false,source:'GMAIL',query:q.trim(),messages,
   answer:messages.length?messages.map(m=>m.date+' · '+m.from+' · '+m.subject+' · '+(m.body||m.snippet)).join('\\n').slice(0,4000)
    :'No matching messages found in the connected Gmail account.'};
 }catch(e){return hold(e.message==='GOOGLE_SCOPE_RECONNECT_REQUIRED'?e.message:'GMAIL_SOURCE_UNVERIFIED')}
}
export async function createFounderCalendarReminder(env,body,{fetchImpl=fetch,now=()=>Date.now()}={}){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['title','start','end','requestId'].includes(k))
  ||typeof body.title!=='string'||body.title.trim().length<3||body.title.length>140
  ||!validIso(body.start)||!validIso(body.end)
  ||typeof body.requestId!=='string'||!/^[a-f0-9]{32}$/.test(body.requestId)
  ||Date.parse(body.start)<now()+60000||Date.parse(body.end)<=Date.parse(body.start)
  ||Date.parse(body.end)-Date.parse(body.start)>86400000)
  return {status:'HOLD',reason:'CALENDAR_EVENT_VALIDATION_FAILED',saved:false};
 try{
  const token=await founderGoogleCredential(env,{fetchImpl,now,
   required:['https://www.googleapis.com/auth/calendar.events']});
  // Deterministic event ID: a retry returns the same Calendar item, never a duplicate.
  const eventId='vaos'+body.requestId;
  const url='https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const payload={id:eventId,summary:body.title.trim(),start:{dateTime:body.start},
   end:{dateTime:body.end},reminders:{useDefault:false,overrides:[{method:'popup',minutes:0}]}};
  const result=await fetchImpl(url,{method:'POST',redirect:'error',
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
  let saved;
  if(result.status===200||result.status===201)saved=await result.json();
  else if(result.status===409){
   // A lost response is reconciled against the same stable event ID.
   saved=await googleGet(url+'/'+eventId,token,fetchImpl);
  }else throw Error('CALENDAR_INSERT_FAILED');
  if(saved?.id!==eventId||saved?.status==='cancelled'||saved?.summary!==payload.summary||
   Date.parse(saved?.start?.dateTime)!==Date.parse(body.start)||
   Date.parse(saved?.end?.dateTime)!==Date.parse(body.end))
   return {status:'HOLD',reason:'CALENDAR_READBACK_MISMATCH',saved:false};
  return {status:'PASS',saved:true,id:eventId,summary:saved.summary,
   start:saved.start.dateTime,end:saved.end.dateTime,reminder:'Google Calendar popup at the scheduled time',source:'GOOGLE_CALENDAR'};
 }catch(e){return {status:'HOLD',reason:e.message==='GOOGLE_SCOPE_RECONNECT_REQUIRED'?e.message:'CALENDAR_SAVE_UNVERIFIED',saved:false}}
}

export function createGoogleWorkspaceHandler({authorized=isFounder,fetchImpl=fetch,now=()=>Date.now()}={}){
 return async (req,_res,overrideEnv)=>{
  const env=overrideEnv||req.env,path=new URL(req.url).pathname;
  const write=path==='/api/google-workspace/reminders';
  if(write ? req.method!=='POST' : req.method!=='GET')
   return reply(405,{error:'METHOD_NOT_ALLOWED',actionAuthorized:false});
  if(write){
   let origin;try{origin=new URL(req.url).origin}catch{}
   if(!authorized(req)||req.headers?.origin!==origin)
    return reply(403,{error:'FOUNDER_OR_ORIGIN_DENIED',actionAuthorized:false});
   if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))
    return reply(415,{error:'JSON_REQUIRED',actionAuthorized:false});
   const result=await createFounderCalendarReminder(env,req.body,{fetchImpl,now});
   return reply(result.saved?200:409,result);
  }
  if(path==='/api/google-workspace/callback')return oauthCallback(req,env,fetchImpl,now);
  if(!authorized(req))return reply(403,{error:'FOUNDER_SESSION_REQUIRED',actionAuthorized:false});
  if(path==='/api/google-workspace/status'){
   const ready=googleWorkspaceReadiness(env);
   let consentPresent=false;
   try{consentPresent=Boolean(await env?.VAOS_ARTIFACTS?.get(RECORD))}catch{}
   return reply(200,{...ready,consentPresent});
  }
  if(path==='/api/google-workspace/start')return oauthStart(env,now);
  if(path==='/api/google-workspace/brief')return reply(200,await readGoogleWorkspaceBrief(env,{fetchImpl,now}));
  if(path==='/api/google-workspace/mail'){
   const q=new URL(req.url).searchParams.get('q');
   return reply(200,await readFounderGmail(env,q,{fetchImpl,now}));
  }
  return reply(404,{error:'NOT_FOUND',actionAuthorized:false});
 }
}
export default createGoogleWorkspaceHandler();
