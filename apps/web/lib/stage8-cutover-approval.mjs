import crypto from 'node:crypto';
const SHA=/^[a-f0-9]{64}$/i;
const REV=/^[a-f0-9]{40}$/i;
const TTL=15*60*1000;
function payload(r){return JSON.stringify({version:1,revision:r.revision,issuedAt:r.issuedAt,
 expiresAt:r.expiresAt,founderAuthorized:r.founderAuthorized,
 rollbackQualified:r.rollbackQualified,emergencyDisableQualified:r.emergencyDisableQualified,
 businessWritesAllowed:r.businessWritesAllowed});}
export function assessStage8Cutover(raw,{key,revision,now=Date.now()}={}){
 const fail=reason=>Object.freeze({authorized:false,reason});
 if(typeof raw!=='string'||raw.length>4096)return fail('CUTOVER_APPROVAL_MISSING');
 if(typeof key!=='string'||!SHA.test(key))return fail('CUTOVER_KEY_INVALID');
 if(!REV.test(revision||''))return fail('CUTOVER_REVISION_INVALID');
 try{
  const {record,signature}=JSON.parse(raw);
  if(!record||typeof signature!=='string'||!SHA.test(signature))return fail('CUTOVER_APPROVAL_INVALID');
  const expected=crypto.createHmac('sha256',Buffer.from(key,'hex')).update(payload(record)).digest('hex');
  if(!crypto.timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex')))return fail('CUTOVER_SIGNATURE_INVALID');
  if(record.version!==1||record.revision!==revision)return fail('CUTOVER_SCOPE_MISMATCH');
  if(!Number.isSafeInteger(record.issuedAt)||!Number.isSafeInteger(record.expiresAt)
   ||record.issuedAt>now||record.expiresAt<=now||record.expiresAt-record.issuedAt>TTL
   ||now-record.issuedAt>TTL)return fail('CUTOVER_APPROVAL_EXPIRED');
  if(record.founderAuthorized!==true||record.rollbackQualified!==true
   ||record.emergencyDisableQualified!==true||record.businessWritesAllowed!==false)
   return fail('CUTOVER_SAFETY_GATES_INCOMPLETE');
  return Object.freeze({authorized:true,reason:null});
 }catch{return fail('CUTOVER_APPROVAL_INVALID');}
}
