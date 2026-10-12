// Safe Stage 8 deployment plan: check scope, expiry, and key parity before touching production.
// This module intentionally does not mutate Worker bindings.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assessStage8Evidence} from '../../apps/web/lib/stage8-qualification-evidence.mjs';
import {assessStage8Cutover} from '../../apps/web/lib/stage8-cutover-approval.mjs';
export function planStage8CertificateInstall({authEnvelope,cutoverEnvelope,authKey,cutoverKey,
 revision,now=Date.now()}){
 assert.match(revision||'',/^[a-f0-9]{40}$/i);
 const auth=assessStage8Evidence(authEnvelope,{key:authKey,environment:'development',revision,now});
 const cutover=assessStage8Cutover(cutoverEnvelope,{key:cutoverKey,revision,now});
 if(!auth.qualified||!cutover.authorized)
  throw Error('STAGE8_INSTALL_HOLD_'+(auth.reason||cutover.reason));
 const a=JSON.parse(authEnvelope).record,c=JSON.parse(cutoverEnvelope).record;
 if(a.revision!==c.revision||a.revision!==revision)throw Error('STAGE8_REVISION_MISMATCH');
 const ttl=Math.min(a.expiresAt,c.expiresAt)-now;
 if(ttl<120000)throw Error('STAGE8_CERTIFICATE_LIFETIME_TOO_SHORT');
 return Object.freeze({revision,expiresAt:Math.min(a.expiresAt,c.expiresAt),
  requiredBindings:Object.freeze(['VAOS_STAGE8_QUALIFICATION_EVIDENCE',
   'VAOS_STAGE8_CERTIFIED_REVISION','VAOS_STAGE8_CUTOVER_APPROVAL']),
  productionAuthToggleAllowed:false,businessWritesAllowed:false});
}
if(import.meta.url===new URL('file://'+process.argv[1]).href){
 const [authEnvelope,cutoverEnvelope]=await Promise.all([
  readFile('stage8-signed-qualification.json','utf8'),
  readFile('stage8-signed-cutover.json','utf8')]);
 const plan=planStage8CertificateInstall({authEnvelope,cutoverEnvelope,
  authKey:process.env.VAOS_STAGE8_EVIDENCE_SIGNING_KEY,
  cutoverKey:process.env.VAOS_STAGE8_CUTOVER_APPROVAL_SIGNING_KEY,
  revision:process.env.STAGE8_QUALIFIED_REVISION});
 console.log('STAGE8_INSTALL_PREFLIGHT_PASS',JSON.stringify(plan));
}
