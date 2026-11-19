import test from 'node:test';
import assert from 'node:assert/strict';
import {createFounderMdIdentityHandler} from './founder-md-identity.mjs';
import {normalizeVyndiMdIdentityEvidence} from '../lib/md-cross-app-identity.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
import {getVyndiBridgeRoute} from '../../../packages/contracts/vyndi-write-bridge.mjs';

const founder='shyamsundhar1982@gmail.com';
const now=Date.parse('2026-11-20T02:00:00.000Z');
const approvedSession={email:founder,v:2,iat:Math.floor(now/1000)-120,exp:Math.floor(now/1000)+900,sid:'a'.repeat(32)};
const evidence=()=>({
 readOnly:true,effectClass:'read',sourceReceiptChecked:false,sourceCompletenessVerified:false,
 actionAuthorized:false,productionWriteAuthorized:false,employeeId:'people',
 actionType:'GOVERNANCE.OBSERVE_MD_IDENTITY',sourceAuthority:'readManagingDirectorIdentityEvidence',
 data:{schemaVersion:'VYNDI_MD_IDENTITY_EVIDENCE_V1',status:'HOLD',readOnly:true,
  existingAccountLocated:true,emailVerified:false,adminRoleAssigned:true,
  accountProviderLinked:true,unexpiredSessionRecordPresent:true,
  vaosSessionVerifiedHere:false,vyndiBrowserSessionVerifiedHere:false,
  crossPlatformSsoEnabled:false,mdAuthenticatedAcrossBoth:false,
  businessApprovalAuthorized:false,productionWriteAuthorized:false,sourceRevisionCertified:false,
  holds:['INDEPENDENT_BROWSER_SESSION_AND_SSO_UNVERIFIED','NO_CROSS_APP_AUTH_GRANT','VYNDI_EMAIL_NOT_VERIFIED'],
  records:[{email:'PRIVATE-EMAIL',password:'PRIVATE-PASSWORD'}]},
});
function run(options={}){
 const captured={status:0,body:null,headers:{},calls:[]};
 const res={setHeader(k,v){captured.headers[k]=v;return this;},
  status(x){captured.status=x;return this;},json(data){captured.body=data;return this}};
 const handler=createFounderMdIdentityHandler({
  getSession:()=> options.user===undefined ? approvedSession:options.user,
  hardenedAuth:()=> options.hardened===undefined ? true:options.hardened,
  getReader:()=>({execute:async job=>{
    captured.calls.push(job);
    if(options.fail)throw Error('SECRET:injected-token');
    return options.reply||evidence();
  }}),
  now:()=>now,
 });
 return handler({method:options.method||'GET',url:'https://vaos.local/api/founder-md-identity'+(options.query||''),headers:{cookie:'UNSAFE-RAW'},env:{}},res).then(()=>captured);
}
test('founder-only route requires a genuine VAOS hardened v2 session then performs signed VYNDI read',async()=>{
 const route=getVyndiBridgeRoute('GOVERNANCE.OBSERVE_MD_IDENTITY');
 assert.equal(route.effectClass,'read');
 assert.equal(route.employeeId,'people');
 assert.equal(route.executionEnabled,true);
 assert.equal(route.authority,'readManagingDirectorIdentityEvidence');
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/founder-md-identity'],'function');
 const r=await run();
 assert.equal(r.status,200);
 assert.equal(r.calls.length,1);
 assert.equal(r.calls[0].actionType,'GOVERNANCE.OBSERVE_MD_IDENTITY');
 assert.equal(r.body.data.status,'HOLD');
 assert.equal(r.body.data.vaosFounderSessionVerified,true);
 assert.equal(r.body.data.vyndiAccountAdminAssigned,true);
 assert.equal(r.body.data.vyndiAccountEmailVerified,false);
 assert.equal(r.body.data.crossPlatformSsoVerified,false);
 assert.equal(r.body.data.productionWriteAuthorized,false);
 assert.equal(r.body.data.businessApprovalAuthorized,false);
 assert.ok(r.body.data.holds.includes('VYNDI_EMAIL_NOT_VERIFIED'));
 assert.doesNotMatch(JSON.stringify(r.body),/PRIVATE-EMAIL|PRIVATE-PASSWORD|UNSAFE-RAW|aaaaaaaaaa/);
});
test('different user, invalid expiry/session ID, old token or missing hardened control never reaches bridge',async()=>{
 for(const input of [
  {user:null,status:401},
  {user:{...approvedSession,email:'other@example.test'},status:403},
  {user:{...approvedSession,v:1},status:401},
  {user:{...approvedSession,sid:'invalid'},status:401},
  {user:{...approvedSession,exp:Math.floor(now/1000)-1},status:401},
  {user:{...approvedSession,iat:Math.floor(now/1000)+200},status:401},
  {user:{...approvedSession,iat:Math.floor(now/1000)-29000},status:401},
  {hardened:false,status:503},
 ]){
  const r=await run(input);assert.equal(r.status,input.status,JSON.stringify(input));
  assert.equal(r.calls.length,0);
 }
});
test('MD route rejects query params and mutations before any VYNDI call',async()=>{
 for(const input of [{method:'POST',status:405},{query:'?as=admin',status:422}]){
  const r=await run(input);assert.equal(r.status,input.status);
  assert.equal(r.calls.length,0);
 }
});
test('forged VYNDI admin grant, verified login claim or unexpected source identity never escalates',async()=>{
 const original=evidence();
 for(const invalid of [
  {...original,sourceAuthority:'fake-admin'},
  {...original,data:{...original.data,mdAuthenticatedAcrossBoth:true}},
  {...original,data:{...original.data,crossPlatformSsoEnabled:true}},
  {...original,data:{...original.data,businessApprovalAuthorized:true}},
  {...original,data:{...original.data,holds:['APPROVED']}},
 ]){
  const clean=normalizeVyndiMdIdentityEvidence(invalid);
  assert.equal(clean.status,'HOLD');
  assert.equal(clean.accountEvidenceAccepted,false);
  assert.equal(clean.productionWriteAuthorized,false);
  assert.ok(clean.holds.includes('MD_BINDING_EVIDENCE_INVALID'));
 }
});
test('failed bridge read stays HOLD; no credentials or raw error in result',async()=>{
 const r=await run({fail:true});
 assert.equal(r.status,200);
 assert.equal(r.body.data.status,'HOLD');
 assert.equal(r.body.data.vaosFounderSessionVerified,true);
 assert.equal(r.body.data.crossPlatformSsoVerified,false);
 assert.equal(r.body.data.vyndiAccountAdminAssigned,false);
 assert.equal(r.body.data.productionWriteAuthorized,false);
 assert.ok(r.body.data.holds.includes('MD_IDENTITY_EVIDENCE_UNAVAILABLE'));
 assert.doesNotMatch(JSON.stringify(r.body),/SECRET:injected-token/);
});
