import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import login from '../api/login.mjs';
import {createSessionToken,verifySessionToken,sha256,SESSION_COOKIE,SESSION_TTL_SECONDS} from '../lib/auth.mjs';

const vars=['VAOS_AUTH_HARDENED_CONTROL','VAOS_SESSION_HMAC_KEY','VAOS_DEV_LOGIN_PASSWORD_SHA256','VAOS_DEV_CHECKER_PASSWORD_SHA256'];
const maker='shyamsundhar1982@gmail.com',checker='kaaviyam1519@gmail.com';
const pwMaker='ISOLATED-SYNTHETIC-MAKER-7',pwChecker='ISOLATED-SYNTHETIC-CHECKER-9';
function isolated(fn){
 const before=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
 try{
  process.env.VAOS_AUTH_HARDENED_CONTROL='dedicated-hmac-v1';
  process.env.VAOS_SESSION_HMAC_KEY=crypto.randomBytes(32).toString('hex');
  process.env.VAOS_DEV_LOGIN_PASSWORD_SHA256=sha256(pwMaker);
  process.env.VAOS_DEV_CHECKER_PASSWORD_SHA256=sha256(pwChecker);
  return fn();
 }finally{for(const k of vars){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}}
}
function signIn(email,password){
 const out={status:200,headers:{},body:null};
 const res={setHeader(k,v){out.headers[k]=v;return res},
  status(c){out.status=c;return res},
  json(v){out.body=v;return res}};
 login({method:'POST',headers:{},body:{email,password}},res);
 return out;
}
function tokenOf(r){
 const raw=r.headers['Set-Cookie']||'';
 assert.match(raw,/HttpOnly/);assert.match(raw,/SameSite=Strict/);assert.match(raw,/Secure/);
 const first=raw.split(';')[0];
 assert.equal(first.startsWith(SESSION_COOKIE+'='),true);
 return decodeURIComponent(first.substring(SESSION_COOKIE.length+1));
}
test('isolated founder and checker logins work with separate random HMAC and synthetic credential digests',()=>{
 isolated(()=>{
  for(const [email,pw] of [[maker,pwMaker],[checker,pwChecker]]){
   const result=signIn(email,pw);
   assert.equal(result.status,200);
   assert.equal(verifySessionToken(tokenOf(result))?.email,email);
  }
  assert.equal(signIn(maker,pwChecker).status,401);
  assert.equal(signIn(checker,pwMaker).status,401);
  assert.equal(signIn('unknown@example.org',pwMaker).status,401);
 });
});
test('legacy cookies become invalid at cutover; disabling control is an explicit rollback',()=>{
 isolated(()=>{
  delete process.env.VAOS_AUTH_HARDENED_CONTROL;
  const legacy=createSessionToken(maker);
  assert.equal(verifySessionToken(legacy)?.email,maker);
  process.env.VAOS_AUTH_HARDENED_CONTROL='dedicated-hmac-v1';
  assert.equal(verifySessionToken(legacy),null);
  const hardened=tokenOf(signIn(maker,pwMaker));
  assert.equal(verifySessionToken(hardened)?.v,2);
  delete process.env.VAOS_AUTH_HARDENED_CONTROL;
  assert.equal(verifySessionToken(legacy)?.email,maker);
  assert.equal(verifySessionToken(hardened),null);
 });
});
test('rotation revokes hardened sessions and does not accept old signing key',()=>{
 isolated(()=>{
  const token=tokenOf(signIn(maker,pwMaker));
  process.env.VAOS_SESSION_HMAC_KEY=crypto.randomBytes(32).toString('hex');
  assert.equal(verifySessionToken(token),null);
  assert.equal(verifySessionToken(tokenOf(signIn(maker,pwMaker)))?.email,maker);
 });
});
test('invalid or shared signer never permits synthetic sign-in; expiry remains bounded',()=>{
 isolated(()=>{
  const signer=process.env.VAOS_SESSION_HMAC_KEY;
  for(const bad of ['', '0'.repeat(20), 'x'.repeat(64), process.env.VAOS_DEV_LOGIN_PASSWORD_SHA256,
    process.env.VAOS_DEV_CHECKER_PASSWORD_SHA256]){
   process.env.VAOS_SESSION_HMAC_KEY=bad;
   assert.notEqual(signIn(maker,pwMaker).status,200);
  }
  process.env.VAOS_SESSION_HMAC_KEY=signer;
  const token=createSessionToken(maker,60,1000000);
  assert.equal(verifySessionToken(token,1001000)?.email,maker);
  assert.equal(verifySessionToken(token,1061000),null);
  assert.throws(()=>createSessionToken(maker,SESSION_TTL_SECONDS+1,1000000));
 });
});

test('hardening rejects the publicly known legacy maker digest even with a strong HMAC key',()=>{
 isolated(()=>{
  process.env.VAOS_DEV_LOGIN_PASSWORD_SHA256='11c5ab3591e9d8c06eeac2afa5d6639021b569e46ae1efbb74f8dc4b81bf08d1';
  assert.throws(()=>createSessionToken(maker,60,1000000),/HARDENED_AUTH_CONFIG/);
  assert.notEqual(signIn(maker,pwMaker).status,200);
 });
});
test('hardening requires distinct, configured maker and checker credential hashes',()=>{
 isolated(()=>{
  const original=process.env.VAOS_DEV_CHECKER_PASSWORD_SHA256;
  delete process.env.VAOS_DEV_CHECKER_PASSWORD_SHA256;
  assert.throws(()=>createSessionToken(maker,60,1000000),/HARDENED_AUTH_CONFIG/);
  process.env.VAOS_DEV_CHECKER_PASSWORD_SHA256=process.env.VAOS_DEV_LOGIN_PASSWORD_SHA256;
  assert.throws(()=>createSessionToken(maker,60,1000000),/HARDENED_AUTH_CONFIG/);
  process.env.VAOS_DEV_CHECKER_PASSWORD_SHA256=original;
  assert.equal(verifySessionToken(createSessionToken(maker,60,1000000),1001000)?.email,maker);
 });
});
