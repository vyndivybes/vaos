function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function req(input,key){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw fail('INFISICAL_QUALIFICATION_INPUT_INVALID','INFISICAL_QUALIFICATION_INPUT_INVALID:'+key);return v.trim()}
function normalizeProbe(input,key){const p=input?.[key];if(!p||typeof p!=='object')throw fail('INFISICAL_QUALIFICATION_INPUT_INVALID','INFISICAL_QUALIFICATION_INPUT_INVALID:'+key);return Object.freeze({projectId:req(p,'projectId'),environment:req(p,'environment'),secretPath:req(p,'secretPath'),secretKey:req(p,'secretKey')})}
export async function runInfisicalEphemeralQualification({
  transport,clientId,clientSecret,allowedProbe,deniedProbe,minTokenTtlSeconds=60,maxTokenTtlSeconds=7200,
}={}){
  if(!transport||typeof transport.universalLogin!=='function'||typeof transport.readSecret!=='function')throw fail('INFISICAL_QUALIFICATION_TRANSPORT_REQUIRED');
  clientId=req({clientId},'clientId');clientSecret=req({clientSecret},'clientSecret');
  const allowed=normalizeProbe({allowedProbe},'allowedProbe');
  const denied=normalizeProbe({deniedProbe},'deniedProbe');
  const minTtl=Number(minTokenTtlSeconds),maxTtl=Number(maxTokenTtlSeconds);
  if(!Number.isFinite(minTtl)||!Number.isFinite(maxTtl)||minTtl<1||maxTtl<minTtl)throw fail('INFISICAL_QUALIFICATION_TTL_POLICY_INVALID');
  let login;
  try{login=await transport.universalLogin({clientId,clientSecret})}catch(error){
    const status=Number(error?.httpStatus);
    const safeStatus=[400,401,403,404,422,429,500,502,503,504].includes(status)?'HTTP_'+status:null;
    const safeCode=['GOV_HTTP_REDIRECT_BLOCKED','GOV_HTTP_CONTENT_TYPE_REJECTED','GOV_HTTP_NETWORK_ERROR','GOV_HTTP_TIMEOUT','GOV_HTTP_RESPONSE_INVALID_JSON'].includes(error?.code)?error.code:null;
    throw fail('INFISICAL_QUALIFICATION_AUTH_FAILED','INFISICAL_QUALIFICATION_AUTH_FAILED:'+(safeStatus||safeCode||'UNKNOWN'));
  }
  if(!login||typeof login.accessToken!=='string'||!login.accessToken||String(login.tokenType||'Bearer').toLowerCase()!=='bearer')throw fail('INFISICAL_QUALIFICATION_AUTH_FAILED');
  const ttl=Number(login.expiresIn);
  const maxDeclared=Number(login.accessTokenMaxTTL??ttl);
  if(!Number.isFinite(ttl)||ttl<minTtl||ttl>maxTtl||!Number.isFinite(maxDeclared)||maxDeclared>maxTtl)throw fail('INFISICAL_QUALIFICATION_TOKEN_TTL_INVALID');
  let allowedResult;
  try{allowedResult=await transport.readSecret({accessToken:login.accessToken,...allowed})}catch{throw fail('INFISICAL_QUALIFICATION_ALLOWED_READ_FAILED')}
  if(!allowedResult||typeof allowedResult.secretValue!=='string'||!allowedResult.secretValue)throw fail('INFISICAL_QUALIFICATION_ALLOWED_READ_FAILED');
  let deniedBlocked=false;
  try{await transport.readSecret({accessToken:login.accessToken,...denied})}
  catch(error){if(['INFISICAL_SECRET_FORBIDDEN','INFISICAL_SECRET_NOT_FOUND'].includes(error?.code))deniedBlocked=true;else throw fail('INFISICAL_QUALIFICATION_DENIED_SCOPE_UNVERIFIED')}
  if(!deniedBlocked)throw fail('INFISICAL_QUALIFICATION_DENIED_SCOPE_READABLE');
  return Object.freeze({
    runtimeVersion:'universal-auth-v1+secrets-v4',
    tokenTtlSeconds:ttl,
    checks:Object.freeze([
      Object.freeze({checkId:'universal-auth-login',outcome:'pass'}),
      Object.freeze({checkId:'allowed-secret-read',outcome:'pass'}),
      Object.freeze({checkId:'denied-scope-read',outcome:'pass'}),
      Object.freeze({checkId:'token-ttl-bounded',outcome:'pass'}),
    ]),
  });
}
