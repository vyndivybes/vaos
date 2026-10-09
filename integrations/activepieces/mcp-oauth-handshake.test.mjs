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
  assert.equal(log[1].options.redirect,'error');
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
  assert.equal(parseMcpResponse('event: message\\ndata: '+json+'\\n\\n','text/event-stream').result.tools[0].name,'ap_get_run');
  assert.throws(()=>parseMcpResponse('not-json','application/json'),/ACTIVEPIECES_MCP_RESPONSE_INVALID/);
});
