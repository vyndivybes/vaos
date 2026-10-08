function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function req(value,name){if(typeof value!=='string'||!value.trim())throw fail('INFISICAL_PRODUCTION_INPUT_INVALID','INFISICAL_PRODUCTION_INPUT_INVALID:'+name);return value.trim()}
function probe(input){if(!input||typeof input!=='object')throw fail('INFISICAL_PRODUCTION_INPUT_INVALID');return{projectId:req(input.projectId,'projectId'),environment:req(input.environment,'environment'),secretPath:req(input.secretPath,'secretPath'),secretKey:req(input.secretKey,'secretKey')}}
export async function runInfisicalProductionQualification({transport,clientId,revokedClientId=clientId,currentClientSecret,revokedClientSecret,allowedProbe,controlPlane}={}){
  if(!transport||typeof transport.universalLogin!=='function'||typeof transport.readSecret!=='function')throw fail('INFISICAL_PRODUCTION_TRANSPORT_REQUIRED');
  if(!controlPlane||typeof controlPlane.setProviderEnabled!=='function'||typeof controlPlane.resolve!=='function')throw fail('INFISICAL_PRODUCTION_CONTROL_PLANE_REQUIRED');
  clientId=req(clientId,'clientId');revokedClientId=req(revokedClientId,'revokedClientId');currentClientSecret=req(currentClientSecret,'currentClientSecret');revokedClientSecret=req(revokedClientSecret,'revokedClientSecret');
  if(currentClientSecret===revokedClientSecret)throw fail('INFISICAL_PRODUCTION_CREDENTIALS_NOT_ROTATED');
  const allowed=probe(allowedProbe);
  let current;
  try{current=await transport.universalLogin({clientId,clientSecret:currentClientSecret});await transport.readSecret({accessToken:current.accessToken,...allowed})}
  catch{throw fail('INFISICAL_PRODUCTION_ROTATED_CREDENTIAL_FAILED')}
  let revokedBlocked=false;
  try{await transport.universalLogin({clientId:revokedClientId,clientSecret:revokedClientSecret})}
  catch(error){if(error?.code==='INFISICAL_AUTH_FAILED')revokedBlocked=true;else throw fail('INFISICAL_PRODUCTION_REVOKED_CREDENTIAL_UNVERIFIED')}
  if(!revokedBlocked)throw fail('INFISICAL_PRODUCTION_REVOKED_CREDENTIAL_STILL_VALID');
  await controlPlane.setProviderEnabled({providerId:'infisical',enabled:false,authorityRef:'qualification:wave2',reason:'production rollback drill'});
  if(controlPlane.resolve('secret.broker',{dataClassification:'confidential',riskClass:'medium',allowedProviderIds:['infisical']})!==null)throw fail('INFISICAL_PRODUCTION_ROLLBACK_FAILED');
  return Object.freeze({checks:Object.freeze([Object.freeze({checkId:'bootstrap-credential-rotation',outcome:'pass'}),Object.freeze({checkId:'rollback-drill',outcome:'pass'})])});
}
