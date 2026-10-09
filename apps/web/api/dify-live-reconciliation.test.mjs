import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken} from '../lib/auth.mjs';
import {createDifyLiveReconciliationHandler} from './dify-live-reconciliation.mjs';
let calls=0;
const handler=createDifyLiveReconciliationHandler({createReader:()=>({readIncident:async()=>{calls++;return {status:'HOLD',reason:'NO_INCIDENT_RUN_OBSERVED',productionActivation:false}}})});
const base={url:'https://vaos.vayushastr.workers.dev/api/dify-live-reconciliation',method:'GET',env:{},headers:{origin:'https://vaos.vayushastr.workers.dev'}};
test('anonymous readback rejected before Dify is contacted',async()=>{
  calls=0;assert.equal((await handler(base)).status,403);assert.equal(calls,0);
});
test('readback requires exact origin',async()=>{
  calls=0;const req={...base,headers:{cookie:`vaos_session=${createSessionToken('shyamsundhar1982@gmail.com')}`}};
  assert.equal((await handler(req)).status,403);assert.equal(calls,0);
});
test('maker authorized readback is HOLD, never a pass or activation',async()=>{
  calls=0;const req={...base,headers:{...base.headers,cookie:`vaos_session=${createSessionToken('shyamsundhar1982@gmail.com')}`}};
  const res=await handler(req);assert.equal(res.status,200);
  const data=await res.json();assert.equal(data.status,'HOLD');assert.equal(data.productionActivation,false);
  assert.equal(calls,1);
});
test('POST to readback fails without touching Dify',async()=>{
  calls=0;assert.equal((await handler({...base,method:'POST'})).status,405);assert.equal(calls,0);
});
