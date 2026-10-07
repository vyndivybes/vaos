import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createTemporalWorkflowAdapter } from './workflow-adapter.mjs';

function manifest(){return{schemaVersion:'vaos.provider.v1',providerId:'temporal',displayName:'Temporal',capabilities:['workflow.durable'],deploymentModes:['self-hosted'],qualification:{state:'qualified',qualifiedCapabilities:['workflow.durable'],evidenceRefs:['q']},security:{secretBinding:'not-applicable',dataEgress:'controlled',authModes:['local'],callbackVerification:'none'},execution:{idempotency:'native',retrySemantics:'safe',verificationStrategy:'provider-readback',healthProbe:'required'}}}
function job(){return{id:'job-durable-1',intentId:'intent-durable-1',actionType:'WORKFLOW.START_DURABLE',payload:{workflowKey:'supplier.onboarding',args:{supplierId:'SUP-1'}}}}
function config(){return{workflows:{'supplier.onboarding':{workflowType:'SupplierOnboarding',taskQueue:'vaos-supplier'}},timeoutMs:300000}}

test('Temporal starts approved workflow with stable VAOS workflow ID and verifies completion',async()=>{
 const calls=[];const a=createTemporalWorkflowAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),transport:{async start(r){calls.push(r);return{workflowId:'vaos:job-durable-1',runId:'run-1',outcome:'STARTED'}},async wait(){return{workflowId:'vaos:job-durable-1',runId:'run-1',status:'COMPLETED',result:{ok:true}}}},config:config()});
 const r=await a.execute(job());assert.equal(calls[0].workflowId,'vaos:job-durable-1');assert.equal(r.effect.resourceId,'vaos:job-durable-1');assert.equal(r.verification.runId,'run-1');
});

test('already-started same workflow ID is treated as replay, not duplicate execution',async()=>{
 let starts=0;const a=createTemporalWorkflowAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),transport:{async start(){starts++;return{workflowId:'vaos:job-durable-1',runId:'run-1',outcome:'ALREADY_STARTED'}},async wait(){return{workflowId:'vaos:job-durable-1',runId:'run-1',status:'COMPLETED',result:{ok:true}}}},config:config()});
 const r=await a.execute(job());assert.equal(starts,1);assert.equal(r.effect.replay,true);
});

test('unknown workflow key fails before provider access',async()=>{
 let touched=false;const j=job();j.payload.workflowKey='unknown';const a=createTemporalWorkflowAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),transport:{async start(){touched=true},async wait(){touched=true}},config:config()});
 await assert.rejects(()=>a.execute(j),/TEMPORAL_WORKFLOW_NOT_ALLOWED/);assert.equal(touched,false);
});

test('completion readback mismatch fails verification',async()=>{
 const a=createTemporalWorkflowAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),transport:{async start(){return{workflowId:'vaos:job-durable-1',runId:'run-1',outcome:'STARTED'}},async wait(){return{workflowId:'other',runId:'run-1',status:'COMPLETED'}}},config:config()});
 await assert.rejects(()=>a.execute(job()),/TEMPORAL_VERIFICATION_FAILED/);
});
