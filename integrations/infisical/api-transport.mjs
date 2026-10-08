function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function httpsBase(value){
  let url;try{url=new URL(value)}catch{throw fail('INFISICAL_API_CONFIG_INVALID')}
  if(url.protocol!=='https:'||url.username||url.password)throw fail('INFISICAL_API_CONFIG_INVALID');
  return url.origin;
}
function req(input,key,code='INFISICAL_API_INPUT_INVALID'){
  const v=input?.[key];if(typeof v!=='string'||!v.trim())throw fail(code,code+':'+key);return v.trim();
}
function classify(status,operation){
  // Keep only a numeric HTTP status for safe diagnosis; never persist response bodies.
  const httpFail=code=>{const e=fail(code);e.httpStatus=status;return e};
  if(status===401)return httpFail('INFISICAL_AUTH_FAILED');
  if(operation==='secret'&&status===403)return httpFail('INFISICAL_SECRET_FORBIDDEN');
  if(operation==='secret'&&status===404)return httpFail('INFISICAL_SECRET_NOT_FOUND');
  if(status===429){const e=httpFail('INFISICAL_RATE_LIMITED');e.retryable=true;return e}
  if(status>=500){const e=httpFail('INFISICAL_UNAVAILABLE');e.retryable=true;return e}
  return httpFail(operation==='login'?'INFISICAL_AUTH_FAILED':'INFISICAL_SECRET_READ_FAILED');
}
export function createInfisicalApiTransport({baseUrl,httpTransport}={}){
  const root=httpsBase(baseUrl);
  if(!httpTransport||typeof httpTransport.request!=='function')throw fail('INFISICAL_API_TRANSPORT_REQUIRED');
  async function universalLogin({clientId,clientSecret}={}){
    clientId=req({clientId},'clientId');clientSecret=req({clientSecret},'clientSecret');
    const body=JSON.stringify({clientId,clientSecret});
    let response;
    try{
      response=await httpTransport.request({
        url:root+'/api/v1/auth/universal-auth/login',
        method:'POST',
        headers:{'Content-Type':'application/json',Accept:'application/json'},
        body,
        allowedResponseTypes:['application/json'],
      });
    }catch(error){
      if(error?.code)throw error;
      throw fail('INFISICAL_AUTH_FAILED');
    }
    if(response.status<200||response.status>=300)throw classify(response.status,'login');
    const b=response.body;
    if(!b||typeof b.accessToken!=='string'||!b.accessToken.trim()||!Number.isFinite(Number(b.expiresIn))){
      throw fail('INFISICAL_AUTH_FAILED');
    }
    return Object.freeze({
      accessToken:b.accessToken,
      expiresIn:Number(b.expiresIn),
      accessTokenMaxTTL:Number.isFinite(Number(b.accessTokenMaxTTL))?Number(b.accessTokenMaxTTL):Number(b.expiresIn),
      tokenType:typeof b.tokenType==='string'&&b.tokenType.trim()?b.tokenType.trim():'Bearer',
    });
  }
  async function readSecret({accessToken,projectId,environment,secretPath,secretKey}={}){
    accessToken=req({accessToken},'accessToken');
    projectId=req({projectId},'projectId');
    environment=req({environment},'environment');
    secretPath=req({secretPath},'secretPath');
    secretKey=req({secretKey},'secretKey');
    const query=new URLSearchParams({projectId,environment,secretPath}).toString();
    let response;
    try{
      response=await httpTransport.request({
        url:root+'/api/v4/secrets/'+encodeURIComponent(secretKey)+'?'+query,
        method:'GET',
        headers:{Authorization:'Bearer '+accessToken,Accept:'application/json'},
        allowedResponseTypes:['application/json'],
      });
    }catch(error){
      if(error?.code)throw error;
      throw fail('INFISICAL_SECRET_READ_FAILED');
    }
    if(response.status<200||response.status>=300)throw classify(response.status,'secret');
    const value=response.body?.secret?.secretValue;
    if(typeof value!=='string'||!value)throw fail('INFISICAL_SECRET_READ_FAILED');
    return Object.freeze({secretValue:value});
  }
  return Object.freeze({universalLogin,readSecret});
}
