// Stage 8: prepare a scoped Wrangler bulk-secret update after independent verification.
// No authentication toggle is written. A caller must control production deployment.
import {readFile,writeFile,chmod} from 'node:fs/promises';
import {planStage8CertificateInstall} from './stage8-certificate-install-preflight.mjs';
export function createStage8BulkPayload({authEnvelope,cutoverEnvelope,authKey,cutoverKey,revision,now}){
 const plan=planStage8CertificateInstall({authEnvelope,cutoverEnvelope,authKey,cutoverKey,revision,now});
 const payload={
  VAOS_STAGE8_QUALIFICATION_EVIDENCE:authEnvelope,
  VAOS_STAGE8_QUALIFICATION_REVISION:plan.revision,
  VAOS_STAGE8_CUTOVER_APPROVAL:cutoverEnvelope
 };
 if(Object.keys(payload).sort().join('|')!==[...plan.requiredBindings].sort().join('|'))
  throw Error('STAGE8_BINDING_ALLOWLIST_VIOLATION');
 return {payload,revision:plan.revision,expiresAt:plan.expiresAt};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const [authEnvelope,cutoverEnvelope]=await Promise.all([
  readFile('stage8-signed-qualification.json','utf8'),
  readFile('stage8-signed-cutover.json','utf8')]);
 const {payload,revision,expiresAt}=createStage8BulkPayload({authEnvelope,cutoverEnvelope,
  authKey:process.env.VAOS_STAGE8_EVIDENCE_SIGNING_KEY,
  cutoverKey:process.env.VAOS_STAGE8_CUTOVER_APPROVAL_SIGNING_KEY,
  revision:JSON.parse(authEnvelope).record.revision});
 const target=process.env.STAGE8_BULK_SECRET_FILE;
 if(!target||!target.startsWith(process.env.RUNNER_TEMP+'/'))throw Error('STAGE8_SECURE_TEMP_PATH_REQUIRED');
 await writeFile(target,JSON.stringify(payload),{mode:0o600,flag:'wx'});
 await chmod(target,0o600);
 console.log('STAGE8_BULK_CERTIFICATE_PACKAGE_VERIFIED',revision,new Date(expiresAt).toISOString());
}
