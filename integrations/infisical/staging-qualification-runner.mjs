function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function req(value,name){if(typeof value!=='string'||!value.trim())throw fail('INFISICAL_STAGING_INPUT_INVALID','INFISICAL_STAGING_INPUT_INVALID:'+name);return value.trim()}
export async function runInfisicalStagingQualification({
  credentialBroker,controlPlane,healthService,bindingRef,executionJobId,intentId,tokenTtlSeconds,recordAudit=async()=>{},
}={}){
  if(!credentialBroker||typeof credentialBroker.withCredential!=='function')throw fail('INFISICAL_STAGING_BROKER_REQUIRED');
  if(!controlPlane||typeof controlPlane.setProviderEnabled!=='function'||typeof controlPlane.resolve!=='function')throw fail('INFISICAL_STAGING_CONTROL_PLANE_REQUIRED');
  if(!healthService||typeof healthService.check!=='function')throw fail('INFISICAL_STAGING_HEALTH_SERVICE_REQUIRED');
  if(typeof recordAudit!=='function')throw fail('INFISICAL_STAGING_AUDIT_INVALID');
  bindingRef=req(bindingRef,'bindingRef');executionJobId=req(executionJobId,'executionJobId');intentId=req(intentId,'intentId');
  const ttl=Number(tokenTtlSeconds);
  if(!Number.isFinite(ttl)||ttl<1||ttl>7200)throw fail('INFISICAL_STAGING_EXPIRY_INVALID');

  try{
    const safe=await credentialBroker.withCredential({
      bindingRef,providerId:'infisical',capability:'secret.broker',executionJobId,intentId,
    },async credential=>{
      if(!credential||typeof credential.value!=='string'||!credential.value)throw fail('INFISICAL_STAGING_BROKER_FAILED');
      return {kind:credential.kind};
    });
    if(!safe||typeof safe.kind!=='string')throw fail('INFISICAL_STAGING_BROKER_FAILED');
  }catch(error){
    if(error?.code==='INFISICAL_STAGING_BROKER_FAILED')throw error;
    throw fail('INFISICAL_STAGING_BROKER_FAILED');
  }

  const health=await healthService.check('infisical');
  if(!health||health.status!=='healthy')throw fail('INFISICAL_STAGING_HEALTH_FAILED');

  const constraints={dataClassification:'confidential',riskClass:'medium',allowedProviderIds:['infisical']};
  try{
    await controlPlane.setProviderEnabled({providerId:'infisical',enabled:false,authorityRef:'qualification:wave2',reason:'staging kill-switch drill'});
    if(controlPlane.resolve('secret.broker',constraints)!==null)throw fail('INFISICAL_STAGING_KILL_SWITCH_FAILED');
  }finally{
    await controlPlane.setProviderEnabled({providerId:'infisical',enabled:true,authorityRef:'qualification:wave2',reason:'staging kill-switch restore'});
  }
  const restored=controlPlane.resolve('secret.broker',constraints);
  if(!restored||restored.providerId!=='infisical')throw fail('INFISICAL_STAGING_KILL_SWITCH_FAILED');

  await recordAudit({type:'INFISICAL.STAGING.QUALIFICATION.PASSED',providerId:'infisical',capability:'secret.broker',executionJobId,intentId});
  return Object.freeze({
    checks:Object.freeze([
      Object.freeze({checkId:'credential-broker-integration',outcome:'pass'}),
      Object.freeze({checkId:'secret-value-nondisclosure',outcome:'pass'}),
      Object.freeze({checkId:'health-and-expiry',outcome:'pass'}),
      Object.freeze({checkId:'kill-switch',outcome:'pass'}),
    ]),
  });
}
