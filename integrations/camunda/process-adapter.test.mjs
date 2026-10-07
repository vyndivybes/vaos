import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createCamundaProcessAdapter } from './process-adapter.mjs';

function manifest(){return{schemaVersion:'vaos.provider.v1',providerId:'camunda',displayName:'Camunda',capabilities:['process.orchestrate'],deploymentModes:['self-hosted'],qualification:{state:'qualified',qualifiedCapabilities:['process.orchestrate'],evidenceRefs:['q']},security:{secretBinding:'not-applicable',dataEgress:'controlled',authModes:['local'],callbackVerification:'none'},execution:{idempotency:'not-supported',retrySemantics:'conditional',verificationStrategy:'provider-readback',healthProbe:'required'}}}
function job(){return{id:'job-process-1',intentId:'intent-process-1',actionType:'PROCESS.START',payload:{processKey:'quality.capa',variables:{capaId:'C-1'},authorityMode:'vaos'}}}
function config(){return{processes:{'quality.capa':{definitionKey:'quality-capa',version:3}},timeoutMs:300000}}

test('Camunda starts approved process with VAOS authority marker and verifies instance',async()=>{
 const a=createCamundaProcessAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),transport:{async start(input){assert.equal(input.businessKey,'job-process-1');assert.equal(input.variables.vaosAuthorityMode,'vaos');return{status:201,processInstanceId:'pi-1',definitionKey:'quality-capa',version:3}},async wait(){return{processInstanceId:'pi-1',definitionKey:'quality-capa',version:3,status:'COMPLETED'}}},config:config()});
 const r=await a.execute(job());assert.equal(r.effect.resourceId,'pi-1');assert.equal(r.verification.verified,true);
});

test('Camunda cannot be asked to become the approval authority',async()=>{
 let touched=false;const j=job();j.payload.authorityMode='camunda';const a=createCamundaProcessAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),transport:{async start(){touched=true},async wait(){touched=true}},config:config()});
 await assert.rejects(()=>a.execute(j),/CAMUNDA_AUTHORITY_BYPASS_FORBIDDEN/);assert.equal(touched,false);
});

test('ambiguous process start is unknown outcome and not blindly retried',async()=>{
 const a=createCamundaProcessAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),transport:{async start(){const e=new Error('timeout');e.requestSent=true;throw e},async wait(){}},config:config()});
 await assert.rejects(async()=>{try{await a.execute(job())}catch(e){assert.equal(e.code,'CAMUNDA_OUTCOME_UNKNOWN');assert.equal(e.retryable,false);throw e}},/CAMUNDA_OUTCOME_UNKNOWN/);
});

test('process definition/version readback mismatch fails verification',async()=>{
 const a=createCamundaProcessAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),transport:{async start(){return{status:201,processInstanceId:'pi-1',definitionKey:'quality-capa',version:3}},async wait(){return{processInstanceId:'pi-1',definitionKey:'quality-capa',version:4,status:'COMPLETED'}}},config:config()});
 await assert.rejects(()=>a.execute(job()),/CAMUNDA_VERIFICATION_FAILED/);
});
