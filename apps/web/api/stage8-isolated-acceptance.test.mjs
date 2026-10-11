import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import login from './login.mjs';
import session from './session.mjs';
import logout from './logout.mjs';
import {sha256,createSessionToken,verifySessionToken,SESSION_COOKIE} from '../lib/auth.mjs';

const MAKER='shyamsundhar1982@gmail.com';
const CHECKER='kaaviyam1519@gmail.com';
const names=['VAOS_AUTH_HARDENED_CONTROL','VAOS_SESSION_HMAC_KEY',
 'VAOS_DEV_LOGIN_PASSWORD_SHA256','VAOS_DEV_CHECKER_PASSWORD_SHA256'];
async function isolated(fn){
 const prior=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 const passwords={maker:'test-maker-'+randomBytes(24).toString('hex'),
  checker:'test-checker-'+randomBytes(24).toString('hex')};
 try{
  process.env.VAOS_AUTH_HARDENED_CONTROL='dedicated-hmac-v1';
  process.env.VAOS_SESSION_HMAC_KEY=randomBytes(32).toString('hex');
  process.env.VAOS_DEV_LOGIN_PASSWORD_SHA256=sha256(passwords.maker);
  process.env.VAOS_DEV_CHECKER_PASSWORD_SHA256=sha256(passwords.checker);
  return await fn(passwords);
 }finally{
  for(const k of names){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];}
 }
}
async function invoke(handler,{method='GET',cookie='',body,env}={}){
 const out={status:200,headers:{},body:null};
 const res={
  setHeader(name,value){out.headers[name]=value;return res;},
  status(status){out.status=status;return res;},
  json(body){out.body=body;return res;}
 };
 await handler({method,headers:{cookie},body,env},res);
 return out;
}
function cookieOf(response){return response.headers['Set-Cookie']?.split(';')[0]||'';}

test('Stage 8 isolated hardened maker and checker login plus independent sessions',async()=>{
 await isolated(async passwords=>{
  const maker=await invoke(login,{method:'POST',body:{email:MAKER,password:passwords.maker}});
  const checker=await invoke(login,{method:'POST',body:{email:CHECKER,password:passwords.checker}});
  assert.equal(maker.status,200);
  assert.equal(checker.status,200);
  assert.notEqual(cookieOf(maker),cookieOf(checker));
  assert.equal((await invoke(session,{cookie:cookieOf(maker)})).body.email,MAKER);
  assert.equal((await invoke(session,{cookie:cookieOf(checker)})).body.email,CHECKER);
  for(const response of [maker,checker]){
   const header=response.headers['Set-Cookie'];
   for(const attribute of ['HttpOnly','Secure','SameSite=Strict'])assert.ok(header.includes(attribute));
  }
  assert.equal((await invoke(login,{method:'POST',body:{email:MAKER,password:passwords.checker}})).status,401);
  assert.equal((await invoke(login,{method:'POST',body:{email:CHECKER,password:passwords.maker}})).status,401);
 });
});
test('Stage 8 isolated expiry, tampering, legacy and environment-key separation',async()=>{
 await isolated(async passwords=>{
  const valid=await invoke(login,{method:'POST',body:{email:MAKER,password:passwords.maker}});
  const token=decodeURIComponent(cookieOf(valid).split('=')[1]);
  const [payload,sig]=token.split('.');
  const tampered=SESSION_COOKIE+'='+payload+'.'+(sig[0]==='a'?'b':'a')+sig.slice(1);
  assert.equal((await invoke(session,{cookie:tampered})).status,401);
  assert.equal(verifySessionToken(createSessionToken(MAKER,1,Date.now()-5000)),null);
  const before=process.env.VAOS_SESSION_HMAC_KEY;
  process.env.VAOS_SESSION_HMAC_KEY=randomBytes(32).toString('hex');
  assert.equal((await invoke(session,{cookie:cookieOf(valid)})).status,401);
  process.env.VAOS_SESSION_HMAC_KEY=before;
  assert.equal((await invoke(session,{cookie:cookieOf(valid)})).status,200);
 });
});
test('Stage 8 hardened logout revokes copied tokens durably and fails closed without storage',async()=>{
 await isolated(async passwords=>{
  const {revokeHardenedCookie,checkHardenedRevocation}=await import('../lib/session-revocation.mjs');
  const entries=new Map();
  const bucket={
   async put(key,value){entries.set(key,value);},
   async get(key){return entries.has(key)?{body:entries.get(key)}:null;}
  };
  const environment={VAOS_AUTH_HARDENED_CONTROL:'dedicated-hmac-v1',VAOS_ARTIFACTS:bucket};
  const response=await invoke(login,{method:'POST',body:{email:MAKER,password:passwords.maker}});
  const cookie=cookieOf(response);
  assert.equal((await checkHardenedRevocation(cookie,bucket)).revoked,false);
  const cleared=await invoke(logout,{method:'POST',cookie,env:environment});
  assert.equal(cleared.status,200);
  assert.ok(cleared.headers['Set-Cookie'].includes('Max-Age=0'));
  assert.equal((await checkHardenedRevocation(cookie,bucket)).revoked,true);
  assert.equal((await checkHardenedRevocation(cookie,{get:bucket.get})).revoked,true);
  const failed=await invoke(logout,{method:'POST',cookie,env:{...environment,VAOS_ARTIFACTS:null}});
  assert.equal(failed.status,503);
  assert.equal(failed.headers['Set-Cookie'],undefined);
 });
});
