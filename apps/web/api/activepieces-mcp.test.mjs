import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './activepieces-mcp.mjs';
import {createSessionToken} from '../lib/auth.mjs';

const cookie='vaos_session='+encodeURIComponent(createSessionToken('shyamsundhar1982@gmail.com'));
const namespace={
  idFromName(n){return n},
  get(){return {async put(){},async take(){return null},async status(){return {status:'NOT_CONNECTED',readonlyTools:[],productionActivation:false}},async connectionStatus(){return {stored:false,connected:false}},async credentialKeyReady(){return false}}},
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
test('Origin values cannot bypass required CSRF validation',async()=>{
  for(const origin of ['https://evil.example', 'null', 'https://vaos.vayushastr.workers.dev']){
    const res=await handler(req('/api/activepieces-mcp/start','POST',{cookie,origin}),{});
    assert.equal(res.status,403);
    assert.match(await res.text(),/CSRF_INVALID/);
  }
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

test('forged cross-site requests without a valid CSRF proof remain blocked',async()=>{
  const view=await handler(req('/api/activepieces-mcp','GET',{cookie}),{});
  const csrf=(await view.text()).match(/name="csrf" value="([a-f0-9]{64})"/)?.[1];
  assert.ok(csrf);
  for(const headers of [
    {cookie,origin:'https://evil.example','sec-fetch-site':'cross-site','content-type':'application/x-www-form-urlencoded'},
    {cookie,origin:'null','sec-fetch-site':'cross-site','content-type':'application/x-www-form-urlencoded'},
  ]) {
    const request=req('/api/activepieces-mcp/start','POST',headers);
    request.body='csrf='+csrf.slice(0,63)+(csrf.endsWith('f')?'e':'f'); // always invalid proof
    const response=await handler(request,{});
    assert.equal(response.status,403);
    assert.match(await response.text(),/CSRF_INVALID/);
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

test('same-site browser submission with CSRF does not fail before OAuth discovery',async(t)=>{
  const view=await handler(req('/api/activepieces-mcp','GET',{cookie}),{});
  const csrf=(await view.text()).match(/name="csrf" value="([a-f0-9]{64})"/)?.[1];
  assert.ok(csrf);
  const fetchStub=t.mock.method(globalThis,'fetch',async()=>{throw new Error('synthetic remote outage')});
  for(const headers of [
    {cookie,'content-type':'application/x-www-form-urlencoded','sec-fetch-site':'same-site'},
    {cookie,'content-type':'application/x-www-form-urlencoded','sec-fetch-site':'same-site',origin:'https://vaos.vayushastr.workers.dev'},
  ]) {
    const request=req('/api/activepieces-mcp/start','POST',headers);
    request.body='csrf='+csrf;
    const result=await handler(request,{});
    assert.equal(result.status,503,'matching CSRF should reach provider discovery');
    assert.match(await result.text(),/OAuth setup unavailable/);
  }
  assert.equal(fetchStub.mock.callCount(),2);
});

test('real Request adapter: signed form POST ignores unreliable Origin and Fetch Metadata',async(t)=>{
  const {invokeCloudflareHandler}=await import('../lib/cloudflare-adapter.mjs');
  const url='https://vaos.vayushastr.workers.dev/api/activepieces-mcp';
  const get=new Request(url,{headers:{Cookie:cookie}});
  const view=await invokeCloudflareHandler(handler,get,{ACTIVEPIECES_HANDSHAKE:namespace});
  const csrf=(await view.text()).match(/name="csrf" value="([a-f0-9]{64})"/)?.[1];
  assert.ok(csrf);
  const remote=t.mock.method(globalThis,'fetch',async()=>{throw new Error('synthetic upstream offline')});
  for(const [origin,site] of [
    ['null','cross-site'],
    ['https://cloud.activepieces.com','cross-site'],
    ['https://vaos.vayushastr.workers.dev','same-origin'],
    ['', 'same-site'],
  ]) {
    const headers={'Content-Type':'application/x-www-form-urlencoded','Cookie':cookie,'Sec-Fetch-Site':site};
    if(origin)headers.Origin=origin;
    const request=new Request(url+'/start',{method:'POST',headers,body:new URLSearchParams({csrf}).toString()});
    const response=await invokeCloudflareHandler(handler,request,{ACTIVEPIECES_HANDSHAKE:namespace});
    assert.equal(response.status,503,'valid CSRF and session must reach OAuth discovery');
    assert.match(await response.text(),/OAuth setup unavailable/);
  }
  assert.equal(remote.mock.callCount(),4);
});

test('setup failure preserves only a safe discovery code in the UI and durable evidence',async(t)=>{
  let evidence=null;
  const env={ACTIVEPIECES_HANDSHAKE:{
    idFromName:id=>id,
    get:()=>({
      async put(){},
      async record(value){evidence=value;},
      async status(){return evidence;},
    }),
  }};
  const view=await handler(req('/api/activepieces-mcp','GET',{cookie},env),{});
  const csrf=(await view.text()).match(/name="csrf" value="([a-f0-9]{64})"/)?.[1];
  assert.ok(csrf);
  t.mock.method(globalThis,'fetch',async()=>{throw Error('sensitive upstream diagnostic token=do_not_print');});
  const request=req('/api/activepieces-mcp/start','POST',
    {cookie,'content-type':'application/x-www-form-urlencoded'},env);
  request.body='csrf='+csrf;
  const res=await handler(request,{});
  const html=await res.text();
  assert.equal(res.status,503);
  assert.match(html,/ACTIVEPIECES_OAUTH_DISCOVERY_NETWORK_FAILED/);
  assert.doesNotMatch(html,/do_not_print|sensitive upstream diagnostic/);
  assert.equal(evidence.reasonCode,'ACTIVEPIECES_OAUTH_DISCOVERY_NETWORK_FAILED');
  assert.equal(evidence.productionActivation,false);
  assert.doesNotMatch(JSON.stringify(evidence),/do_not_print/);
});

test('public metadata health is read-only, sanitized and does not disclose OAuth secrets',async()=>{
  const env={ACTIVEPIECES_HANDSHAKE:{idFromName:n=>n,get:()=>({
    async probeDiscovery(){return {ok:false,code:'MCP_DISCOVERY_FETCH_TYPE_ERROR',httpStatus:null,cached:false,clientSecret:'must_not_appear'};},
  })}};
  const res=await handler(req('/api/activepieces-mcp/discovery-health','GET',{},env),{});
  assert.equal(res.status,200);
  const text=await res.text();
  assert.equal(JSON.parse(text).code,'MCP_DISCOVERY_FETCH_TYPE_ERROR');
  assert.equal(JSON.parse(text).productionActivation,false);
  assert.doesNotMatch(text,/must_not_appear|clientSecret/);
  assert.equal(res.headers.get('cache-control'),'public, max-age=60');
});
test('public metadata health is strictly GET and fails closed when storage is unavailable',async()=>{
  const post=await handler(req('/api/activepieces-mcp/discovery-health','POST',{}),{});
  assert.equal(post.status,405);
  const unavailable=await handler(req('/api/activepieces-mcp/discovery-health','GET',{},{}),{});
  assert.equal(unavailable.status,503);
});

test('persistent OAuth enrollment fails closed when protected key is absent',async()=>{
  const view=await handler(req('/api/activepieces-mcp','GET',{cookie}),{});
  const csrf=(await view.text()).match(/name="csrf" value="([a-f0-9]{64})"/)?.[1];
  assert.ok(csrf);
  const request=req('/api/activepieces-mcp/enroll/start','POST',
    {cookie,'content-type':'application/x-www-form-urlencoded'});
  request.body='csrf='+csrf;
  const result=await handler(request,{});
  assert.equal(result.status,503);
  assert.match(await result.text(),/VAULT_KEY_UNAVAILABLE/);
});
test('read-only status never includes OAuth tokens or enables production',async()=>{
  const res=await handler(req('/api/activepieces-mcp/status','GET',{cookie}),{});
  const json=await res.json();
  assert.equal(json.connected,false);
  assert.equal(json.productionActivation,false);
  assert.equal(json.connection.stored,false);
});
test('read-only verify is maker-gated and requires CSRF',async()=>{
  const other='vaos_session='+encodeURIComponent(createSessionToken('kaaviyam1519@gmail.com'));
  const reqOther=req('/api/activepieces-mcp/verify','POST',
    {cookie:other,'content-type':'application/x-www-form-urlencoded'});
  reqOther.body='csrf=wrong';
  assert.equal((await handler(reqOther,{})).status,403);
  const reqMaker=req('/api/activepieces-mcp/verify','POST',
    {cookie,'content-type':'application/x-www-form-urlencoded'});
  reqMaker.body='csrf=wrong';
  assert.equal((await handler(reqMaker,{})).status,403);
});

test('Activepieces sandbox preflight denies unauthenticated, wrong-origin and POST requests',async()=>{
  const path='/api/activepieces-mcp/synthetic-preflight';
  let calls=0;
  const env={ACTIVEPIECES_HANDSHAKE:{idFromName:n=>n,get:()=>({
    async preflightSyntheticSafely(){calls++;return {status:'HOLD',reason:'AP_PREFLIGHT_CONFIGURATION_UNVERIFIED',productionActivation:false}}
  })}};
  const anonymous=await handler(req(path,'GET',{origin:'https://vaos.vayushastr.workers.dev'},env),{});
  assert.equal(anonymous.status,403);
  const wrong=await handler(req(path,'GET',{cookie,origin:'https://other.invalid'},env),{});
  assert.equal(wrong.status,403);
  const post=await handler(req(path,'POST',{cookie,origin:'https://vaos.vayushastr.workers.dev'},env),{});
  assert.equal(post.status,405);
  assert.equal(calls,0);
  const good=await handler(req(path,'GET',{cookie,origin:'https://vaos.vayushastr.workers.dev'},env),{});
  assert.equal(good.status,200);
  const body=await good.json();
  assert.equal(body.status,'HOLD');
  assert.equal(body.productionActivation,false);
  assert.equal(calls,1);
});

test('sandbox repair requires maker POST, same-origin, exact JSON consent, never activates production',async()=>{
 let attempts=0;
 const env={ACTIVEPIECES_HANDSHAKE:{idFromName:x=>x,get:()=>({
   async repairOriginalSandboxOnce(){attempts++;return {status:'HOLD',reason:'AP_REPAIR_UNSAFE_OR_UNNEEDED',productionActivation:false,runSubmitted:false}}
 })}};
 const path='/api/activepieces-mcp/synthetic-repair';
 const body=JSON.stringify({approval:'REPAIR_ORIGINAL_ACTIVEPIECES_SANDBOX_ONCE_20261009'});
 for(const [h,m,b,code] of [
  [{origin:'https://vaos.vayushastr.workers.dev','content-type':'application/json'},'POST',body,403],
  [{cookie,origin:'https://bad.invalid','content-type':'application/json'},'POST',body,403],
  [{cookie,origin:'https://vaos.vayushastr.workers.dev','content-type':'application/json'},'GET',body,405],
  [{cookie,origin:'https://vaos.vayushastr.workers.dev','content-type':'application/json'},'POST','{}',403],
  [{cookie,origin:'https://vaos.vayushastr.workers.dev','content-type':'text/plain'},'POST',body,403],
 ]){
   const input=req(path,m,h,env);input.body=b;
   assert.equal((await handler(input,{})).status,code);
 }
 assert.equal(attempts,0);
 const input=req(path,'POST',{cookie,origin:'https://vaos.vayushastr.workers.dev',
   'content-type':'application/json'},env);input.body=body;
 const response=await handler(input,{});
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.status,'HOLD');assert.equal(data.productionActivation,false);
 assert.equal(attempts,1);
});
