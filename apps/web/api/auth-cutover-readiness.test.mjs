import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256,createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {evaluateHardenedCutoverReadiness,createAuthCutoverReadinessHandler} from './auth-cutover-readiness.mjs';

const maker='shyamsundhar1982@gmail.com';
const checker='kaaviyam1519@gmail.com';
const good={
 VAOS_SESSION_HMAC_KEY:'af'.repeat(32),
 VAOS_DEV_LOGIN_PASSWORD_SHA256:sha256('distinct-synthetic-maker-login'),
 VAOS_DEV_CHECKER_PASSWORD_SHA256:sha256('distinct-synthetic-checker-login'),
};
function makeReq({env=good,email=maker,method='GET',rawCookie}={}){
 return {method,env,url:'https://vaos.example/api/auth-cutover-readiness',headers:{
  cookie:rawCookie??(email?SESSION_COOKIE+'='+createSessionToken(email):'')}};
}
function makeRes(){const result={status:200,body:null,headers:{}};
 const res={setHeader(k,v){result.headers[k]=v;return res},
  status(n){result.status=n;return res},json(j){result.body=j;return res}};
 return {res,result};}
function call(req){const {res,result}=makeRes();
 createAuthCutoverReadinessHandler({runtimeEnv:()=>req.env})(req,res);return result;}

test('Stage 8 preflight accepts independent valid bindings without exposing values',()=>{
 const data=evaluateHardenedCutoverReadiness(good);
 assert.equal(data.state,'READY');
 assert.equal(data.ready,true);
 assert.deepEqual(data.holds,[]);
 const serialized=JSON.stringify(data);
 for(const v of Object.values(good))assert.equal(serialized.includes(v),false);
});
test('Missing, short, malformed, copied, legacy and shared hashes fail closed',()=>{
 const legacy='11c5ab3591e9d8c06eeac2afa5d6639021b569e46ae1efbb74f8dc4b81bf08d1';
 const bad=[
  {...good,VAOS_SESSION_HMAC_KEY:undefined},
  {...good,VAOS_SESSION_HMAC_KEY:'ab'.repeat(16)},
  {...good,VAOS_SESSION_HMAC_KEY:'!'.repeat(64)},
  {...good,VAOS_SESSION_HMAC_KEY:good.VAOS_DEV_LOGIN_PASSWORD_SHA256},
  {...good,VAOS_SESSION_HMAC_KEY:good.VAOS_DEV_CHECKER_PASSWORD_SHA256},
  {...good,VAOS_DEV_LOGIN_PASSWORD_SHA256:legacy},
  {...good,VAOS_DEV_CHECKER_PASSWORD_SHA256:undefined},
  {...good,VAOS_DEV_CHECKER_PASSWORD_SHA256:legacy},
  {...good,VAOS_DEV_CHECKER_PASSWORD_SHA256:good.VAOS_DEV_LOGIN_PASSWORD_SHA256},
  {...good,VAOS_DEV_LOGIN_PASSWORD_SHA256:'wrong'},
 ];
 for(const env of bad){
  const data=evaluateHardenedCutoverReadiness(env);
  assert.equal(data.state,'HOLD');
  assert.equal(data.ready,false);
  assert.ok(data.holds.length>=1);
 }
});
test('Unauthenticated or checker cannot access live configuration assessment',()=>{
 const absent=call(makeReq({email:null}));
 const checkerResponse=call(makeReq({email:checker}));
 assert.equal(absent.status,401);assert.equal(checkerResponse.status,403);
 assert.equal(absent.body.ready,undefined);
 assert.equal(checkerResponse.body.ready,undefined);
});
test('Authenticated founder sees only booleans/status/hold reasons',()=>{
 const response=call(makeReq());
 assert.equal(response.status,200);assert.equal(response.result,undefined);
 assert.equal(response.body.data.state,'READY');
 assert.equal(response.body.data.productionCutoverAuthorized,false);
 assert.equal(response.body.data.authenticatedSignInQualified,false);
 assert.equal(response.body.data.actionAuthorized,false);
 assert.equal(response.headers['Cache-Control'],'no-store');
 const json=JSON.stringify(response);
 for(const v of Object.values(good))assert.equal(json.includes(v),false);
});
test('Preflight is GET-only and cannot enable hardening or mutate env',()=>{
 const copied={...good};
 const response=call(makeReq({method:'POST',env:copied}));
 assert.equal(response.status,405);
 assert.deepEqual(copied,good);
 const hold=call(makeReq({env:{...good,VAOS_SESSION_HMAC_KEY:undefined}}));
 assert.equal(hold.status,200);assert.equal(hold.body.data.state,'HOLD');
 assert.equal(hold.body.data.productionCutoverAuthorized,false);
});

test('Stage 8 live preflight fails on runtime/Worker binding mismatch without exposing values',()=>{
 const req=makeReq();
 const {res,result}=makeRes();
 createAuthCutoverReadinessHandler({runtimeEnv:()=>({...good,VAOS_SESSION_HMAC_KEY:'ca'.repeat(32)})})(req,res);
 assert.equal(result.status,200);
 assert.equal(result.body.data.state,'HOLD');
 assert.ok(result.body.data.holds.includes('RUNTIME_BINDING_MISMATCH'));
 for(const value of Object.values(good))assert.equal(JSON.stringify(result).includes(value),false);
});

import crypto from 'node:crypto';
import {assessStage8Evidence,STAGE8_REQUIRED_CHECKS} from '../lib/stage8-qualification-evidence.mjs';

function makeQualification({key='bc'.repeat(32),environment='development',revision='sha-test-1',issuedAt=Date.now(),checks}={}){
 const record={version:1,environment,revision,issuedAt,expiresAt:issuedAt+60000,
  checks:checks??Object.fromEntries(STAGE8_REQUIRED_CHECKS.map(name=>[name,true])),
  maker,checker};
 const canonical=JSON.stringify({version:1,environment:record.environment,revision:record.revision,
  issuedAt:record.issuedAt,expiresAt:record.expiresAt,
  checks:STAGE8_REQUIRED_CHECKS.map(name=>[name,record.checks[name]]),
  maker:record.maker,checker:record.checker});
 const signature=crypto.createHmac('sha256',Buffer.from(key,'hex')).update(canonical).digest('hex');
 return JSON.stringify({record,signature});
}
test('Stage 8 does not qualify with missing evidence',()=>{
 const x=assessStage8Evidence(undefined,{key:'bc'.repeat(32),environment:'development',revision:'sha-test-1'});
 assert.equal(x.qualified,false);
});
test('Stage 8 accepts a fully signed bounded evidence record, but no production authorization',()=>{
 const env={...good,VAOS_STAGE8_EVIDENCE_SIGNING_KEY:'bc'.repeat(32),
 VAOS_STAGE8_QUALIFICATION_REVISION:'sha-test-1',
 VAOS_STAGE8_QUALIFICATION_EVIDENCE:makeQualification()};
 const result=call(makeReq({env}));
 assert.equal(result.status,200);
 assert.equal(result.body.data.authenticatedSignInQualified,true);
 assert.equal(result.body.data.qualificationEvidenceStatus,'VERIFIED');
 assert.equal(result.body.data.productionCutoverAuthorized,false);
 assert.equal(result.body.data.actionAuthorized,false);
});
test('Stage 8 rejects tampered, expired, wrong-environment, wrong-revision and incomplete evidence',()=>{
 const key='bc'.repeat(32),scope={key,environment:'development',revision:'sha-test-1'};
 const goodEvidence=makeQualification();
 const cases=[
  goodEvidence.replace('sha-test-1','sha-test-2'),
  makeQualification({environment:'production'}),
  makeQualification({revision:'other'}),
  makeQualification({issuedAt:Date.now()-2*60*60*1000}),
  makeQualification({checks:{...Object.fromEntries(STAGE8_REQUIRED_CHECKS.map(name=>[name,true])),audit_readback:false}})
 ];
 for(const raw of cases)assert.equal(assessStage8Evidence(raw,scope).qualified,false);
});
test('Stage 8 cannot qualify when a preflight hold exists even with valid evidence',()=>{
 const env={...good,VAOS_DEV_CHECKER_PASSWORD_SHA256:undefined,
  VAOS_STAGE8_EVIDENCE_SIGNING_KEY:'bc'.repeat(32),
  VAOS_STAGE8_QUALIFICATION_REVISION:'sha-test-1',
  VAOS_STAGE8_QUALIFICATION_EVIDENCE:makeQualification()};
 const result=call(makeReq({env}));
 assert.equal(result.body.data.ready,false);
 assert.equal(result.body.data.authenticatedSignInQualified,false);
});
