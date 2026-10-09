import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './activepieces-mcp.mjs';
import {createSessionToken} from '../lib/auth.mjs';

const cookie='vaos_session='+encodeURIComponent(createSessionToken('shyamsundhar1982@gmail.com'));
const namespace={
  idFromName(n){return n},
  get(){return {async status(){return {status:'NOT_CONNECTED',readonlyTools:[],productionActivation:false}}}},
};
function req(path,method='GET',headers={},env={ACTIVEPIECES_HANDSHAKE:namespace}) {
  return {url:'https://vaos.vayushastr.workers.dev'+path,method,headers,env};
}
test('MCP commissioning pages require a signed VAOS session',async()=>{
  for(const path of ['/api/activepieces-mcp','/api/activepieces-mcp/status','/api/activepieces-mcp/start']){
    const res=await handler(req(path,path.endsWith('/start')?'POST':'GET',{}),{});
    assert.equal(res.status,401,path);
  }
});
test('MCP OAuth start is same-origin POST only',async()=>{
  const res=await handler(req('/api/activepieces-mcp/start','POST',{cookie,origin:'https://evil.example'}),{});
  assert.equal(res.status,403);
  assert.match(await res.text(),/ORIGIN_INVALID/);
});
test('commissioning UI is a non-mutating explicit consent form',async()=>{
  const res=await handler(req('/api/activepieces-mcp','GET',{cookie}),{});
  assert.equal(res.status,200);
  const body=await res.text();
  assert.match(body,/method="post"/);
  assert.match(body,/Authorize read-only test/);
  assert.match(body,/did not|does not|doesn't|not retain/i);
  assert.equal(res.headers.get('cache-control'),'no-store');
});
test('MCP status does not claim connection or production enablement',async()=>{
  const res=await handler(req('/api/activepieces-mcp/status','GET',{cookie}),{});
  const data=await res.json();
  assert.equal(res.status,200);
  assert.equal(data.connected,false);
  assert.equal(data.productionActivation,false);
  assert.equal(data.evidence.status,'NOT_CONNECTED');
});
test('missing Durable Object binding fails closed',async()=>{
  const res=await handler(req('/api/activepieces-mcp/status','GET',{cookie},{}),{});
  assert.equal(res.status,503);
});
test('callback invalid OAuth state never claims qualification',async()=>{
  const res=await handler(req('/api/activepieces-mcp/callback?code=abc&state=unrecognized','GET',{}),{});
  assert.equal(res.status,502);
  assert.match(await res.text(),/failed/i);
});
