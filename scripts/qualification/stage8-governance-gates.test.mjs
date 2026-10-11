import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createSessionToken,verifySessionToken,sha256} from '../../apps/web/lib/auth.mjs';
import {assessStage8Evidence} from '../../apps/web/lib/stage8-qualification-evidence.mjs';
import {evaluateHardenedCutoverReadiness} from '../../apps/web/api/auth-cutover-readiness.mjs';
const names=['VAOS_AUTH_HARDENED_CONTROL','VAOS_SESSION_HMAC_KEY','VAOS_DEV_LOGIN_PASSWORD_SHA256','VAOS_DEV_CHECKER_PASSWORD_SHA256'];
test('G3: isolated hardened cutover rollback rejects old tokens, restores independent sessions',()=>{
 const before=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 try{
  const maker=sha256('synthetic-maker-'+crypto.randomBytes(16).toString('hex'));
  const checker=sha256('synthetic-checker-'+crypto.randomBytes(16).toString('hex'));
  const key=crypto.randomBytes(32).toString('hex');
  process.env.VAOS_AUTH_HARDENED_CONTROL='dedicated-hmac-v1';
  process.env.VAOS_SESSION_HMAC_KEY=key;
  process.env.VAOS_DEV_LOGIN_PASSWORD_SHA256=maker;
  process.env.VAOS_DEV_CHECKER_PASSWORD_SHA256=checker;
  const p=evaluateHardenedCutoverReadiness(process.env);
  assert.equal(p.ready,true);
  assert.equal(p.productionCutoverAuthorized,false);
  const cookie=createSessionToken('shyamsundhar1982@gmail.com');
  assert.ok(verifySessionToken(cookie));
  process.env.VAOS_SESSION_HMAC_KEY=crypto.randomBytes(32).toString('hex');
  assert.equal(verifySessionToken(cookie),null,'old token invalid after signing-key rotation');
  process.env.VAOS_AUTH_HARDENED_CONTROL='disabled';
  assert.equal(verifySessionToken(cookie),null,'old hardened token cannot become legacy');
  process.env.VAOS_AUTH_HARDENED_CONTROL='dedicated-hmac-v1';
  const recovery=createSessionToken('kaaviyam1519@gmail.com');
  assert.ok(verifySessionToken(recovery),'new isolated hardened token signs after rollback');
 }finally{for(const k of names){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}}
});
test('G1/G2: unsigned and unscoped or stale evidence cannot qualify',()=>{
 const key=crypto.randomBytes(32).toString('hex');
 for(const sample of ['', '{}','{"record":{},"signature":"'+('a'.repeat(64))+'"}']){
  assert.equal(assessStage8Evidence(sample,{key,environment:'development',revision:'test'}).qualified,false);
 }
 assert.equal(evaluateHardenedCutoverReadiness({}).productionCutoverAuthorized,false);
});
