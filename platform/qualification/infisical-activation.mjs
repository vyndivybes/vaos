function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function req(value,name){if(typeof value!=='string'||!value.trim())throw fail('INFISICAL_ACTIVATION_INPUT_INVALID','INFISICAL_ACTIVATION_INPUT_INVALID:'+name);return value.trim()}
export async function activateInfisicalProvider({healthService,engine,controlPlane,authorityRef,reason}={}){
  if(!healthService||typeof healthService.check!=='function')throw fail('INFISICAL_ACTIVATION_HEALTH_SERVICE_REQUIRED');
  if(!engine||typeof engine.activate!=='function')throw fail('INFISICAL_ACTIVATION_ENGINE_REQUIRED');
  if(!controlPlane||typeof controlPlane.snapshot!=='function')throw fail('INFISICAL_ACTIVATION_CONTROL_PLANE_REQUIRED');
  authorityRef=req(authorityRef,'authorityRef');reason=req(reason,'reason');
  const health=await healthService.check('infisical');
  if(!health||health.status!=='healthy')throw fail('INFISICAL_ACTIVATION_HEALTH_FAILED');
  await engine.activate({
    providerId:'infisical',
    capability:'secret.broker',
    authorityRef,
    reason,
  });
  const snapshot=controlPlane.snapshot('infisical');
  if(
    snapshot?.providerId!=='infisical'
    || snapshot.enabled!==true
    || snapshot.capabilityEnabled?.['secret.broker']!==true
  )throw fail('INFISICAL_ACTIVATION_STATE_MISMATCH');
  return Object.freeze({
    activated:true,
    providerId:'infisical',
    capability:'secret.broker',
    snapshot:Object.freeze({
      enabled:snapshot.enabled,
      capabilityEnabled:Object.freeze({...snapshot.capabilityEnabled}),
      qualification:Object.freeze({...snapshot.qualification}),
      health:snapshot.health?Object.freeze({...snapshot.health}):null,
    }),
  });
}
