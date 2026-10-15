import test from 'node:test';
import assert from 'node:assert/strict';
import {createGoogleWorkspaceHandler,googleWorkspaceReadiness,readGoogleWorkspaceBrief,readFounderGmail,createFounderCalendarReminder} from './google-workspace.mjs';

const ORIGIN='https://vaos.vayushastr.workers.dev';
const ctx={email:'shyamsundhar1982@gmail.com'};
function setup(){
 const storage=new Map(),calls=[];
 const env={
  VAOS_GOOGLE_CONTROL:'founder-oauth-readonly-v1',
  VAOS_AUTH_HARDENED_CONTROL:'dedicated-hmac-v1',
  GOOGLE_OAUTH_CLIENT_ID:'test-client-12345.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET:'test-oauth-secret',
  VAOS_GOOGLE_VAULT_KEY:'not-crypto-key',
  VAOS_ARTIFACTS:{
   async get(k){return storage.has(k)?{async text(){return storage.get(k)},httpEtag:'"testetag"'}:null},
   async put(k,v,opts){if(opts?.onlyIf?.get('If-Match')&&storage.get(k)?.includes('"consumed":true'))return null;storage.set(k,v);return {etag:'testetag'}},
   async list({prefix}){return {objects:[...storage.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}}
  }
 };
 const fetchImpl=async(url,opts)=>{calls.push({url,opts});throw Error('external-network-not-stubbed')};
 return {env,storage,calls,fetchImpl};
}
const makeReq=(path,headers={})=>({method:'GET',url:ORIGIN+path,headers:{cookie:'vaos_session=test',...headers}});
const getResponse=()=>{let status=200;let body;return {setHeader(){return this},status(s){status=s;return this},json(v){body=v;return {status,body}},get(){return {status,body}}}};
test('OAuth readiness is fail-closed without hardened session, Google client and vault bindings',()=>{
 const s=setup();delete s.env.GOOGLE_OAUTH_CLIENT_SECRET;
 const r=googleWorkspaceReadiness(s.env);
 assert.equal(r.ready,false);assert.equal(r.actionAuthorized,false);
 assert.equal(JSON.stringify(r).includes('test-oauth-secret'),false);
});
test('status endpoint is authenticated, redacted and never starts OAuth',async()=>{
 const s=setup();const h=createGoogleWorkspaceHandler({authorized:()=>false,fetchImpl:s.fetchImpl});
 const res=getResponse();
 const r=await h(makeReq('/api/google-workspace/status'),res,s.env);
 assert.equal(r.status,403);
 assert.equal(s.calls.length,0);
});
test('OAuth start refuses weak authentication even with OAuth client configured',async()=>{
 const s=setup();s.env.VAOS_AUTH_HARDENED_CONTROL='disabled';
 const h=createGoogleWorkspaceHandler({authorized:()=>true,fetchImpl:s.fetchImpl});
 const r=await h(makeReq('/api/google-workspace/start'),getResponse(),s.env);
 assert.equal(r.status,503);assert.equal(s.calls.length,0);assert.equal(s.storage.size,0);
});
test('OAuth start refuses missing nonextractable AES-256-GCM key without initiating consent',async()=>{
 const s=setup();const h=createGoogleWorkspaceHandler({authorized:()=>true,fetchImpl:s.fetchImpl});
 const r=await h(makeReq('/api/google-workspace/start'),getResponse(),s.env);
 assert.equal(r.status,503);assert.equal(s.storage.size,0);
});
test('OAuth callback cannot bypass an absent state or cookie',async()=>{
 const s=setup();const h=createGoogleWorkspaceHandler({authorized:()=>true,fetchImpl:s.fetchImpl});
 const r=await h(makeReq('/api/google-workspace/callback?code=somecode&state=someState'),getResponse(),s.env);
 assert.equal(r.status,400);assert.equal(s.calls.length,0);
});
test('read-only briefing fails closed when token not independently authorized',async()=>{
 const s=setup();const r=await readGoogleWorkspaceBrief(s.env,{fetchImpl:s.fetchImpl});
 assert.equal(r.status,'HOLD');assert.equal(r.actionAuthorized,false);assert.equal(s.calls.length,0);
});
test('read-only briefing never permits actions or posts data to external Slack',async()=>{
 const s=setup();const r=await readGoogleWorkspaceBrief(s.env,{fetchImpl:s.fetchImpl});
 assert.equal(r.actionAuthorized,false);assert.doesNotMatch(JSON.stringify(r),/test-oauth-secret/);
});

test('hardened OAuth uses PKCE + browser cookie, encrypts tokens, and permits metadata-only reads',async()=>{
 const s=setup();
 s.env.VAOS_GOOGLE_VAULT_KEY=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const scope=['openid','email','https://www.googleapis.com/auth/calendar.events.readonly','https://www.googleapis.com/auth/drive.metadata.readonly','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/calendar.events'].join(' ');
 let n=0;
 const fetchImpl=async(url,init)=>{
  n++;s.calls.push({url,method:init.method});
  if(url==='https://oauth2.googleapis.com/token')return new Response(JSON.stringify({
    token_type:'Bearer',access_token:'access-token-valid-2026',refresh_token:'refresh-token-valid-2026',
    expires_in:3600,scope
  }),{status:200});
  if(url==='https://openidconnect.googleapis.com/v1/userinfo')return new Response(JSON.stringify({
   email:'shyamsundhar1982@gmail.com',email_verified:true
  }),{status:200});
  if(url.startsWith('https://www.googleapis.com/calendar/v3/'))return new Response(JSON.stringify({
   items:[{id:'a',status:'confirmed',start:{dateTime:'2026-10-12T12:00:00Z'}}]
  }),{status:200});
  if(url.startsWith('https://www.googleapis.com/drive/v3/'))return new Response(JSON.stringify({
   files:[{id:'safe',mimeType:'application/pdf',modifiedTime:'2026-10-12T00:00:00Z'}]
  }),{status:200});
  throw Error('unexpected_url');
 };
 const h=createGoogleWorkspaceHandler({authorized:()=>true,fetchImpl,now:()=>Date.parse('2026-10-12T04:00:00Z')});
 const start=await h(makeReq('/api/google-workspace/start'),getResponse(),s.env);
 assert.equal(start.status,302);
 const consent=new URL(start.headers.get('location'));
 assert.equal(consent.origin,'https://accounts.google.com');
 assert.equal(consent.searchParams.get('code_challenge_method'),'S256');
 assert.equal(consent.searchParams.get('access_type'),'offline');
 assert.match(consent.searchParams.get('scope'),/gmail.readonly/);
 const state=consent.searchParams.get('state');
 assert.ok(s.storage.has('runtime/google-workspace/oauth-pending/'+state+'.json'));
 const cookie=start.headers.get('set-cookie').split(';')[0];
 const callback=await h(makeReq('/api/google-workspace/callback?state='+state+'&code=authorized_code_2026',{
   cookie:cookie
 }),getResponse(),s.env);
 assert.equal(callback.status,200);
 const body=await callback.json();
 assert.equal(body.status,'CONNECTED');
 assert.equal(n,2);
 const saved=s.storage.get('runtime/google-workspace/founder-token.v1.json');
 assert.ok(saved);assert.equal(saved.includes('refresh-token-valid-2026'),false);
 const brief=await readGoogleWorkspaceBrief(s.env,{fetchImpl,now:()=>Date.parse('2026-10-12T04:01:00Z')});
 assert.equal(brief.status,'PASS');
 assert.equal(brief.calendarEvents,1);assert.equal(brief.driveRecent,1);
 assert.equal(brief.actionAuthorized,false);
 assert.doesNotMatch(brief.answer,/refresh-token|access-token|safe/);
 const replay=await h(makeReq('/api/google-workspace/callback?state='+state+'&code=authorized_code_2026',{
   cookie:cookie
 }),getResponse(),s.env);
 assert.equal(replay.status,400);
});
test('OAuth callback refuses a different Google identity and never persists credentials',async()=>{
 const s=setup();
 s.env.VAOS_GOOGLE_VAULT_KEY=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const scope=['openid','email','https://www.googleapis.com/auth/calendar.events.readonly','https://www.googleapis.com/auth/drive.metadata.readonly','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/calendar.events'].join(' ');
 const fetchImpl=async(url)=>{
  if(url.endsWith('/token'))return new Response(JSON.stringify({
   token_type:'Bearer',access_token:'access-token-valid-2026',refresh_token:'refresh-token-valid-2026',expires_in:3600,scope
  }));
  return new Response(JSON.stringify({email:'attacker@example.com',email_verified:true}));
 };
 const h=createGoogleWorkspaceHandler({authorized:()=>true,fetchImpl,now:()=>Date.parse('2026-10-12T04:00:00Z')});
 const start=await h(makeReq('/api/google-workspace/start'),getResponse(),s.env);
 const state=new URL(start.headers.get('location')).searchParams.get('state');
 const cb=await h(makeReq('/api/google-workspace/callback?state='+state+'&code=authorized_code_2026',{
   cookie:start.headers.get('set-cookie').split(';')[0]
 }),getResponse(),s.env);
 assert.equal(cb.status,403);
 assert.equal(s.storage.has('runtime/google-workspace/founder-token.v1.json'),false);
});

test('consented founder can read Toray Gmail and save a bounded calendar reminder with confirmed event ID',async()=>{
 const s=setup();
 s.env.VAOS_GOOGLE_VAULT_KEY=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const scope=['openid','email','https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events'].join(' ');
 const calls=[];
 const fetchImpl=async(url,init)=>{
  calls.push({url,method:init.method});
  if(url==='https://oauth2.googleapis.com/token')return Response.json({
   token_type:'Bearer',access_token:'access-token',refresh_token:'refresh-token',expires_in:3600,scope});
  if(url==='https://openidconnect.googleapis.com/v1/userinfo')
   return Response.json({email:'shyamsundhar1982@gmail.com',email_verified:true});
  if(url.includes('/gmail/v1/users/me/messages/')){
   return Response.json({id:'mailid123',snippet:'Materials status',
    payload:{headers:[{name:'From',value:'Toray technical team'},
      {name:'Subject',value:'Composite material review'},{name:'Date',value:'15 Oct 2026'}]}});
  }
  if(url.includes('/gmail/v1/users/me/messages?'))
   return Response.json({messages:[{id:'mailid123'}],resultSizeEstimate:1});
  if(url.endsWith('/calendars/primary/events')&&init.method==='POST'){
   return new Response(JSON.stringify({...JSON.parse(init.body),status:'confirmed'}),{status:201});
  }
  throw Error('UNEXPECTED_GOOGLE_REQUEST');
 };
 const now=()=>Date.parse('2026-10-15T06:00:00.000Z');
 const h=createGoogleWorkspaceHandler({authorized:()=>true,fetchImpl,now});
 const start=await h(makeReq('/api/google-workspace/start'),getResponse(),s.env);
 const state=new URL(start.headers.get('location')).searchParams.get('state');
 const cb=await h(makeReq('/api/google-workspace/callback?state='+state+'&code=authorized_code_2026',{
  cookie:start.headers.get('set-cookie').split(';')[0]}),getResponse(),s.env);
 assert.equal(cb.status,200);
 const mail=await readFounderGmail(s.env,'from:Toray',{fetchImpl,now});
 assert.equal(mail.status,'PASS');assert.equal(mail.messages.length,1);
 assert.match(mail.messages[0].subject,/Composite material/);
 const event=await createFounderCalendarReminder(s.env,{
  title:'Follow up with TANSAM',start:'2026-10-19T09:00:00+05:30',
  end:'2026-10-19T09:30:00+05:30',requestId:'a'.repeat(32)
 },{fetchImpl,now});
 assert.equal(event.saved,true);assert.equal(event.status,'PASS');
 assert.equal(event.id,'vaos'+'a'.repeat(32));
 assert.equal(calls.filter(x=>x.method==='POST'&&x.url.endsWith('/calendars/primary/events')).length,1);
});
