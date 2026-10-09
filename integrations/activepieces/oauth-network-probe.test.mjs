import test from 'node:test';
import assert from 'node:assert/strict';
import { checkActivepiecesDiscovery, classifyDiscoveryError } from './oauth-network-probe.mjs';

const valid = {issuer:'https://cloud.activepieces.com',authorization_endpoint:'https://cloud.activepieces.com/authorize',registration_endpoint:'https://cloud.activepieces.com/register',token_endpoint:'https://cloud.activepieces.com/token'};
const result=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
test('checks only pinned public Activepieces metadata, no authenticated or side-effecting request',async()=>{
  const log=[];
  const out=await checkActivepiecesDiscovery({fetchImpl:async(url,options)=>{
    log.push({url,options});return result(valid);
  }});
  assert.deepEqual({ok:out.ok,code:out.code,httpStatus:out.httpStatus},{ok:true,code:'MCP_DISCOVERY_OK',httpStatus:200});
  assert.equal(log.length,1);
  assert.equal(log[0].url,'https://cloud.activepieces.com/.well-known/oauth-authorization-server');
  assert.equal(log[0].options.method,'GET');
  assert.equal(log[0].options.redirect,'error');
  assert.equal(log[0].options.headers.Authorization,undefined);
});
test('separates HTTP 403 from synchronous network rejection',async()=>{
  const forbidden=await checkActivepiecesDiscovery({fetchImpl:async()=>result({error:'secret-not-returned'},403)});
  assert.equal(forbidden.code,'MCP_DISCOVERY_HTTP_403');
  assert.equal(JSON.stringify(forbidden).includes('secret-not-returned'),false);
  const failed=await checkActivepiecesDiscovery({fetchImpl:async()=>{throw new TypeError('secret=never-report could not connect')}});
  assert.equal(failed.code,'MCP_DISCOVERY_FETCH_TYPE_ERROR');
  assert.equal(JSON.stringify(failed).includes('secret=never-report'),false);
});
test('reports 1042 Cloudflare worker-to-worker rejection as safe diagnostic',()=>{
  assert.equal(classifyDiscoveryError(new Error('Cloudflare 1042 Worker tried to fetch another Worker on same zone')),'MCP_DISCOVERY_WORKER_TO_WORKER_BLOCKED');
  assert.equal(classifyDiscoveryError(new Error('privateKey=not-to-be-disclosed')),'MCP_DISCOVERY_FETCH_OTHER');
});
test('rejects metadata with untrusted issuer and does not return remote fields',async()=>{
  const x=await checkActivepiecesDiscovery({fetchImpl:async()=>result({...valid,issuer:'https://evil.example',access_token:'never-disclose'})});
  assert.equal(x.ok,false);
  assert.equal(x.code,'MCP_DISCOVERY_METADATA_UNTRUSTED');
  assert.equal(JSON.stringify(x).includes('never-disclose'),false);
});
test('network probe never performs any OAuth registration, even on metadata invalid',async()=>{
  const urls=[];
  await checkActivepiecesDiscovery({fetchImpl:async url=>{urls.push(url);return result({...valid,authorization_endpoint:'https://evil.example/authorize'})}});
  assert.equal(urls.length,1);
});
