// Independent VAOS Google Workspace read-only OAuth, disabled without
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
 'https://www.googleapis.com/auth/calendar.events.readonly',
 'https://www.googleapis.com/auth/drive.metadata.readonly'
]);
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
  answer:'VAOS Google Workspace: HOLD ('+reason+'). No Calendar or Drive information has been inferred or released.'};
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
  scopes:['calendar.events.readonly','drive.metadata.readonly','openid','email'],
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
 await env.VAOS_ARTIFACTS.put(RECORD,JSON.stringify(encrypted),{
  httpMetadata:{contentType:'application/json'}});
}
async function postToken(fetchImpl,data){
 const r=await fetchImpl('https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams(data).toString(),redirect:'error',
  signal:AbortSignal.timeout(8000)
 });
 if(r.status!==200)throw Error('GOOGLE_TOKEN_EXCHANGE_FAILED');
 const value=await r.json();
 if(value.token_type!=='Bearer'||typeof value.access_token!=='string'||value.access_token.length<8||
 !Number.isInteger(value.expires_in)||value.expires_in<60||value.expires_in>86400)
 throw Error('GOOGLE_TOKEN_RESPONSE_INVALID');
 return value;
}
function allowedScopes(raw){
 const a=typeof raw==='string'?raw.split(/\s+/):[];
 return SCOPES.every(s=>a.includes(s));
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
  redirect_uri:ORIGIN+'/api/google-workspace/callback',scope:SCOPES.join(' '),
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
  const identity=await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo',{
   method:'GET',headers:{Authorization:'Bearer '+tok.access_token},
   redirect:'error',signal:AbortSignal.timeout(8000)});
  if(identity.status!==200)return reply(503,hold('OAUTH_IDENTITY_UNVERIFIED'));
  const person=await identity.json();
  if(person?.email_verified!==true||String(person.email||'').toLowerCase()!==FOUNDER)
   return reply(403,hold('OAUTH_FOUNDER_IDENTITY_MISMATCH'));
  await saveTokens(env,{
   email:FOUNDER,accessToken:tok.access_token,refreshToken:tok.refresh_token,
   expiresAt:now()+tok.expires_in*1000,scopes:tok.scope.split(/\s+/)
  });
  return reply(200,{status:'CONNECTED_READONLY',actionAuthorized:false,
   message:'Founder Google Calendar and Drive read-only OAuth was authorized. Return to VAOS Slack DM and ask for Google Workspace brief.'});
 }catch{return reply(503,hold('OAUTH_EXCHANGE_UNVERIFIED'))}
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
  const driveUrl='https://www.googleapis.com/drive/v3/files?'+
   new URLSearchParams({pageSize:'10',orderBy:'modifiedTime desc',q:'trashed = false',
    fields:'nextPageToken,files(id,mimeType,modifiedTime)'}).toString();
  const [cal,drive]=await Promise.all([googleGet(calUrl,record.accessToken,fetchImpl),
    googleGet(driveUrl,record.accessToken,fetchImpl)]);
  if(!Array.isArray(cal?.items)||!Array.isArray(drive?.files))return hold('GOOGLE_SOURCE_SCHEMA_INVALID');
  const calendarEvents=cal.items.filter(x=>x?.status!=='cancelled').length;
  const driveRecent=drive.files.length;
  return {status:'PASS',actionAuthorized:false,calendarEvents,driveRecent,
   answer:'VAOS Google Workspace connectivity brief (founder read-only): next 7 days: '+
    calendarEvents+' calendar events in the first 10; recent Drive metadata: '+driveRecent+
    ' files in the first 10. Event titles, document names, participants and contents are not posted to Slack. '+
    'No scheduling or document writes are authorized.'};
 }catch{return hold('GOOGLE_SOURCE_UNVERIFIED')}
}
export function createGoogleWorkspaceHandler({authorized=isFounder,fetchImpl=fetch,now=()=>Date.now()}={}){
 return async (req,_res,overrideEnv)=>{
  const env=overrideEnv||req.env,path=new URL(req.url).pathname;
  if(req.method!=='GET')return reply(405,{error:'METHOD_NOT_ALLOWED',actionAuthorized:false});
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
  return reply(404,{error:'NOT_FOUND',actionAuthorized:false});
 }
}
export default createGoogleWorkspaceHandler();
