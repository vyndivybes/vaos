import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createDesktopAutomationAdapter } from './desktop-adapter.mjs';

function manifest(){return{schemaVersion:'vaos.provider.v1',providerId:'power-automate-desktop',displayName:'Power Automate Desktop',capabilities:['desktop.automate'],deploymentModes:['desktop'],qualification:{state:'qualified',qualifiedCapabilities:['desktop.automate'],evidenceRefs:['q']},security:{secretBinding:'not-applicable',dataEgress:'controlled',authModes:['local'],callbackVerification:'none'},execution:{idempotency:'not-supported',retrySemantics:'conditional',verificationStrategy:'provider-readback',healthProbe:'required'}}}
function job(){return{id:'job-rpa-1',intentId:'intent-rpa-1',actionType:'DESKTOP.RUN_FLOW',payload:{taskKey:'legacy.erp.export',machineKey:'finance-pc',input:{month:'2026-09'}}}}
function config(){return{tasks:{'legacy.erp.export':{flowId:'pad-flow-1',allowedMachineKeys:['finance-pc'],effectClass:'read'}},timeoutMs:300000}}

test('desktop adapter runs only approved flow on approved machine and verifies run',async()=>{
 const a=createDesktopAutomationAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),runner:{async start(input){assert.equal(input.flowId,'pad-flow-1');assert.equal(input.machineKey,'finance-pc');return{runId:'rpa-1'}},async wait(){return{runId:'rpa-1',flowId:'pad-flow-1',machineKey:'finance-pc',status:'SUCCEEDED',evidenceRef:'rpa:e1'}}},config:config()});
 const r=await a.execute(job());assert.equal(r.effect.resourceId,'rpa-1');assert.equal(r.verification.verified,true);
});

test('unapproved machine or task fails before local runner',async()=>{
 let touched=false;const runner={async start(){touched=true},async wait(){touched=true}};const a=createDesktopAutomationAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),runner,config:config()});
 const j=job();j.payload.machineKey='other';await assert.rejects(()=>a.execute(j),/DESKTOP_MACHINE_NOT_ALLOWED/);
 const j2=job();j2.payload.taskKey='unknown';await assert.rejects(()=>a.execute(j2),/DESKTOP_TASK_NOT_ALLOWED/);
 assert.equal(touched,false);
});

test('timeout after desktop flow starts is unknown and not blindly retried',async()=>{
 const a=createDesktopAutomationAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),runner:{async start(){const e=new Error('timeout');e.started=true;throw e},async wait(){}},config:config()});
 await assert.rejects(async()=>{try{await a.execute(job())}catch(e){assert.equal(e.code,'DESKTOP_OUTCOME_UNKNOWN');assert.equal(e.retryable,false);throw e}},/DESKTOP_OUTCOME_UNKNOWN/);
});

test('run readback identity mismatch fails verification',async()=>{
 const a=createDesktopAutomationAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),runner:{async start(){return{runId:'rpa-1'}},async wait(){return{runId:'rpa-1',flowId:'wrong',machineKey:'finance-pc',status:'SUCCEEDED'}}},config:config()});
 await assert.rejects(()=>a.execute(job()),/DESKTOP_VERIFICATION_FAILED/);
});
