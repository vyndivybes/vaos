import test from 'node:test';
import assert from 'node:assert/strict';
import {createGoogleWorkspaceHandler,googleWorkspaceReadiness,readGoogleWorkspaceBrief} from './google-workspace.mjs';

const ORIGIN='https://vaos.vayushastr.workers.dev';
const ctx={email:'shyamsundhar1982@gmail.com'};
function setup(){
 const storage=new Map(),calls=[];
 const env={
  VAOS_GOOGLE_CONTROL:'founder-oauth-readonly-v1',
  VAOS_AUTH_HARDENED_CONTROL:'dedicated-hmac-v1',
  GOOGLE_OAUTH_CLIENT_ID:'test-client.apps.googleusercontent.com',
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
