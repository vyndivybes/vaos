import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createActivepiecesWorkflowAdapter } from './workflow-adapter.mjs';

function manifest(){return{schemaVersion:'vaos.provider.v1',providerId:'activepieces',displayName:'Activepieces',capabilities:['workflow.orchestrate'],deploymentModes:['self-hosted'],qualification:{state:'qualified',qualifiedCapabilities:['workflow.orchestrate'],evidenceRefs:['q']},security:{secretBinding:'required',dataEgress:'controlled',authModes:['local'],callbackVerification:'provider-specific'},execution:{idempotency:'not-supported',retrySemantics:'conditional',verificationStrategy:'callback-evidence',healthProbe:'required'}}}
function broker(){return createCredentialBroker({async resolveCredential(){return{kind:'url',value:'https://activepieces.internal.example/api/v1/webhooks/flow-1',providerId:'activepieces',capabilities:['workflow.orchestrate']}}})}
function job(){return{id:'job-ap-1',intentId:'intent-ap-1',actionType:'AUTOMATION.RUN_WORKFLOW',payload:{workflowKey:'supplier.onboard',input:{supplierId:'SUP-1'}}}}
function config(){return{hookSecretBindingRef:'secret:activepieces:supplier',allowedHookOrigins:['https://activepieces.internal.example'],receiptWaitMs:30000,dispatchTimeoutMs:15000}}
function receiptPort(){return{async issue(i){return{receiptRef:'receipt:'+i.executionJobId,callbackUrl:'https://vaos.example.test/callback?token=opaque'}},async waitForReceipt(i){return{receiptRef:i.receiptRef,providerId:'activepieces',executionJobId:'job-ap-1',intentId:'intent-ap-1',actionKey:'supplier.onboard',status:'succeeded',evidence:{flowRunId:'run-1'}}}}}

test('Activepieces dispatches governed webhook flow and requires VAOS callback receipt',async()=>{
 const a=createActivepiecesWorkflowAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),receiptPort:receiptPort(),transport:{async postHook(req){assert.equal(req.body.workflowKey,'supplier.onboard');return{status:200,body:{}}}},config:config()});
 const r=await a.execute(job());assert.equal(r.effect.resourceId,'receipt:job-ap-1');assert.equal(r.verification.verified,true);
});

test('hook origin must be explicitly allow-listed even when URL comes from secret broker',async()=>{
 let touched=false;const bad=createCredentialBroker({async resolveCredential(){return{kind:'url',value:'https://evil.example/hook',providerId:'activepieces',capabilities:['workflow.orchestrate']}}});
 const a=createActivepiecesWorkflowAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:bad,receiptPort:receiptPort(),transport:{async postHook(){touched=true}},config:config()});
 await assert.rejects(()=>a.execute(job()),/ACTIVEPIECES_HOOK_NOT_ALLOWED/);assert.equal(touched,false);
});

test('post-send timeout is unknown and never blindly redispatched',async()=>{
 const a=createActivepiecesWorkflowAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),receiptPort:receiptPort(),transport:{async postHook(){const e=new Error('timeout');e.requestSent=true;throw e}},config:config()});
 await assert.rejects(async()=>{try{await a.execute(job())}catch(e){assert.equal(e.code,'ACTIVEPIECES_OUTCOME_UNKNOWN');assert.equal(e.retryable,false);throw e}},/ACTIVEPIECES_OUTCOME_UNKNOWN/);
});

test('callback identity mismatch fails verification',async()=>{
 const rp=receiptPort();rp.waitForReceipt=async i=>({receiptRef:i.receiptRef,providerId:'activepieces',executionJobId:'wrong',intentId:'intent-ap-1',actionKey:'supplier.onboard',status:'succeeded',evidence:{}});
 const a=createActivepiecesWorkflowAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),receiptPort:rp,transport:{async postHook(){return{status:200,body:{}}}},config:config()});
 await assert.rejects(()=>a.execute(job()),/ACTIVEPIECES_VERIFICATION_FAILED/);
});
