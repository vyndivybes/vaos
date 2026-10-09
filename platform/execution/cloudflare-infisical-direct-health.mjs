// Native Cloudflare cron: a scoped, fail-closed Infisical canary.
// Never logs or persists credentials, never enables routing, never calls GitHub.
const fail = code => Object.assign(new Error(code), {code,retryable:false});
const required = ['INFISICAL_CLIENT_ID','INFISICAL_CLIENT_SECRET','INFISICAL_PROJECT_ID',
  'INFISICAL_ENVIRONMENT','INFISICAL_ALLOWED_SECRET_PATH','INFISICAL_ALLOWED_SECRET_KEY',
  'INFISICAL_DENIED_SECRET_PATH','INFISICAL_DENIED_SECRET_KEY',
  'VAOS_INFISICAL_WATCHDOG_KEY','SUPABASE_URL'];
export const isCloudflareInfisicalHealthEnabled = env => env?.INFISICAL_DIRECT_WATCHDOG_ENABLED === 'true';
function endpoint(value, hosts) {
  let u; try { u=new URL(value); } catch { throw fail('INFISICAL_DIRECT_CONFIG_INVALID'); }
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash||!hosts.test(u.hostname))
    throw fail('INFISICAL_DIRECT_CONFIG_INVALID');
  return u.origin;
}
async function requestJson(url,{method='GET',headers={},body,fetchImpl}={}) {
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),12000);
  try {
    const res=await fetchImpl(url,{method,headers,body,redirect:'manual',signal:controller.signal});
    const status=Number(res?.status);
    if(!Number.isInteger(status)||status<100||status>599)throw fail('INFISICAL_DIRECT_RESPONSE_INVALID');
    if(status>=300&&status<400)throw fail('INFISICAL_DIRECT_REDIRECT_BLOCKED');
    if(status===403||status===404)return {status,body:null};
    if(!String(res.headers?.get?.('content-type')||'').toLowerCase().startsWith('application/json'))
      throw fail('INFISICAL_DIRECT_RESPONSE_INVALID');
    const bytes=Number(res.headers?.get?.('content-length'));
    if(Number.isFinite(bytes)&&bytes>16384)throw fail('INFISICAL_DIRECT_RESPONSE_INVALID');
    const text=await res.text();
    if(text.length>16384)throw fail('INFISICAL_DIRECT_RESPONSE_INVALID');
    let parsed;try{parsed=JSON.parse(text)}catch{throw fail('INFISICAL_DIRECT_RESPONSE_INVALID')}
    return {status,body:parsed};
  }catch(e){if(e?.code)throw e;throw fail('INFISICAL_DIRECT_TRANSPORT_FAILED')}
  finally{clearTimeout(timer)}
}
export async function runCloudflareInfisicalHealth({env={},scheduledTime,fetchImpl=fetch,now=()=>new Date()}={}) {
  if(!isCloudflareInfisicalHealthEnabled(env))return {status:'disabled'};
  if(required.some(k=>typeof env[k]!=='string'||!env[k].trim()))throw fail('INFISICAL_DIRECT_UNCONFIGURED');
  const base=endpoint(env.INFISICAL_BASE_URL||'https://us.infisical.com',/^(?:us|app)\.infisical\.com$/);
  const supabase=endpoint(env.SUPABASE_URL,/^[a-z0-9-]+\.supabase\.co$/);
  const when=now();
  if(!(when instanceof Date)||!Number.isFinite(when.getTime())||
    !Number.isSafeInteger(scheduledTime)||scheduledTime<1_000_000_000_000||
    scheduledTime>when.getTime()+120000||when.getTime()-scheduledTime>25*60000)
    throw fail('INFISICAL_DIRECT_TICK_INVALID');
  if(env.INFISICAL_ALLOWED_SECRET_PATH===env.INFISICAL_DENIED_SECRET_PATH &&
     env.INFISICAL_ALLOWED_SECRET_KEY===env.INFISICAL_DENIED_SECRET_KEY)
    throw fail('INFISICAL_DIRECT_CONFIG_INVALID');
  const login=await requestJson(base+'/api/v1/auth/universal-auth/login',{
    method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({clientId:env.INFISICAL_CLIENT_ID,clientSecret:env.INFISICAL_CLIENT_SECRET}),fetchImpl
  }).catch(()=>{throw fail('INFISICAL_DIRECT_AUTH_FAILED')});
  const token=login.body?.accessToken,ttl=Number(login.body?.expiresIn),
    maxTtl=Number(login.body?.accessTokenMaxTTL??ttl);
  if(login.status!==200||typeof token!=='string'||!token||
     String(login.body?.tokenType||'Bearer').toLowerCase()!=='bearer')
    throw fail('INFISICAL_DIRECT_AUTH_FAILED');
  if(!Number.isFinite(ttl)||ttl<60||ttl>7200||!Number.isFinite(maxTtl)||maxTtl>7200)
    throw fail('INFISICAL_DIRECT_TOKEN_TTL_INVALID');
  const probe=(key,path,projectId)=>base+'/api/v4/secrets/'+encodeURIComponent(key)+'?'+new URLSearchParams({
    projectId,environment:env.INFISICAL_ENVIRONMENT,secretPath:path});
  const allowed=await requestJson(probe(env.INFISICAL_ALLOWED_SECRET_KEY,env.INFISICAL_ALLOWED_SECRET_PATH,env.INFISICAL_PROJECT_ID),{
    headers:{Authorization:'Bearer '+token,Accept:'application/json'},fetchImpl
  }).catch(()=>{throw fail('INFISICAL_DIRECT_ALLOWED_READ_FAILED')});
  if(allowed.status!==200||typeof allowed.body?.secret?.secretValue!=='string'||!allowed.body.secret.secretValue)
    throw fail('INFISICAL_DIRECT_ALLOWED_READ_FAILED');
  const denied=await requestJson(probe(env.INFISICAL_DENIED_SECRET_KEY,env.INFISICAL_DENIED_SECRET_PATH,
    env.INFISICAL_DENIED_PROJECT_ID||env.INFISICAL_PROJECT_ID),{
    headers:{Authorization:'Bearer '+token,Accept:'application/json'},fetchImpl
  }).catch(()=>{throw fail('INFISICAL_DIRECT_DENIED_SCOPE_UNVERIFIED')});
  if(![403,404].includes(denied.status))throw fail('INFISICAL_DIRECT_DENIED_SCOPE_UNVERIFIED');
  const authorityRef='cloudflare:vaos:infisical:cron:'+scheduledTime;
  const result=await requestJson(supabase+'/functions/v1/vaos-control',{
    method:'POST',headers:{'x-vaos-server-key':env.VAOS_INFISICAL_WATCHDOG_KEY,
      'Content-Type':'application/json',Accept:'application/json','Cache-Control':'no-store'},
    body:JSON.stringify({operation:'infisicalCommissioningControl',payload:{
      action:'record-health',authorityRef,health:{
        status:'healthy',checkedAt:when.toISOString(),evidenceRef:authorityRef
      }
    }}),fetchImpl
  }).catch(()=>{throw fail('INFISICAL_DIRECT_HEALTH_WRITE_FAILED')});
  if(result.status!==200||result.body?.outcome!=='SAVED'||result.body?.providerId!=='infisical'||
    result.body?.operation!=='record-health'||result.body?.qualificationState!=='qualified'||
    result.body?.health?.status!=='healthy')throw fail('INFISICAL_DIRECT_HEALTH_WRITE_FAILED');
  return {status:'healthy',scheduledTime,productionActivation:false};
}
