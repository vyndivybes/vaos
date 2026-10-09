import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './activepieces-mcp.mjs';
import {createSessionToken} from '../lib/auth.mjs';

const cookie='vaos_session='+encodeURIComponent(createSessionToken('shyamsundhar1982@gmail.com'));
const namespace={
  idFromName(n){return n},
  get(){return {async put(){},async take(){return null},async status(){return {status:'NOT_CONNECTED',readonlyTools:[],productionActivation:false}}}},
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

test('same-origin form without Origin header uses session-bound CSRF and reaches discovery', async (t) => {
  const view=await handler(req('/api/activepieces-mcp','GET',{cookie}),{});
  const html=await view.text();
  const csrf=html.match(/name="csrf" value="([a-f0-9]{64})"/)?.[1];
  assert.ok(csrf, 'GET must render a session-bound CSRF token');
  const net=t.mock.method(globalThis,'fetch',async()=>{throw new Error('synthetic remote outage');});
  const request=req('/api/activepieces-mcp/start','POST',{
    cookie,'content-type':'application/x-www-form-urlencoded','sec-fetch-site':'same-origin'
  });
  request.body='csrf='+encodeURIComponent(csrf);
  const response=await handler(request,{});
  assert.equal(response.status,503); // synthetic discovery failure, NOT an origin rejection
  assert.match(await response.text(),/OAuth setup unavailable/);
  assert.equal(net.mock.callCount(),1);
});

test('missing or incorrect CSRF token fails closed even without Origin header',async()=>{
  for(const body of ['', 'csrf=wrong', 'other=data']) {
    const request=req('/api/activepieces-mcp/start','POST',{
      cookie,'content-type':'application/x-www-form-urlencoded','sec-fetch-site':'same-origin',
    });
    request.body=body;
    const response=await handler(request,{});
    assert.equal(response.status,403);
    assert.match(await response.text(),/CSRF_INVALID/);
  }
});

test('cross-site POST remains forbidden even with the correct CSRF token',async()=>{
  const view=await handler(req('/api/activepieces-mcp','GET',{cookie}),{});
  const csrf=(await view.text()).match(/name="csrf" value="([a-f0-9]{64})"/)?.[1];
  assert.ok(csrf);
  for(const headers of [
    {cookie,origin:'https://evil.example','sec-fetch-site':'cross-site','content-type':'application/x-www-form-urlencoded'},
    {cookie,origin:'https://vaos.vayushastr.workers.dev','sec-fetch-site':'cross-site','content-type':'application/x-www-form-urlencoded'},
  ]) {
    const request=req('/api/activepieces-mcp/start','POST',headers);
    request.body='csrf='+encodeURIComponent(csrf);
    const response=await handler(request,{});
    assert.equal(response.status,403);
  }
});

test('CSRF for one VAOS login session is invalid for a different signed session',async()=>{
  const view=await handler(req('/api/activepieces-mcp','GET',{cookie}),{});
  const csrf=(await view.text()).match(/name="csrf" value="([a-f0-9]{64})"/)?.[1];
  assert.ok(csrf);
  const otherCookie='vaos_session='+encodeURIComponent(createSessionToken('kaaviyam1519@gmail.com'));
  const request=req('/api/activepieces-mcp/start','POST',{
    cookie:otherCookie,'content-type':'application/x-www-form-urlencoded','sec-fetch-site':'same-origin',
  });
  request.body='csrf='+encodeURIComponent(csrf);
  const response=await handler(request,{});
  assert.equal(response.status,403);
  assert.match(await response.text(),/CSRF_INVALID/);
});

test('form submission with unsupported encoding fails closed',async()=>{
  const view=await handler(req('/api/activepieces-mcp','GET',{cookie}),{});
  const csrf=(await view.text()).match(/name="csrf" value="([a-f0-9]{64})"/)?.[1];
  assert.ok(csrf);
  const request=req('/api/activepieces-mcp/start','POST',{cookie,'content-type':'application/json','sec-fetch-site':'same-origin'});
  request.body={csrf};
  const response=await handler(request,{});
  assert.equal(response.status,403);
  assert.match(await response.text(),/CSRF_INVALID/);
});
