import crypto from 'node:crypto';

// Stage 8 evidence is provided by a separate trusted qualification process.
// This module NEVER creates or signs qualification evidence.
const CHECKS=Object.freeze([
 'maker_sign_in','checker_sign_in','session_isolation','invalid_signature_rejected',
 'expired_session_rejected','logout_rejected','environment_isolation','audit_readback'
]);
const MAX_AGE_MS=60*60*1000;
const SHA256=/^[a-f0-9]{64}$/i;
function canonical(record){
 return JSON.stringify({
  version:1,environment:record.environment,revision:record.revision,
  issuedAt:record.issuedAt,expiresAt:record.expiresAt,
  checks:CHECKS.map(name=>[name,record.checks[name]]),
  maker:record.maker,checker:record.checker
 });
}
export function assessStage8Evidence(raw, {key, environment, revision, now=Date.now()}={}){
 const fail=(reason)=>Object.freeze({qualified:false,reason});
 if(typeof raw!=='string'||raw.length>8192)return fail('EVIDENCE_MISSING_OR_OVERSIZE');
 if(typeof key!=='string'||!SHA256.test(key))return fail('EVIDENCE_KEY_INVALID');
 try {
  const envelope=JSON.parse(raw);
  if(!envelope||Array.isArray(envelope)||typeof envelope!=='object')return fail('EVIDENCE_INVALID');
  const {record,signature}=envelope;
  if(!record||Array.isArray(record)||typeof record!=='object'||typeof signature!=='string'||!SHA256.test(signature))return fail('EVIDENCE_INVALID');
  const expected=crypto.createHmac('sha256',Buffer.from(key,'hex')).update(canonical(record)).digest('hex');
  if(!crypto.timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signature,'hex')))return fail('EVIDENCE_SIGNATURE_INVALID');
  if(record.version!==1||record.environment!==environment||!environment||record.revision!==revision||!revision)return fail('EVIDENCE_SCOPE_MISMATCH');
  if(!Number.isSafeInteger(record.issuedAt)||!Number.isSafeInteger(record.expiresAt)
     ||record.issuedAt>now||record.expiresAt<=now||record.expiresAt-record.issuedAt>MAX_AGE_MS
     ||now-record.issuedAt>MAX_AGE_MS)return fail('EVIDENCE_EXPIRED');
  if(!record.checks||CHECKS.some(name=>record.checks[name]!==true))return fail('EVIDENCE_CHECKS_INCOMPLETE');
  if(record.maker!=='shyamsundhar1982@gmail.com'||record.checker!=='kaaviyam1519@gmail.com'
    ||record.maker===record.checker)return fail('EVIDENCE_ROLES_INVALID');
  return Object.freeze({qualified:true,reason:null});
 } catch {return fail('EVIDENCE_INVALID');}
}
export const STAGE8_REQUIRED_CHECKS=CHECKS;
