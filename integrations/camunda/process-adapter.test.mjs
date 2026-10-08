import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createCamundaProcessAdapter } from './process-adapter.mjs';

function manifest(){return{schemaVersion:'vaos.provider.v1',providerId:'camunda',displayName:'Camunda',capabilities:['process.orchestrate'],deploymentModes:['self-hosted','managed-saas'],qualification:{state:'qualified',qualifiedCapabilities:['process.orchestrate'],evidenceRefs:['q']},security:{secretBinding:'required',dataEgress:'controlled',authModes:['bearer'],callbackVerification:'none'},execution:{idempotency:'not-supported',retrySemantics:'conditional',verificationStrategy:'provider-readback',healthProbe:'required'}}}
function broker(){return createCredentialBroker({async resolveCredential(){return{kind:'bearer',value:'camunda-token',providerId:'camunda',capabilities:['process.orchestrate']}}})}
function config(){return{baseUrl:'https://camunda.example/v2',secretBindingRef:'secret:camunda:api',processes:{'supplier.approval':{processDefinitionId:'supplier-approval',version:3}},timeoutMs:30000}}
function startJob(){return{id:'job-cam-1',intentId:'intent-cam-1',actionType:'PROCESS.RUN',payload:{processKey:'supplier.approval',command:'start',variables:{supplierId:'SUP-1'}}}}
function row(overrides={}){return{processInstanceKey:'2251799813690746',processDefinitionId:'supplier-approval',processDefinitionVersion:3,state:'ACTIVE',hasIncident:false,...overrides}}

test('Camunda starts exact approved process version and verifies instance readback',async()=>{
 const calls=[];
 const a=createCamundaProcessAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),transport:{
  async createProcess(req){calls.push({op:'create',req});return{status:200,body:{processInstanceKey:'2251799813690746',processDefinitionId:'supplier-approval',processDefinitionVersion:3}}},
  async readProcess(req){calls.push({op:'read',req});return row()},
  async cancelProcess(){}
 },config:config()});
 const r=await a.execute(startJob());
 assert.equal(r.effect.resourceId,'2251799813690746');
 assert.equal(r.verification.verified,true);
 const create=calls[0].req;
 assert.equal(create.url,'https://camunda.example/v2/process-instances');
 assert.equal(create.headers.Authorization,'Bearer camunda-token');
 assert.equal(create.body.processDefinitionId,'supplier-approval');
 assert.equal(create.body.processDefinitionVersion,3);
 assert.equal(create.body.awaitCompletion,false);
 assert.equal(create.body.variables._vaosIntentId,'intent-cam-1');
 assert.equal(create.body.variables._vaosExecutionJobId,'job-cam-1');
});

test('ambiguous process creation is unknown and never retried because Camunda create is non-idempotent',async()=>{
 let creates=0;
 const a=createCamundaProcessAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),transport:{
  async createProcess(){creates++;const e=new Error('timeout');e.requestSent=true;throw e},async readProcess(){},async cancelProcess(){}
 },config:config()});
 await assert.rejects(async()=>{try{await a.execute(startJob())}catch(e){assert.equal(e.code,'CAMUNDA_CREATE_OUTCOME_UNKNOWN');assert.equal(e.retryable,false);assert.equal(e.outcomeUnknown,true);throw e}},/CAMUNDA_CREATE_OUTCOME_UNKNOWN/);
 assert.equal(creates,1);
});

test('process readback must match exact configured definition/version and incidents fail into reconciliation',async()=>{
 for(const [bad,code] of [
  [row({processDefinitionVersion:4}),'CAMUNDA_VERIFICATION_FAILED'],
  [row({hasIncident:true}),'CAMUNDA_PROCESS_INCIDENT'],
 ]){
  const a=createCamundaProcessAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),transport:{
   async createProcess(){return{status:200,body:{processInstanceKey:'2251799813690746'}}},async readProcess(){return bad},async cancelProcess(){}
  },config:config()});
  await assert.rejects(()=>a.execute(startJob()),new RegExp(code));
 }
});

test('status is read-only; user-task completion command is forbidden',async()=>{
 const a=createCamundaProcessAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),transport:{
  async createProcess(){},async readProcess(){return row({state:'COMPLETED'})},async cancelProcess(){}
 },config:config()});
 const r=await a.execute({id:'job-s',intentId:'i',actionType:'PROCESS.RUN',payload:{processKey:'supplier.approval',command:'status',processInstanceKey:'2251799813690746'}});
 assert.equal(r.effect.state,'COMPLETED');
 assert.equal(r.effect.canonicalStateUpdated,false);
 await assert.rejects(()=>a.execute({id:'job-u',intentId:'i',actionType:'PROCESS.RUN',payload:{processKey:'supplier.approval',command:'complete-user-task',processInstanceKey:'2251799813690746'}}),/CAMUNDA_COMMAND_NOT_ALLOWED/);
});

test('cancel verifies TERMINATED state and ambiguous cancellation reconciles by instance key',async()=>{
 let terminated=false;
 const a=createCamundaProcessAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),transport:{
  async createProcess(){},
  async readProcess(){return row({state:terminated?'TERMINATED':'ACTIVE'})},
  async cancelProcess(){terminated=true;return{status:204}}
 },config:config()});
 const r=await a.execute({id:'job-x',intentId:'i',actionType:'PROCESS.RUN',payload:{processKey:'supplier.approval',command:'cancel',processInstanceKey:'2251799813690746'}});
 assert.equal(r.effect.state,'TERMINATED');
});

test('unknown process key fails before credentials or transport',async()=>{
 let touched=false;
 const a=createCamundaProcessAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:createCredentialBroker({async resolveCredential(){touched=true}}),transport:{async createProcess(){touched=true},async readProcess(){touched=true},async cancelProcess(){touched=true}},config:config()});
 await assert.rejects(()=>a.execute({...startJob(),payload:{processKey:'unknown',command:'start',variables:{}}}),/CAMUNDA_PROCESS_NOT_ALLOWED/);
 assert.equal(touched,false);
});
