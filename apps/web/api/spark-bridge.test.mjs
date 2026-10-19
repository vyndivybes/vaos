import test from 'node:test';
import assert from 'node:assert/strict';
import {createSparkBridgeHandler} from './spark-bridge.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
const TOKEN='a'.repeat(40), DEVICE='spark-windows-1';
const env={VAOS_SPARK_BRIDGE_CONTROL:'read-only-v1',VAOS_SPARK_BRIDGE_TOKEN:TOKEN,VAOS_SPARK_DEVICE_ID:DEVICE};
const id='11111111-1111-4111-8111-111111111111';
function req(question='How many inventory items?',options={}){
  return {method:'POST',headers:{authorization:'Bearer '+(options.token??TOKEN),'content-type':'application/json',...(options.headers||{})},
   body:{version:1,requestId:id,deviceId:options.deviceId??DEVICE,operation:options.operation??'ask',question},
   env:{...env,...(options.env||{})}};
}
function response(){return {code:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;return this},
 status(n){this.code=n;return this},json(v){this.body=v;return this}}}
test('SPARK bridge registered, never exposes unauthenticated data',async()=>{
  assert.equal(typeof DEFAULT_API_HANDLERS['/api/spark-bridge'],'function');
  let used=0;const handler=createSparkBridgeHandler({getReader:()=>{used++;throw Error()}});
  for(const options of [{token:'bad'},{deviceId:'other'},{env:{VAOS_SPARK_BRIDGE_TOKEN:''}},
    {env:{VAOS_SPARK_BRIDGE_CONTROL:'off'}},{headers:{origin:'https://attacker.example'}}]){
    const out=response();await handler(req('How many inventory items?',options),out);
    assert.notEqual(out.code,200);assert.equal(used,0);
  }
});
test('SPARK bridge rejects write commands and never invokes business tools',async()=>{
 const handler=createSparkBridgeHandler({getReader:()=>{throw Error('must not execute')}});
 for(const q of ['Approve supplier payment','Please deploy production','Delete all records']){
  const out=response();await handler(req(q),out);assert.equal(out.code,422);assert.equal(out.body.data,undefined);
 }
});
test('SPARK bridge returns qualified source-limited read observation and correlation',async()=>{
 let calls=0;
 const handler=createSparkBridgeHandler({getReader:()=>({execute:async job=>{
  calls++;assert.equal(job.actionType,'INVENTORY.OBSERVE_STOCK');
  return {actionType:job.actionType,sourceAuthority:'getAuthoritativeInventory',data:{records:[{id:'A'},{id:'B'}]}};
 }})});
 const out=response();await handler(req('How many stock items are recorded?'),out);
 assert.equal(out.code,200);assert.equal(out.body.data.requestId,id);assert.equal(out.body.data.readOnly,true);
 assert.equal(out.body.data.actionAuthorized,false);assert.equal(out.body.data.status,'OBSERVED');
 assert.equal(out.body.data.sourceAuthority,'getAuthoritativeInventory');assert.equal(calls,1);
 assert.equal(out.body.data.dataCompleteness,'BOUNDED_SOURCE_WINDOW');
 assert.equal(out.body.headers,undefined);
});
test('missing signed source fails with HOLD, not invented counts',async()=>{
 const handler=createSparkBridgeHandler({getReader:()=>{throw Error('not ready')}});
 const out=response();await handler(req(),out);
 assert.equal(out.code,200);assert.equal(out.body.data.status,'HOLD');
 assert.equal(out.body.data.actionAuthorized,false);
 assert.doesNotMatch(JSON.stringify(out.body),/not ready/);
});
test('oversized and malformed requests are rejected before source calls',async()=>{
 let calls=0;
 const handler=createSparkBridgeHandler({getReader:()=>{calls++;return null}});
 for(const bad of [req('a'.repeat(301)),req('How many stock items?',{operation:'execute'}),{...req(),body:{unexpected:true}}]){
  const out=response();await handler(bad,out);assert.equal(out.code,422);
 }
 assert.equal(calls,0);
});
