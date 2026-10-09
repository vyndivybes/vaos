import test from 'node:test';
import assert from 'node:assert/strict';
import { beginActivepiecesAuthorization, completeActivepiecesAuthorization, parseMcpResponse } from './mcp-oauth-handshake.mjs';

function fakeStore() {
  let pending=null; let result=null;
  return {
    async put(value) { pending=value; },
    async take(nonce) { if (pending?.nonce !== nonce) return null; const out=pending; pending=null; return out; },
    async record(value) { result=value; },
    async status() { return result; },
    pending() { return pending; },
  };
}
const metadata={issuer:'https://cloud.activepieces.com',authorization_endpoint:'https://cloud.activepieces.com/authorize',token_endpoint:'https://cloud.activepieces.com/token',registration_endpoint:'https://cloud.activepieces.com/register'};
const response=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json',...headers}});
function mockFetch(log, override={}) {
  return async (url, options={}) => {
    log.push({url:String(url),options});
    if (String(url).endsWith('/.well-known/oauth-authorization-server')) return response(override.metadata||metadata);
    if (String(url).endsWith('/register')) return response({client_id:'client-demo'},201);
    if (String(url).endsWith('/token')) return response({access_token:'secret-access-token',token_type:'Bearer',expires_in:900,refresh_token:'secret-refresh'});
    if (String(url).endsWith('/mcp/platform')) {
      const method=JSON.parse(options.body).method;
      if(method==='initialize')return response({jsonrpc:'2.0',id:1,result:{protocolVersion:'2025-03-26',capabilities:{tools:{}}}});
      if(method==='notifications/initialized')return new Response(null,{status:202});
      if(method==='tools/list')return response({jsonrpc:'2.0',id:2,result:{tools:[{name:'ap_list_flows'},{name:'ap_list_runs'},{name:'ap_get_run'},{name:'ap_create_flow'}]}});
    }
    throw Error('unexpected URL');
  };
}

test('OAuth start uses pinned metadata, PKCE S256, short-lived state and no secrets in authorization URL',async()=>{
  const log=[],store=fakeStore();
  const link=await beginActivepiecesAuthorization({
    callbackUrl:'https://vaos.vayushastr.workers.dev/api/activepieces-mcp/callback',
    store,fetchImpl:mockFetch(log),now:()=>1000,
    randomBytes:(n)=>Uint8Array.from({length:n},(_,i)=>i+1),
  });
  const u=new URL(link);
  assert.equal(u.hostname,'cloud.activepieces.com');
  assert.equal(u.searchParams.get('response_type'),'code');
  assert.equal(u.searchParams.get('code_challenge_method'),'S256');
  assert.ok(u.searchParams.get('code_challenge')?.length>30);
  assert.equal(u.searchParams.get('code_verifier'),null);
  assert.equal(u.searchParams.get('resource'),'https://cloud.activepieces.com/mcp/platform');
  assert.equal(store.pending().expiresAt,601000);
  assert.equal(store.pending().clientId,'client-demo');
  assert.equal(log[1].options.redirect,'manual');
  assert.equal(JSON.stringify(store.pending()).includes('secret-access-token'),false);
});

test('rejects authorization metadata redirecting to an attacker controlled host',async()=>{
  await assert.rejects(()=>beginActivepiecesAuthorization({
    callbackUrl:'https://vaos.vayushastr.workers.dev/api/activepieces-mcp/callback',
    store:fakeStore(),fetchImpl:mockFetch([],{metadata:{...metadata,token_endpoint:'https://evil.example/token'}}),
  }),/ACTIVEPIECES_OAUTH_ENDPOINT_UNTRUSTED/);
});

test('callback succeeds only once, verifies read-only MCP tool discovery, discards all access tokens',async()=>{
  const log=[],store=fakeStore(), fetchImpl=mockFetch(log);
  const url=await beginActivepiecesAuthorization({
    callbackUrl:'https://vaos.vayushastr.workers.dev/api/activepieces-mcp/callback',
    store,fetchImpl,
  });
  const nonce=new URL(url).searchParams.get('state');
  const result=await completeActivepiecesAuthorization({nonce,code:'authorization-code',store,fetchImpl,now:()=>Date.now()});
  assert.equal(result.status,'MCP_READBACK_CAPABLE');
  assert.deepEqual(result.readonlyTools,['ap_get_run','ap_list_flows','ap_list_runs']);
  assert.equal(JSON.stringify(await store.status()).includes('secret-'),false);
  assert.equal(log.filter(x=>x.url.endsWith('/token')).length,1);
  assert.equal(log.find(x=>x.url.endsWith('/mcp/platform'))?.options.headers.Authorization,'Bearer secret-access-token');
  await assert.rejects(()=>completeActivepiecesAuthorization({nonce,code:'replay',store,fetchImpl}),/ACTIVEPIECES_OAUTH_STATE_INVALID/);
});

test('callback fails closed if run readback tool is missing',async()=>{
  const s=fakeStore(), log=[];
  const init=mockFetch(log);
  const fetchImpl=async(url,options)=>{
    if(String(url).endsWith('/mcp/platform') && JSON.parse(options.body).method==='tools/list')
      return response({jsonrpc:'2.0',id:2,result:{tools:[{name:'ap_list_flows'}]}});
    return init(url,options);
  };
  const link=await beginActivepiecesAuthorization({callbackUrl:'https://vaos.vayushastr.workers.dev/api/activepieces-mcp/callback',store:s,fetchImpl});
  await assert.rejects(()=>completeActivepiecesAuthorization({nonce:new URL(link).searchParams.get('state'),code:'x',store:s,fetchImpl}),/ACTIVEPIECES_READBACK_UNAVAILABLE/);
  assert.equal((await s.status()).status,'FAILED');
});

test('expired OAuth state cannot be exchanged and never calls token endpoint',async()=>{
  const log=[],s=fakeStore(),fetchImpl=mockFetch(log);
  const link=await beginActivepiecesAuthorization({callbackUrl:'https://vaos.vayushastr.workers.dev/api/activepieces-mcp/callback',store:s,fetchImpl,now:()=>1000});
  await assert.rejects(()=>completeActivepiecesAuthorization({nonce:new URL(link).searchParams.get('state'),code:'code',store:s,fetchImpl,now:()=>601001}),/ACTIVEPIECES_OAUTH_STATE_EXPIRED/);
  assert.equal(log.some(x=>x.url.endsWith('/token')),false);
});

test('MCP reader accepts JSON or compact event-stream frames without arbitrary data exposure',()=>{
  const json=JSON.stringify({jsonrpc:'2.0',id:2,result:{tools:[{name:'ap_get_run'}]}});
  assert.equal(parseMcpResponse(json,'application/json').result.tools[0].name,'ap_get_run');
  assert.equal(parseMcpResponse('event: message\ndata: '+json+'\n\n','text/event-stream').result.tools[0].name,'ap_get_run');
  assert.throws(()=>parseMcpResponse('not-json','application/json'),/ACTIVEPIECES_MCP_RESPONSE_INVALID/);
});

test('network failure before discovery exposes only a fixed diagnostic code',async()=>{
  await assert.rejects(()=>beginActivepiecesAuthorization({
    callbackUrl:'https://vaos.vayushastr.workers.dev/api/activepieces-mcp/callback',
    store:fakeStore(),fetchImpl:async()=>{throw new TypeError('untrusted upstream message and token=secret');},
  }),/ACTIVEPIECES_OAUTH_DISCOVERY_NETWORK_FAILED/);
});
test('bad metadata response includes safe phase and HTTP status',async()=>{
  await assert.rejects(()=>beginActivepiecesAuthorization({
    callbackUrl:'https://vaos.vayushastr.workers.dev/api/activepieces-mcp/callback',
    store:fakeStore(),fetchImpl:async()=>response({error:'hidden'},403),
  }),/ACTIVEPIECES_OAUTH_DISCOVERY_HTTP_403/);
});
test('a failed registration is distinct from discovery failure',async()=>{
  await assert.rejects(()=>beginActivepiecesAuthorization({
    callbackUrl:'https://vaos.vayushastr.workers.dev/api/activepieces-mcp/callback',
    store:fakeStore(),
    fetchImpl:async(url)=>String(url).endsWith('/register')?response({error:'redacted'},500):response(metadata),
  }),/ACTIVEPIECES_OAUTH_REGISTRATION_HTTP_500/);
});
test('registration succeeds but Durable Object state failure is labeled independently',async()=>{
  const s=fakeStore();
  s.put=async()=>{throw Error('private driver connection details')};
  await assert.rejects(()=>beginActivepiecesAuthorization({
    callbackUrl:'https://vaos.vayushastr.workers.dev/api/activepieces-mcp/callback',
    store:s,fetchImpl:mockFetch([]),
  }),/ACTIVEPIECES_OAUTH_STATE_STORE_FAILED/);
});

test('Cloudflare workerd redirect:error incompatibility is bypassed using manual redirects',async()=>{
  const logs=[],upstream=mockFetch(logs);
  const response=await beginActivepiecesAuthorization({
    callbackUrl:'https://vaos.vayushastr.workers.dev/api/activepieces-mcp/callback',
    store:fakeStore(),
    fetchImpl:async(url,options)=>{
      if(options.redirect==='error')throw new TypeError('Invalid redirect value, must be one of follow or manual');
      return upstream(url,options);
    },
  });
  assert.equal(new URL(response).hostname,'cloud.activepieces.com');
  assert.ok(logs.length>=2);
  assert.ok(logs.every(x=>x.options.redirect==='manual'));
});
test('Cloudflare manual redirect never follows a 302 for OAuth discovery',async()=>{
  const log=[];
  await assert.rejects(()=>beginActivepiecesAuthorization({
    callbackUrl:'https://vaos.vayushastr.workers.dev/api/activepieces-mcp/callback',
    store:fakeStore(),
    fetchImpl:async(url,options)=>{
      log.push({url,options});
      return new Response(null,{status:302,headers:{Location:'https://evil.example'}});
    },
  }),/ACTIVEPIECES_OAUTH_DISCOVERY_HTTP_302/);
  assert.equal(log.length,1);
  assert.equal(log[0].options.redirect,'manual');
});

test('persistent OAuth enrollment calls protected vault only after read-only proof',async()=>{
  const log=[],store=fakeStore(),fetchImpl=mockFetch(log);
  let secret=null;store.storeCredentials=async data=>{secret=data};
  const auth=await beginActivepiecesAuthorization({callbackUrl:'https://vaos.vayushastr.workers.dev/api/activepieces-mcp/callback',
    store,fetchImpl,persistCredentials:true});
  const result=await completeActivepiecesAuthorization({nonce:new URL(auth).searchParams.get('state'),
    code:'demo-authorization',store,fetchImpl});
  assert.equal(result.status,'MCP_CREDENTIALS_SECURED');
  assert.equal(secret.refreshToken,'secret-refresh');
  assert.equal(secret.accessToken,'secret-access-token');
  assert.equal(secret.tokenUrl,'https://cloud.activepieces.com/token');
  assert.equal(JSON.stringify(result).includes('secret'),false);
});
test('refresh rotates token only at pinned Activepieces endpoint',async()=>{
  const log=[];
  const {refreshActivepiecesMcpTokens}=await import('./mcp-oauth-handshake.mjs');
  const current={accessToken:'old-token',refreshToken:'refresh-original',clientId:'client-demo',
    tokenUrl:'https://cloud.activepieces.com/token',expiresAt:1};
  const refreshed=await refreshActivepiecesMcpTokens(current,mockFetch(log),()=>1000);
  assert.equal(refreshed.accessToken,'secret-access-token');
  assert.equal(refreshed.refreshToken,'secret-refresh');
  assert.equal(refreshed.expiresAt,901000);
  assert.equal(log.length,1);
  assert.equal(log[0].options.redirect,'manual');
  await assert.rejects(()=>refreshActivepiecesMcpTokens({...current,tokenUrl:'https://evil.example'},mockFetch([])),/REFRESH_INVALID/);
});
