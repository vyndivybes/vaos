import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createNodeRedEdgeAdapter } from './edge-adapter.mjs';

function manifest(){return{schemaVersion:'vaos.provider.v1',providerId:'node-red',displayName:'Node-RED',capabilities:['event.edge'],deploymentModes:['edge'],qualification:{state:'qualified',qualifiedCapabilities:['event.edge'],evidenceRefs:['q']},security:{secretBinding:'not-applicable',dataEgress:'controlled',authModes:['local'],callbackVerification:'shared-secret'},execution:{idempotency:'not-supported',retrySemantics:'conditional',verificationStrategy:'provider-readback',healthProbe:'required'}}}
function job(){return{id:'job-edge-1',intentId:'intent-edge-1',actionType:'EDGE.RUN_FLOW',payload:{flowKey:'testbench.capture',deviceId:'rig-01',effectClass:'read',input:{channel:1}}}}
function config(){return{flows:{'testbench.capture':{flowId:'flow-1',allowedDeviceIds:['rig-01'],physicalEffect:false}},timeoutMs:60000}}

test('Node-RED runs approved flow/device and verifies event identity',async()=>{
 const a=createNodeRedEdgeAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),transport:{async trigger(){return{status:202,runId:'edge-run-1'}},async readRun(){return{runId:'edge-run-1',flowId:'flow-1',deviceId:'rig-01',status:'SUCCEEDED',evidenceRef:'edge:e1'}}},config:config()});
 const r=await a.execute(job());assert.equal(r.effect.resourceId,'edge-run-1');assert.equal(r.verification.deviceId,'rig-01');
});

test('unapproved device is rejected before edge transport',async()=>{
 let touched=false;const j=job();j.payload.deviceId='rig-99';const a=createNodeRedEdgeAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),transport:{async trigger(){touched=true},async readRun(){touched=true}},config:config()});
 await assert.rejects(()=>a.execute(j),/NODERED_DEVICE_NOT_ALLOWED/);assert.equal(touched,false);
});

test('physical effect requires explicit high-assurance safety approval reference',async()=>{
 let touched=false;const cfg={flows:{'factory.actuate':{flowId:'flow-act',allowedDeviceIds:['act-1'],physicalEffect:true}},timeoutMs:60000};const j={...job(),payload:{flowKey:'factory.actuate',deviceId:'act-1',effectClass:'write',input:{state:'on'}}};
 const a=createNodeRedEdgeAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),transport:{async trigger(){touched=true},async readRun(){touched=true}},config:cfg});
 await assert.rejects(()=>a.execute(j),/NODERED_SAFETY_APPROVAL_REQUIRED/);assert.equal(touched,false);
 j.payload.safetyApprovalRef='safety:approved:1';const b=createNodeRedEdgeAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),transport:{async trigger(){return{status:202,runId:'r'}},async readRun(){return{runId:'r',flowId:'flow-act',deviceId:'act-1',status:'SUCCEEDED',evidenceRef:'e'}}},config:cfg});
 const r=await b.execute(j);assert.equal(r.verification.verified,true);
});

test('post-trigger timeout on physical/write flow is unknown outcome',async()=>{
 const j=job();j.payload.effectClass='write';const a=createNodeRedEdgeAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),transport:{async trigger(){const e=new Error('timeout');e.requestSent=true;throw e},async readRun(){}},config:config()});
 await assert.rejects(async()=>{try{await a.execute(j)}catch(e){assert.equal(e.code,'NODERED_OUTCOME_UNKNOWN');assert.equal(e.outcomeUnknown,true);throw e}},/NODERED_OUTCOME_UNKNOWN/);
});
