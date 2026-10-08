import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createTemporalDurableAdapter } from './durable-adapter.mjs';

function manifest(){return{schemaVersion:'vaos.provider.v1',providerId:'temporal',displayName:'Temporal',capabilities:['workflow.durable'],deploymentModes:['self-hosted','managed-saas'],qualification:{state:'qualified',qualifiedCapabilities:['workflow.durable'],evidenceRefs:['q']},security:{secretBinding:'required',dataEgress:'controlled',authModes:['api-key'],callbackVerification:'none'},execution:{idempotency:'native',retrySemantics:'safe',verificationStrategy:'provider-readback',healthProbe:'required'}}}
function broker(){return createCredentialBroker({async resolveCredential(){return{kind:'api-key',value:'temporal-key',providerId:'temporal',capabilities:['workflow.durable']}}})}
function config(){return{secretBindingRef:'secret:temporal:api',namespace:'vaos',workflows:{'supplier.onboard':{workflowType:'supplierOnboardingWorkflow',taskQueue:'vaos-supplier',allowedSignals:['approve','reject'],allowedQueries:['status']}},timeoutMs:30000}}
function startJob(){return{id:'job-temp-1',intentId:'intent-temp-1',actionType:'WORKFLOW.DURABLE',payload:{workflowKey:'supplier.onboard',command:'start',input:{supplierId:'SUP-1'}}}}

test('Temporal start uses stable workflow ID and conflict policies that prevent duplicate workflow creation',async()=>{
 const calls=[];
 const a=createTemporalDurableAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),transport:{
  async startWorkflow(req){calls.push({op:'start',req});return{workflowId:'vaos:job-temp-1',runId:'run-1'}},
  async describeWorkflow(req){calls.push({op:'describe',req});return{workflowId:'vaos:job-temp-1',runId:'run-1',workflowType:'supplierOnboardingWorkflow',status:'RUNNING'}},
  async signalWorkflow(){},async queryWorkflow(){},async terminateWorkflow(){}
 },config:config()});
 const r=await a.execute(startJob());
 assert.equal(r.effect.resourceId,'vaos:job-temp-1');
 assert.equal(r.verification.verified,true);
 const start=calls[0].req;
 assert.equal(start.workflowId,'vaos:job-temp-1');
 assert.equal(start.idConflictPolicy,'USE_EXISTING');
 assert.equal(start.idReusePolicy,'REJECT_DUPLICATE');
 assert.equal(start.taskQueue,'vaos-supplier');
 assert.equal(start.apiKey,'temporal-key');
 assert.equal(JSON.stringify(r).includes('temporal-key'),false);
});

test('post-send start ambiguity reconciles by stable workflow ID instead of starting again',async()=>{
 let starts=0;
 const a=createTemporalDurableAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),transport:{
  async startWorkflow(){starts++;const e=new Error('timeout');e.requestSent=true;throw e},
  async describeWorkflow(){return{workflowId:'vaos:job-temp-1',runId:'run-existing',workflowType:'supplierOnboardingWorkflow',status:'RUNNING'}},
  async signalWorkflow(){},async queryWorkflow(){},async terminateWorkflow(){}
 },config:config()});
 const r=await a.execute(startJob());
 assert.equal(r.verification.runId,'run-existing');
 assert.equal(starts,1);
});

test('unknown workflow key or command fails before credentials/provider calls',async()=>{
 let touched=false;
 const a=createTemporalDurableAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:createCredentialBroker({async resolveCredential(){touched=true}}),transport:{async startWorkflow(){touched=true},async describeWorkflow(){touched=true},async signalWorkflow(){touched=true},async queryWorkflow(){touched=true},async terminateWorkflow(){touched=true}},config:config()});
 await assert.rejects(()=>a.execute({...startJob(),payload:{workflowKey:'unknown',command:'start',input:{}}}),/TEMPORAL_WORKFLOW_NOT_ALLOWED/);
 await assert.rejects(()=>a.execute({...startJob(),payload:{workflowKey:'supplier.onboard',command:'delete',input:{}}}),/TEMPORAL_COMMAND_NOT_ALLOWED/);
 assert.equal(touched,false);
});

test('signal command is allow-listed and ambiguous delivery is not blindly retried',async()=>{
 let signals=0;
 const a=createTemporalDurableAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),transport:{
  async startWorkflow(){},async describeWorkflow(){return{workflowId:'vaos:origin-job',runId:'run-1',workflowType:'supplierOnboardingWorkflow',status:'RUNNING'}},
  async signalWorkflow(){signals++;const e=new Error('timeout');e.requestSent=true;throw e},async queryWorkflow(){},async terminateWorkflow(){}
 },config:config()});
 await assert.rejects(async()=>{try{await a.execute({id:'job-sig',intentId:'i',actionType:'WORKFLOW.DURABLE',payload:{workflowKey:'supplier.onboard',command:'signal',targetExecutionJobId:'origin-job',signalKey:'approve',args:{approved:true}}})}catch(e){assert.equal(e.code,'TEMPORAL_SIGNAL_OUTCOME_UNKNOWN');assert.equal(e.outcomeUnknown,true);throw e}},/TEMPORAL_SIGNAL_OUTCOME_UNKNOWN/);
 assert.equal(signals,1);
});

test('query command is read-only and returns provider result without changing canonical truth',async()=>{
 const a=createTemporalDurableAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),transport:{
  async startWorkflow(){},async describeWorkflow(){return{workflowId:'vaos:origin-job',runId:'run-1',workflowType:'supplierOnboardingWorkflow',status:'RUNNING'}},async signalWorkflow(){},
  async queryWorkflow(){return{state:'WAITING_APPROVAL'}},async terminateWorkflow(){}
 },config:config()});
 const r=await a.execute({id:'job-q',intentId:'i',actionType:'WORKFLOW.DURABLE',payload:{workflowKey:'supplier.onboard',command:'query',targetExecutionJobId:'origin-job',queryKey:'status'}});
 assert.deepEqual(r.effect.output,{state:'WAITING_APPROVAL'});
 assert.equal(r.effect.canonicalStateUpdated,false);
});

test('terminate command verifies terminal state and preserves target workflow identity',async()=>{
 let terminated=false;
 const a=createTemporalDurableAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),transport:{
  async startWorkflow(){},
  async describeWorkflow(){return{workflowId:'vaos:origin-job',runId:'run-1',workflowType:'supplierOnboardingWorkflow',status:terminated?'TERMINATED':'RUNNING'}},
  async signalWorkflow(){},async queryWorkflow(){},
  async terminateWorkflow(){terminated=true;return{accepted:true}}
 },config:config()});
 const r=await a.execute({id:'job-t',intentId:'i',actionType:'WORKFLOW.DURABLE',payload:{workflowKey:'supplier.onboard',command:'terminate',targetExecutionJobId:'origin-job',reason:'governed cancellation'}});
 assert.equal(r.effect.state,'TERMINATED');
 assert.equal(r.effect.resourceId,'vaos:origin-job');
});

test('workflow readback must match configured workflow type and identity',async()=>{
 const a=createTemporalDurableAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),transport:{
  async startWorkflow(){return{workflowId:'vaos:job-temp-1',runId:'run-1'}},
  async describeWorkflow(){return{workflowId:'other',runId:'run-1',workflowType:'otherType',status:'RUNNING'}},
  async signalWorkflow(){},async queryWorkflow(){},async terminateWorkflow(){}
 },config:config()});
 await assert.rejects(()=>a.execute(startJob()),/TEMPORAL_VERIFICATION_FAILED/);
});
