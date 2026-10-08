import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createNodeRedEdgeAdapter } from './edge-adapter.mjs';

function manifest(overrides={}) {
  return {
    schemaVersion:'vaos.provider.v1',
    providerId:'node-red',
    displayName:'Node-RED',
    capabilities:['event.edge'],
    deploymentModes:['edge','self-hosted'],
    qualification:{state:'qualified',qualifiedCapabilities:['event.edge'],evidenceRefs:['q']},
    security:{secretBinding:'required',dataEgress:'controlled',authModes:['bearer','local'],callbackVerification:'provider-specific'},
    execution:{idempotency:'not-supported',retrySemantics:'conditional',verificationStrategy:'composite',healthProbe:'required'},
    ...overrides,
  };
}
function broker(){
  return createCredentialBroker({
    async resolveCredential(req){
      if(req.bindingRef==='secret:nodered:event')return{kind:'url',value:'https://edge.example.test/vaos/temperature',providerId:'node-red',capabilities:['event.edge']};
      if(req.bindingRef==='secret:nodered:admin')return{kind:'bearer',value:'nodered-admin-read-token',providerId:'node-red',capabilities:['event.edge']};
      throw new Error('unknown binding');
    },
  });
}
function config(overrides={}) {
  return {
    adminBaseUrl:'https://edge.example.test',
    flows:{
      'factory.temperature':{
        flowId:'flow-temp-01',
        eventBindingRef:'secret:nodered:event',
        adminBindingRef:'secret:nodered:admin',
        allowedDeviceIds:['sensor-01','sensor-02'],
        allowedEventTypes:['temperature.reading'],
        effectClass:'observe',
      },
      'factory.relay':{
        flowId:'flow-relay-01',
        eventBindingRef:'secret:nodered:event',
        adminBindingRef:'secret:nodered:admin',
        allowedDeviceIds:['relay-01'],
        allowedEventTypes:['relay.set'],
        effectClass:'physical',
      },
    },
    dispatchTimeoutMs:10000,
    receiptWaitMs:30000,
    readTimeoutMs:10000,
    ...overrides,
  };
}
function job(overrides={}) {
  return {
    id:'job-edge-1',intentId:'intent-edge-1',actionType:'EDGE.EVENT',
    payload:{flowKey:'factory.temperature',deviceId:'sensor-01',eventType:'temperature.reading',data:{celsius:24.1}},
    ...overrides,
  };
}
function receiptPort(overrides={}) {
  return {
    async issue(input){return{receiptRef:`receipt:${input.executionJobId}`,callbackUrl:'https://vaos.example/callback?token=one-time'}},
    async waitForReceipt(input){return{receiptRef:input.receiptRef,providerId:'node-red',executionJobId:'job-edge-1',intentId:'intent-edge-1',actionKey:'factory.temperature',status:'succeeded',evidence:{edgeEventId:'edge-event-77'}}},
    ...overrides,
  };
}
function flowRow(overrides={}){return{id:'flow-temp-01',label:'Temperature Intake',nodes:[],configs:[],...overrides}}

test('Node-RED verifies preinstalled flow/runtime then dispatches governed device event and callback receipt',async()=>{
  const calls=[];
  const a=createNodeRedEdgeAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
    credentialBroker:broker(),receiptPort:receiptPort(),
    transport:{
      async readRuntimeState(req){calls.push({op:'state',req});return{state:'start'}},
      async readFlow(req){calls.push({op:'flow',req});return flowRow()},
      async postEvent(req){calls.push({op:'event',req});return{status:202,body:{accepted:true}}},
    },config:config(),
  });
  const r=await a.execute(job());
  assert.equal(r.adapterId,'node-red.edge.v1');
  assert.equal(r.effect.resourceId,'edge-event-77');
  assert.equal(r.effect.state,'SUCCEEDED');
  assert.equal(r.verification.flowId,'flow-temp-01');
  assert.equal(r.verification.deviceId,'sensor-01');
  assert.equal(r.verification.verified,true);

  const state=calls.find(x=>x.op==='state').req;
  assert.equal(state.url,'https://edge.example.test/flows/state');
  assert.equal(state.headers.Authorization,'Bearer nodered-admin-read-token');
  const flow=calls.find(x=>x.op==='flow').req;
  assert.equal(flow.url,'https://edge.example.test/flow/flow-temp-01');
  const event=calls.find(x=>x.op==='event').req;
  assert.equal(event.url,'https://edge.example.test/vaos/temperature');
  assert.equal(event.body.deviceId,'sensor-01');
  assert.equal(event.body.eventType,'temperature.reading');
  assert.match(event.body.callbackUrl,/vaos\.example/);
  assert.equal(JSON.stringify(r).includes('nodered-admin-read-token'),false);
  assert.equal(JSON.stringify(r).includes('/vaos/temperature'),false);
});

test('unknown flow/device/event type fail before credentials or edge calls',async()=>{
  for(const payload of [
    {flowKey:'unknown',deviceId:'sensor-01',eventType:'temperature.reading',data:{}},
    {flowKey:'factory.temperature',deviceId:'sensor-99',eventType:'temperature.reading',data:{}},
    {flowKey:'factory.temperature',deviceId:'sensor-01',eventType:'shell.exec',data:{}},
  ]){
    let touched=false;
    const a=createNodeRedEdgeAdapter({
      capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
      credentialBroker:createCredentialBroker({async resolveCredential(){touched=true}}),
      receiptPort:{async issue(){touched=true},async waitForReceipt(){touched=true}},
      transport:{async readRuntimeState(){touched=true},async readFlow(){touched=true},async postEvent(){touched=true}},
      config:config(),
    });
    await assert.rejects(()=>a.execute({...job(),payload}),/NODERED_(FLOW|DEVICE|EVENT)_NOT_ALLOWED/);
    assert.equal(touched,false);
  }
});

test('physical flow requires explicit safety authority before any provider access',async()=>{
  let touched=false;
  const a=createNodeRedEdgeAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
    credentialBroker:createCredentialBroker({async resolveCredential(){touched=true}}),
    receiptPort:{async issue(){touched=true},async waitForReceipt(){touched=true}},
    transport:{async readRuntimeState(){touched=true},async readFlow(){touched=true},async postEvent(){touched=true}},
    config:config(),
  });
  await assert.rejects(()=>a.execute({
    id:'job-relay',intentId:'intent-relay',actionType:'EDGE.EVENT',
    payload:{flowKey:'factory.relay',deviceId:'relay-01',eventType:'relay.set',data:{state:'on'}},
  }),/NODERED_SAFETY_AUTHORITY_REQUIRED/);
  assert.equal(touched,false);
});

test('stopped runtime or mismatched flow identity fails before event dispatch',async()=>{
  for(const mode of ['stopped','mismatch']){
    let posted=false;
    const a=createNodeRedEdgeAdapter({
      capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
      credentialBroker:broker(),receiptPort:receiptPort(),
      transport:{
        async readRuntimeState(){return{state:mode==='stopped'?'stop':'start'}},
        async readFlow(){return flowRow({id:mode==='mismatch'?'other':'flow-temp-01'})},
        async postEvent(){posted=true},
      },config:config(),
    });
    await assert.rejects(()=>a.execute(job()),/NODERED_(RUNTIME_NOT_READY|FLOW_VERIFICATION_FAILED)/);
    assert.equal(posted,false);
  }
});

test('post-send edge ambiguity is unknown and never blindly replayed',async()=>{
  let posts=0;
  const a=createNodeRedEdgeAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
    credentialBroker:broker(),receiptPort:receiptPort(),
    transport:{
      async readRuntimeState(){return{state:'start'}},async readFlow(){return flowRow()},
      async postEvent(){posts++;const e=new Error('timeout');e.requestSent=true;throw e},
    },config:config(),
  });
  await assert.rejects(async()=>{try{await a.execute(job())}catch(e){assert.equal(e.code,'NODERED_OUTCOME_UNKNOWN');assert.equal(e.retryable,false);assert.equal(e.outcomeUnknown,true);throw e}},/NODERED_OUTCOME_UNKNOWN/);
  assert.equal(posts,1);
});

test('accepted event without verified callback remains unknown',async()=>{
  let posts=0;
  const a=createNodeRedEdgeAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
    credentialBroker:broker(),receiptPort:receiptPort({async waitForReceipt(){throw new Error('timeout')}}),
    transport:{async readRuntimeState(){return{state:'start'}},async readFlow(){return flowRow()},async postEvent(){posts++;return{status:202,body:{}}}},
    config:config(),
  });
  await assert.rejects(async()=>{try{await a.execute(job())}catch(e){assert.equal(e.code,'NODERED_RECEIPT_PENDING');assert.equal(e.outcomeUnknown,true);throw e}},/NODERED_RECEIPT_PENDING/);
  assert.equal(posts,1);
});

test('adapter surface exposes no flow deployment or node-install operation',()=>{
  const a=createNodeRedEdgeAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
    credentialBroker:broker(),receiptPort:receiptPort(),
    transport:{async readRuntimeState(){},async readFlow(){},async postEvent(){}},
    config:config(),
  });
  assert.deepEqual(Object.keys(a).sort(),['capability','execute','id','providerId']);
  assert.equal('deployFlow' in a,false);
  assert.equal('installNode' in a,false);
});
