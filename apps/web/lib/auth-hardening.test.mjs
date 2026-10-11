import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,verifySessionToken,verifyDevelopmentCredential,sha256} from './auth.mjs';
const keys=['VAOS_AUTH_HARDENED_CONTROL','VAOS_SESSION_HMAC_KEY','VAOS_DEV_LOGIN_PASSWORD_SHA256','VAOS_DEV_CHECKER_PASSWORD_SHA256'];
function withVars(vars,fn){
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  for(const k of keys){if(Object.hasOwn(vars,k)&&vars[k]!==undefined)process.env[k]=vars[k];
   else if(Object.hasOwn(vars,k))delete process.env[k]}
  return fn();
 }finally{
  for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k]}
 }
}
const control='dedicated-hmac-v1',hmac='ab'.repeat(32),founder='shyamsundhar1982@gmail.com';
test('Stage 8 turns off known legacy digest fallback when hardened gate is enabled',()=>{
 withVars({VAOS_AUTH_HARDENED_CONTROL:control,VAOS_SESSION_HMAC_KEY:hmac,
   VAOS_DEV_LOGIN_PASSWORD_SHA256:undefined},()=>{
   assert.equal(verifyDevelopmentCredential(founder,'unknown'),false);
   assert.throws(()=>createSessionToken(founder,60,1000000),/HARDENED_AUTH_CONFIG/);
 });
});
test('missing or weak independent HMAC key prevents issuing and verifying sessions',()=>{
 for(const key of [undefined,'short','11'.repeat(16),'z'.repeat(64)]){
  withVars({VAOS_AUTH_HARDENED_CONTROL:control,VAOS_SESSION_HMAC_KEY:key,
   VAOS_DEV_LOGIN_PASSWORD_SHA256:sha256('founder-strong-pass')},()=>{
   assert.throws(()=>createSessionToken(founder,60,1000000),/HARDENED_AUTH_CONFIG/);
   assert.equal(verifySessionToken('malformed',1001000),null);
  });
 }
});
test('Stage 8 HMAC is independent of password hashes and rejects old sessions',()=>{
 withVars({VAOS_AUTH_HARDENED_CONTROL:'off',VAOS_DEV_LOGIN_PASSWORD_SHA256:sha256('password-a')},()=>{
  const legacy=createSessionToken(founder,120,1000000);
  withVars({VAOS_AUTH_HARDENED_CONTROL:control,VAOS_SESSION_HMAC_KEY:hmac,
    VAOS_DEV_LOGIN_PASSWORD_SHA256:sha256('password-a')},()=>{
     assert.equal(verifySessionToken(legacy,1001000),null);
     const signed=createSessionToken(founder,120,1000000);
     assert.equal(verifySessionToken(signed,1001000)?.email,founder);
     process.env.VAOS_DEV_LOGIN_PASSWORD_SHA256=sha256('password-b');
     assert.equal(verifySessionToken(signed,1001000)?.email,founder);
     process.env.VAOS_SESSION_HMAC_KEY='cd'.repeat(32);
     assert.equal(verifySessionToken(signed,1001000),null);
  });
 });
});
test('Stage 8 tokens bind issued-at and version and enforce session TTL',()=>{
 withVars({VAOS_AUTH_HARDENED_CONTROL:control,VAOS_SESSION_HMAC_KEY:hmac,
  VAOS_DEV_LOGIN_PASSWORD_SHA256:sha256('strong-pass')},()=>{
  const token=createSessionToken(founder,120,1000000);
  const payload=JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString());
  assert.equal(payload.v,2);
  assert.equal(typeof payload.iat,'number');
  assert.equal(typeof payload.sid,'string');
  assert.equal(verifySessionToken(token,1001000)?.email,founder);
  assert.equal(verifySessionToken(token,1201000),null);
  assert.throws(()=>createSessionToken(founder,60*60*10,1000000),/HARDENED_AUTH_TTL_INVALID/);
 });
});
