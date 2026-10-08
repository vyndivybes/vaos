const SHA=/^[0-9a-f]{7,64}$/i;
const RUN_ID=/^[0-9]+$/;
const REF=/^github-actions:[0-9]+:[a-z0-9._-]+:[a-z0-9._-]+$/i;
const OUTCOMES=new Set(['pass','fail']);
function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function req(input,key,code='PROVIDER_LIVE_EVIDENCE_INVALID'){
  const v=input?.[key];
  if(typeof v!=='string'||!v.trim())throw fail(code,`${code}:${key}`);
  return v.trim();
}
function clone(v){return structuredClone(v)}
function freezeDeep(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const child of Object.values(value))freezeDeep(child);
  return Object.freeze(value);
}
export function validateProviderLiveEvidence(input={}){
  if(input.schemaVersion!=='vaos.provider-live-evidence.v1')throw fail('PROVIDER_LIVE_EVIDENCE_INVALID','PROVIDER_LIVE_EVIDENCE_INVALID:schemaVersion');
  if(input.productionActivation!==false)throw fail('PROVIDER_LIVE_EVIDENCE_ACTIVATION_FORBIDDEN');
  const providerId=req(input,'providerId');
  const capability=req(input,'capability');
  const waveId=req(input,'waveId');
  const evidenceClass=req(input,'evidenceClass');
  if(evidenceClass!=='live')throw fail('PROVIDER_LIVE_EVIDENCE_INVALID','PROVIDER_LIVE_EVIDENCE_INVALID:evidenceClass');
  const runtimeVersion=req(input,'runtimeVersion');
  const createdAt=req(input,'createdAt');
  if(Number.isNaN(new Date(createdAt).getTime()))throw fail('PROVIDER_LIVE_EVIDENCE_INVALID','PROVIDER_LIVE_EVIDENCE_INVALID:createdAt');
  const s=input.source;
  if(!s||s.type!=='github-actions'||!RUN_ID.test(String(s.runId||''))||typeof s.runUrl!=='string'||!/^https:\/\/github\.com\//.test(s.runUrl)||!SHA.test(String(s.commitSha||''))){
    throw fail('PROVIDER_LIVE_EVIDENCE_INVALID','PROVIDER_LIVE_EVIDENCE_INVALID:source');
  }
  if(!Array.isArray(input.checks)||input.checks.length===0)throw fail('PROVIDER_LIVE_EVIDENCE_INVALID','PROVIDER_LIVE_EVIDENCE_INVALID:checks');
  const seen=new Set();
  const checks=input.checks.map(row=>{
    const checkId=req(row,'checkId');
    if(seen.has(checkId))throw fail('PROVIDER_LIVE_EVIDENCE_INVALID','PROVIDER_LIVE_EVIDENCE_INVALID:duplicateCheck');
    seen.add(checkId);
    if(!OUTCOMES.has(row.outcome))throw fail('PROVIDER_LIVE_EVIDENCE_INVALID','PROVIDER_LIVE_EVIDENCE_INVALID:outcome');
    const evidenceRef=req(row,'evidenceRef');
    if(!REF.test(evidenceRef))throw fail('PROVIDER_LIVE_EVIDENCE_INVALID','PROVIDER_LIVE_EVIDENCE_INVALID:evidenceRef');
    const expectedPrefix=`github-actions:${s.runId}:${providerId}:`;
    if(!evidenceRef.startsWith(expectedPrefix))throw fail('PROVIDER_LIVE_EVIDENCE_INVALID','PROVIDER_LIVE_EVIDENCE_INVALID:evidenceRef');
    return {checkId,outcome:row.outcome,evidenceRef};
  });
  return freezeDeep(clone({
    schemaVersion:'vaos.provider-live-evidence.v1',waveId,providerId,capability,evidenceClass,
    runtimeVersion,
    source:{type:'github-actions',runId:String(s.runId),runUrl:s.runUrl,commitSha:String(s.commitSha)},
    createdAt:new Date(createdAt).toISOString(),
    checks,
    productionActivation:false,
  }));
}
export async function ingestProviderLiveEvidence({engine,bundle,authorityRef}={}){
  if(!engine||typeof engine.recordEvidence!=='function')throw fail('PROVIDER_LIVE_EVIDENCE_ENGINE_REQUIRED');
  if(typeof authorityRef!=='string'||!authorityRef.trim())throw fail('PROVIDER_LIVE_EVIDENCE_AUTHORITY_REQUIRED');
  const validated=validateProviderLiveEvidence(bundle);
  for(const check of validated.checks){
    await engine.recordEvidence({
      providerId:validated.providerId,
      capability:validated.capability,
      checkId:check.checkId,
      outcome:check.outcome,
      evidenceClass:'live',
      evidenceRefs:[check.evidenceRef,validated.source.runUrl],
      authorityRef:authorityRef.trim(),
    });
  }
  return Object.freeze({providerId:validated.providerId,capability:validated.capability,recordedChecks:validated.checks.length});
}
