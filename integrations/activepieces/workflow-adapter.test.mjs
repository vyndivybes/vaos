import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createActivepiecesWorkflowAdapter } from './workflow-adapter.mjs';

function manifest(overrides={}) {
  return {
    schemaVersion:'vaos.provider.v1',
    providerId:'activepieces',
    displayName:'Activepieces',
    capabilities:['workflow.orchestrate'],
    deploymentModes:['self-hosted','managed-saas'],
    qualification:{state:'qualified',qualifiedCapabilities:['workflow.orchestrate'],evidenceRefs:['q']},
    security:{secretBinding:'required',dataEgress:'controlled',authModes:['bearer','local'],callbackVerification:'provider-specific'},
    execution:{idempotency:'not-supported',retrySemantics:'conditional',verificationStrategy:'composite',healthProbe:'required'},
    ...overrides,
  };
}
function broker(){
  return createCredentialBroker({
    async resolveCredential(req){
      if(req.bindingRef==='secret:activepieces:hook')return{kind:'url',value:'https://flows.example.test/webhooks/secret-path',providerId:'activepieces',capabilities:['workflow.orchestrate']};
      if(req.bindingRef==='secret:activepieces:api')return{kind:'bearer',value:'ap-api-token',providerId:'activepieces',capabilities:['workflow.orchestrate']};
      throw new Error('unknown binding');
    },
  });
}
function job(overrides={}){return{id:'job-ap-1',intentId:'intent-ap-1',actionType:'WORKFLOW.RUN',payload:{flowKey:'supplier.onboard',input:{supplierId:'SUP-1'}},...overrides}}
function config(overrides={}){return{
  apiBaseUrl:'https://flows.example.test/api/v1',
  flows:{'supplier.onboard':{flowId:'FLOW12345678901234567',projectId:'PROJ12345678901234567',hookBindingRef:'secret:activepieces:hook',apiBindingRef:'secret:activepieces:api'}},
  dispatchTimeoutMs:15000,receiptWaitMs:30000,readTimeoutMs:15000,...overrides
}}
function receiptPort(overrides={}){return{
  async issue(input){return{receiptRef:`receipt:${input.executionJobId}`,callbackUrl:'https://vaos.example/callback?token=one-time'}},
  async waitForReceipt(input){return{receiptRef:input.receiptRef,providerId:'activepieces',executionJobId:'job-ap-1',intentId:'intent-ap-1',actionKey:'supplier.onboard',status:'succeeded',evidence:{flowRunId:'RUN123456789012345678'}}},
  ...overrides
}}
function run(overrides={}){return{id:'RUN123456789012345678',flowId:'FLOW12345678901234567',projectId:'PROJ12345678901234567',status:'SUCCEEDED',environment:'PRODUCTION',...overrides}}

test('Activepieces dispatches governed flow and requires callback plus provider run readback',async()=>{
  const calls=[];
  const a=createActivepiecesWorkflowAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),receiptPort:receiptPort(),
    transport:{
      async postHook(req){calls.push({op:'hook',req});return{status:200,body:{accepted:true}}},
      async readRun(req){calls.push({op:'run',req});return run()},
    },config:config()
  });
  const r=await a.execute(job());
  assert.equal(r.adapterId,'activepieces.workflow.v1');
  assert.equal(r.effect.resourceId,'RUN123456789012345678');
  assert.equal(r.verification.verified,true);
  assert.equal(r.verification.flowId,'FLOW12345678901234567');
  assert.equal(calls[0].req.url,'https://flows.example.test/webhooks/secret-path');
  assert.equal(calls[0].req.body.executionJobId,'job-ap-1');
  assert.match(calls[0].req.body.callbackUrl,/vaos\.example/);
  assert.equal(calls[1].req.url,'https://flows.example.test/api/v1/flow-runs/RUN123456789012345678');
  assert.equal(calls[1].req.headers.Authorization,'Bearer ap-api-token');
  assert.equal(JSON.stringify(r).includes('secret-path'),false);
  assert.equal(JSON.stringify(r).includes('ap-api-token'),false);
});

test('unknown flow key and unqualified provider fail before receipt or network access',async()=>{
  let touched=false;
  for(const providers of [
    [manifest()],
    [manifest({qualification:{state:'evaluation',qualifiedCapabilities:[]}})],
  ]){
    const a=createActivepiecesWorkflowAdapter({
      capabilityRegistry:createCapabilityRegistry({providers}),credentialBroker:broker(),
      receiptPort:{async issue(){touched=true},async waitForReceipt(){touched=true}},
      transport:{async postHook(){touched=true},async readRun(){touched=true}},config:config()
    });
    if(providers[0].qualification.state==='qualified'){
      await assert.rejects(()=>a.execute(job({payload:{flowKey:'unknown',input:{}}})),/ACTIVEPIECES_FLOW_NOT_ALLOWED/);
    }else{
      await assert.rejects(()=>a.execute(job()),/ACTIVEPIECES_PROVIDER_NOT_QUALIFIED/);
    }
  }
  assert.equal(touched,false);
});

test('post-send webhook timeout is unknown and never blindly redispatched',async()=>{
  let posts=0;
  const a=createActivepiecesWorkflowAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),receiptPort:receiptPort(),
    transport:{async postHook(){posts++;const e=new Error('timeout');e.requestSent=true;throw e},async readRun(){}},config:config()
  });
  await assert.rejects(async()=>{try{await a.execute(job())}catch(e){assert.equal(e.code,'ACTIVEPIECES_OUTCOME_UNKNOWN');assert.equal(e.retryable,false);assert.equal(e.outcomeUnknown,true);throw e}},/ACTIVEPIECES_OUTCOME_UNKNOWN/);
  assert.equal(posts,1);
});

test('accepted hook without callback remains unknown and does not redispatch',async()=>{
  let posts=0;
  const a=createActivepiecesWorkflowAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),
    receiptPort:receiptPort({async waitForReceipt(){throw new Error('timeout')}}),
    transport:{async postHook(){posts++;return{status:200,body:{}}},async readRun(){}},config:config()
  });
  await assert.rejects(async()=>{try{await a.execute(job())}catch(e){assert.equal(e.code,'ACTIVEPIECES_RECEIPT_PENDING');assert.equal(e.outcomeUnknown,true);throw e}},/ACTIVEPIECES_RECEIPT_PENDING/);
  assert.equal(posts,1);
});

test('callback identity and flow run identity must match governed flow',async()=>{
  const cases=[
    receiptPort({async waitForReceipt(input){return{receiptRef:input.receiptRef,providerId:'activepieces',executionJobId:'other',intentId:'intent-ap-1',actionKey:'supplier.onboard',status:'succeeded',evidence:{flowRunId:'RUN123456789012345678'}}}}),
    receiptPort(),
  ];
  for(let i=0;i<cases.length;i++){
    const a=createActivepiecesWorkflowAdapter({
      capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),receiptPort:cases[i],
      transport:{
        async postHook(){return{status:200,body:{}}},
        async readRun(){return i===0?run():run({flowId:'OTHER'})},
      },config:config()
    });
    await assert.rejects(()=>a.execute(job()),/ACTIVEPIECES_VERIFICATION_FAILED/);
  }
});

test('running/paused run remains reconcilable while failed terminal statuses fail closed',async()=>{
  for(const [status,code,unknown] of [
    ['RUNNING','ACTIVEPIECES_RUN_INCOMPLETE',true],
    ['QUEUED','ACTIVEPIECES_RUN_INCOMPLETE',true],
    ['PAUSED','ACTIVEPIECES_RUN_INCOMPLETE',true],
    ['FAILED','ACTIVEPIECES_RUN_FAILED',false],
    ['TIMEOUT','ACTIVEPIECES_RUN_FAILED',false],
    ['CANCELED','ACTIVEPIECES_RUN_FAILED',false],
  ]){
    const a=createActivepiecesWorkflowAdapter({
      capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),receiptPort:receiptPort(),
      transport:{async postHook(){return{status:200,body:{}}},async readRun(){return run({status})}},config:config()
    });
    await assert.rejects(async()=>{try{await a.execute(job())}catch(e){assert.equal(e.code,code);assert.equal(e.outcomeUnknown,unknown);assert.equal(e.providerRunId,'RUN123456789012345678');throw e}},new RegExp(code));
  }
});
