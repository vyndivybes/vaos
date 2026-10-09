// One-time, synthetic OAuth 2.1 PKCE/MCP discovery qualification.
// No provider access or refresh tokens are persisted or returned to the browser.
// A successful probe does NOT constitute production provider qualification.
export const ACTIVEPIECES_MCP_RESOURCE='https://cloud.activepieces.com/mcp/platform';
const ORIGIN='https://cloud.activepieces.com';
const METADATA_URL=ORIGIN+'/.well-known/oauth-authorization-server';
const MINUTE=60_000;

function fail(code) {const e=new Error(code);e.code=code;return e}
function pinnedEndpoint(input) {
  if(typeof input!=='string')throw fail('ACTIVEPIECES_OAUTH_ENDPOINT_UNTRUSTED');
  let url;
  try{url=new URL(input)}catch{throw fail('ACTIVEPIECES_OAUTH_ENDPOINT_UNTRUSTED')}
  if(url.origin!==ORIGIN||url.protocol!=='https:'||url.username||url.password||url.hash)
    throw fail('ACTIVEPIECES_OAUTH_ENDPOINT_UNTRUSTED');
  return url.toString();
}
function bytes(count,randomBytes) {
  const a=randomBytes?randomBytes(count):crypto.getRandomValues(new Uint8Array(count));
  if(!(a instanceof Uint8Array)||a.length!==count)throw fail('ACTIVEPIECES_OAUTH_ENTROPY_INVALID');
  return a;
}
function b64url(data) {
  // Avoid Buffer in edge runtimes.
  return btoa(String.fromCharCode(...data)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
async function challenge(verifier) {
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(hash));
}
// workerd supports manual redirect handling; 3xx are rejected by the status gate.
async function guarded(fetchImpl,url,options={},phase='REMOTE') {
  // Phase comes only from literal call-sites below, never from user input.
  let res;
  const trusted=pinnedEndpoint(url);
  try {
    res=await fetchImpl(trusted,{
      ...options,redirect:'manual',
      signal:AbortSignal.timeout(12_000),
    });
  }catch {
    // Never forward fetch exceptions, remote response bodies, URLs or headers.
    throw fail('ACTIVEPIECES_OAUTH_'+phase+'_NETWORK_FAILED');
  }
  if(!res||res.status<200||res.status>=300) {
    const status=Number.isInteger(res?.status)&&res.status>=100&&res.status<=599
      ?String(res.status):'UNKNOWN';
    throw fail('ACTIVEPIECES_OAUTH_'+phase+'_HTTP_'+status);
  }
  return res;
}
async function jsonResponse(res) {
  const content=await res.text();
  if(content.length>256_000)throw fail('ACTIVEPIECES_OAUTH_REMOTE_INVALID');
  try {return JSON.parse(content)}catch{throw fail('ACTIVEPIECES_OAUTH_REMOTE_INVALID')}
}
function callback(input) {
  const u=new URL(input);
  if(u.protocol!=='https:'||u.hostname!=='vaos.vayushastr.workers.dev'
    ||u.pathname!=='/api/activepieces-mcp/callback'||u.search||u.hash)
    throw fail('ACTIVEPIECES_OAUTH_CALLBACK_UNTRUSTED');
  return u.toString();
}
function metadataChecks(metadata) {
  if(!metadata||typeof metadata!=='object')throw fail('ACTIVEPIECES_OAUTH_METADATA_INVALID');
  if(metadata.issuer!==ORIGIN)throw fail('ACTIVEPIECES_OAUTH_ENDPOINT_UNTRUSTED');
  return {
    authorize:pinnedEndpoint(metadata.authorization_endpoint),
    token:pinnedEndpoint(metadata.token_endpoint),
    register:pinnedEndpoint(metadata.registration_endpoint),
  };
}

export async function beginActivepiecesAuthorization({callbackUrl,store,fetchImpl=fetch,now=Date.now,randomBytes,persistCredentials=false}={}) {
  if(!store||typeof store.put!=='function')throw fail('ACTIVEPIECES_OAUTH_STATE_STORE_REQUIRED');
  const redirectUri=callback(callbackUrl);
  const metadata=await jsonResponse(await guarded(fetchImpl,METADATA_URL,{headers:{Accept:'application/json'}},'DISCOVERY'));
  const endpoints=metadataChecks(metadata);
  const register=await jsonResponse(await guarded(fetchImpl,endpoints.register,{
    method:'POST',
    headers:{'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({
      client_name:'VAOS Activepieces read-only MCP qualification',
      redirect_uris:[redirectUri],
      grant_types:['authorization_code','refresh_token'],
      response_types:['code'],
      token_endpoint_auth_method:'none',
    }),
  },'REGISTRATION'));
  if(typeof register.client_id!=='string'||!register.client_id||register.client_id.length>256)
    throw fail('ACTIVEPIECES_OAUTH_CLIENT_INVALID');
  const nonce=b64url(bytes(32,randomBytes));
  const verifier=b64url(bytes(48,randomBytes));
  const time=now();
  if(!Number.isFinite(time))throw fail('ACTIVEPIECES_OAUTH_CLOCK_INVALID');
  try {
    await store.put({nonce,clientId:register.client_id,verifier,redirectUri,tokenUrl:endpoints.token,expiresAt:time+10*MINUTE,persistCredentials:persistCredentials===true});
  }catch { throw fail('ACTIVEPIECES_OAUTH_STATE_STORE_FAILED'); }
  const auth=new URL(endpoints.authorize);
  auth.searchParams.set('response_type','code');
  auth.searchParams.set('client_id',register.client_id);
  auth.searchParams.set('redirect_uri',redirectUri);
  auth.searchParams.set('code_challenge',await challenge(verifier));
  auth.searchParams.set('code_challenge_method','S256');
  auth.searchParams.set('state',nonce);
  auth.searchParams.set('resource',ACTIVEPIECES_MCP_RESOURCE);
  return auth.toString();
}

export function parseMcpResponse(value,contentType='') {
  if(typeof value!=='string'||value.length>200_000)throw fail('ACTIVEPIECES_MCP_RESPONSE_INVALID');
  try {
    if(String(contentType).includes('text/event-stream')) {
      const payload=value.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim())
        .find(data=>data.startsWith('{') && data.includes('"jsonrpc"'));
      if(!payload)throw fail('ACTIVEPIECES_MCP_RESPONSE_INVALID');
      return JSON.parse(payload);
    }
    return JSON.parse(value);
  }catch{throw fail('ACTIVEPIECES_MCP_RESPONSE_INVALID')}
}
async function callMcp({fetchImpl,accessToken,method,id,params,sessionId}) {
  const headers={
    Authorization:'Bearer '+accessToken,
    'Content-Type':'application/json',
    Accept:'application/json, text/event-stream',
    'MCP-Protocol-Version':'2025-03-26',
  };
  if(sessionId)headers['Mcp-Session-Id']=sessionId;
  const res=await guarded(fetchImpl,ACTIVEPIECES_MCP_RESOURCE,{
    method:'POST',headers,
    body:JSON.stringify({jsonrpc:'2.0',...(id?{id}:{}),method,...(params?{params}:{})}),
  });
  if(method==='notifications/initialized')return {sessionId};
  const data=parseMcpResponse(await res.text(),res.headers.get('content-type'));
  if(data.error||data.id!==id||!data.result)throw fail('ACTIVEPIECES_MCP_RESPONSE_INVALID');
  return {data:data.result,sessionId:res.headers.get('mcp-session-id')||sessionId};
}

async function readonlyMcpProbe(accessToken,fetchImpl) {
  const init=await callMcp({fetchImpl,accessToken,method:'initialize',id:1,params:{
    protocolVersion:'2025-03-26',
    capabilities:{},
    clientInfo:{name:'VAOS-MCP-Qualification',version:'0.1'},
  }});
  const sid=init.sessionId;
  // Session-mode servers expect an initialized notification before listing tools.
  await callMcp({fetchImpl,accessToken,method:'notifications/initialized',sessionId:sid});
  const tools=await callMcp({fetchImpl,accessToken,method:'tools/list',id:2,sessionId:sid});
  if(!Array.isArray(tools.data.tools))throw fail('ACTIVEPIECES_MCP_RESPONSE_INVALID');
  const safe=new Set(['ap_list_flows','ap_list_runs','ap_get_run']);
  const names=[...new Set(tools.data.tools.map(x=>x?.name).filter(x=>safe.has(x)))].sort();
  if(!names.includes('ap_get_run')||!names.includes('ap_list_runs'))throw fail('ACTIVEPIECES_READBACK_UNAVAILABLE');
  return names;
}
// A read-only revalidation does not require access to any business workflow.
export async function probeActivepiecesMcpReadback(accessToken, fetchImpl=fetch) {
  return readonlyMcpProbe(accessToken,fetchImpl);
}
export async function refreshActivepiecesMcpTokens(record,fetchImpl=fetch,now=Date.now) {
  if(!record || record.tokenUrl !== ORIGIN+'/token' || typeof record.refreshToken !== 'string' || !record.refreshToken)
    throw fail('ACTIVEPIECES_OAUTH_REFRESH_INVALID');
  const token=await jsonResponse(await guarded(fetchImpl,record.tokenUrl,{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},
    body:new URLSearchParams({
      grant_type:'refresh_token',refresh_token:record.refreshToken,
      client_id:record.clientId,resource:ACTIVEPIECES_MCP_RESOURCE,
    }).toString(),
  },'REFRESH'));
  if(typeof token.access_token!=='string'||!token.access_token||
     token.token_type?.toLowerCase()!=='bearer'||
     !Number.isFinite(Number(token.expires_in)) || Number(token.expires_in)<=0)
    throw fail('ACTIVEPIECES_OAUTH_REFRESH_INVALID');
  return {...record,accessToken:token.access_token,
    refreshToken:typeof token.refresh_token==='string'&&token.refresh_token?token.refresh_token:record.refreshToken,
    expiresAt:now()+Number(token.expires_in)*1000};
}
export async function completeActivepiecesAuthorization({nonce,code,store,fetchImpl=fetch,now=Date.now}={}) {
  if(!nonce||typeof nonce!=='string'||nonce.length>256||!store||typeof store.take!=='function')throw fail('ACTIVEPIECES_OAUTH_STATE_INVALID');
  const pending=await store.take(nonce); // atomic one-time consumption, before any external calls
  if(!pending||pending.nonce!==nonce)throw fail('ACTIVEPIECES_OAUTH_STATE_INVALID');
  if(now()>pending.expiresAt)throw fail('ACTIVEPIECES_OAUTH_STATE_EXPIRED');
  if(typeof code!=='string'||!code||code.length>4096)throw fail('ACTIVEPIECES_OAUTH_CODE_INVALID');
  try {
    const token=await jsonResponse(await guarded(fetchImpl,pending.tokenUrl,{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},
      body:new URLSearchParams({
        grant_type:'authorization_code',client_id:pending.clientId,code,
        redirect_uri:pending.redirectUri,code_verifier:pending.verifier,
        resource:ACTIVEPIECES_MCP_RESOURCE,
      }).toString(),
    }));
    if(typeof token.access_token!=='string'||!token.access_token||token.token_type?.toLowerCase()!=='bearer')
      throw fail('ACTIVEPIECES_OAUTH_TOKEN_INVALID');
    // Tokens are never saved in the state store, evidence, response or logs.
    const readonlyTools=await readonlyMcpProbe(token.access_token,fetchImpl);
    let status='MCP_READBACK_CAPABLE';
    if(pending.persistCredentials===true){
      if(typeof token.refresh_token!=='string'||!token.refresh_token||
         !Number.isFinite(Number(token.expires_in))||Number(token.expires_in)<=0)
        throw fail('ACTIVEPIECES_OAUTH_PERSISTENT_REFRESH_REQUIRED');
      if(typeof store.storeCredentials!=='function') throw fail('ACTIVEPIECES_VAULT_UNAVAILABLE');
      await store.storeCredentials({
        accessToken:token.access_token,refreshToken:token.refresh_token,
        clientId:pending.clientId,tokenUrl:pending.tokenUrl,
        expiresAt:now()+Number(token.expires_in)*1000,
      });
      status='MCP_CREDENTIALS_SECURED';
    }
    const outcome={status,verifiedAt:new Date(now()).toISOString(),readonlyTools,productionActivation:false};
    await store.record(outcome);
    return outcome;
  }catch(error){
    await store.record({status:'FAILED',verifiedAt:new Date(now()).toISOString(),reasonCode:
      String(error?.code||'ACTIVEPIECES_OAUTH_REMOTE_FAILED').match(/^ACTIVEPIECES_[A-Z_]+$/)
      ?error.code:'ACTIVEPIECES_OAUTH_REMOTE_FAILED',productionActivation:false});
    throw error;
  }
}
