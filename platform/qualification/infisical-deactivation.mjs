function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function req(value,name){if(typeof value!=='string'||!value.trim())throw fail('INFISICAL_DISABLE_INPUT_INVALID','INFISICAL_DISABLE_INPUT_INVALID:'+name);return value.trim()}
export async function disableInfisicalProvider({controlPlane,authorityRef,reason}={}){
  if(!controlPlane||typeof controlPlane.setCapabilityEnabled!=='function'||typeof controlPlane.setProviderEnabled!=='function'||typeof controlPlane.snapshot!=='function'){
    throw fail('INFISICAL_DISABLE_CONTROL_PLANE_REQUIRED');
  }
  authorityRef=req(authorityRef,'authorityRef');reason=req(reason,'reason');
  await controlPlane.setCapabilityEnabled({providerId:'infisical',capability:'secret.broker',enabled:false,authorityRef,reason});
  await controlPlane.setProviderEnabled({providerId:'infisical',enabled:false,authorityRef,reason});
  const snapshot=controlPlane.snapshot('infisical');
  if(snapshot?.providerId!=='infisical'||snapshot.enabled!==false||snapshot.capabilityEnabled?.['secret.broker']!==false){
    throw fail('INFISICAL_DISABLE_STATE_MISMATCH');
  }
  return Object.freeze({disabled:true,providerId:'infisical',capability:'secret.broker',snapshot:Object.freeze({enabled:false,capabilityEnabled:Object.freeze({...snapshot.capabilityEnabled})})});
}
