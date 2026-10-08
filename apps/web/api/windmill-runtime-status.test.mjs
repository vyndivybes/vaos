import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../lib/auth.mjs';
import { createCloudflareApp } from '../cloudflare-worker.mjs';
import { createWindmillRuntimeStatusHandler } from './windmill-runtime-status.mjs';

const owner='shyamsundhar1982@gmail.com';
const cookie=()=> 'vaos_session='+encodeURIComponent(createSessionToken(owner));
const request=(method='GET',authenticated=false)=>({
  method,headers: authenticated?{cookie:cookie()}: {},env:{},
});
function response(){
  let status=200;let value=null;
  return {
    setHeader(){return this;},status(n){status=n;return this;},
    json(v){value=v;return this;},
    get result(){return {status,value};},
  };
}
test('unauthenticated users cannot inspect Windmill DO state',async()=>{
  const r=response();
  await createWindmillRuntimeStatusHandler()(request(),r);
  assert.equal(r.result.status,401);
});
test('valid session without explicit qualified operator permission is denied',async()=>{
  const r=response();
  await createWindmillRuntimeStatusHandler()(request('GET',true),r);
  assert.equal(r.result.status,403);
});
test('authorized read-only health reports durable binding and disabled production routing',async()=>{
  const r=response();
  const req=request('GET',true);
  req.env={
    VAOS_WINDMILL_STATUS_READERS:owner,
    WINDMILL_ADMISSION:{getByName(name){
      assert.equal(name,'vaos-windmill-global-v1');
      return {status:async()=>({
        schemaVersion:'vaos.windmill.durable-admission.v1',
        active:null,auditCount:0,maxConcurrentRuns:1,queuedRuns:0,productionActivation:false,
      })};
    }},
  };
  await createWindmillRuntimeStatusHandler()(req,r);
  assert.equal(r.result.status,200);
  assert.equal(r.result.value.data.bindingReady,true);
  assert.equal(r.result.value.data.routingEnabled,false);
});
test('authorized read fails closed if binding unavailable',async()=>{
  const r=response();
  const req=request('GET',true);
  req.env.VAOS_WINDMILL_STATUS_READERS=owner;
  await createWindmillRuntimeStatusHandler()(req,r);
  assert.equal(r.result.status,503);
});
test('Windmill status endpoint rejects mutation attempts',async()=>{
  const r=response();
  await createWindmillRuntimeStatusHandler()(request('POST',true),r);
  assert.equal(r.result.status,405);
});
