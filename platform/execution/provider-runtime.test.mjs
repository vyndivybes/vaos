import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderRuntime } from './provider-runtime.mjs';

function job(){return{id:'job-1',intentId:'intent-1',actionType:'AUTOMATION.RUN',payload:{x:1}}}

test('runtime resolves provider through governance before adapter execution', async()=>{
  const calls=[];
  const controlPlane={
    resolve(capability,constraints){
      calls.push({capability,constraints});
      return {providerId:'n8n'};
    },
  };
  const runtime=createProviderRuntime({
    controlPlane,
    adapters:{
      n8n:{
        providerId:'n8n',capability:'workflow.orchestrate',
        async execute(){return{providerId:'n8n',capability:'workflow.orchestrate',adapterId:'n8n.v1',effect:{resourceId:'run-1'},verification:{verified:true}}}
      },
    },
  });

  const result=await runtime.execute({
    capability:'workflow.orchestrate',
    dataClassification:'internal',
    riskClass:'medium',
    executionJob:job(),
  });
  assert.equal(result.providerId,'n8n');
  assert.equal(calls[0].constraints.dataClassification,'internal');
  assert.equal(calls[0].constraints.riskClass,'medium');
});

test('runtime fails closed when no governed provider is eligible', async()=>{
  let executed=false;
  const runtime=createProviderRuntime({
    controlPlane:{resolve(){return null}},
    adapters:{n8n:{providerId:'n8n',capability:'workflow.orchestrate',async execute(){executed=true}}},
  });
  await assert.rejects(()=>runtime.execute({
    capability:'workflow.orchestrate',dataClassification:'internal',riskClass:'low',executionJob:job(),
  }),/PROVIDER_RUNTIME_NOT_AVAILABLE/);
  assert.equal(executed,false);
});

test('runtime rejects adapter identity or capability mismatch', async()=>{
  for(const adapter of [
    {providerId:'other',capability:'workflow.orchestrate',async execute(){}},
    {providerId:'n8n',capability:'integration.saas',async execute(){}},
  ]){
    const runtime=createProviderRuntime({
      controlPlane:{resolve(){return{providerId:'n8n'}}},
      adapters:{n8n:adapter},
    });
    await assert.rejects(()=>runtime.execute({
      capability:'workflow.orchestrate',dataClassification:'internal',riskClass:'low',executionJob:job(),
    }),/PROVIDER_RUNTIME_ADAPTER_MISMATCH/);
  }
});

test('runtime requires independently verified adapter result before success', async()=>{
  const runtime=createProviderRuntime({
    controlPlane:{resolve(){return{providerId:'n8n'}}},
    adapters:{n8n:{providerId:'n8n',capability:'workflow.orchestrate',async execute(){return{providerId:'n8n',capability:'workflow.orchestrate',verification:{verified:false}}}}},
  });
  await assert.rejects(()=>runtime.execute({
    capability:'workflow.orchestrate',dataClassification:'internal',riskClass:'low',executionJob:job(),
  }),/PROVIDER_RUNTIME_VERIFICATION_FAILED/);
});

test('unknown provider outcome is automatically enqueued for reconciliation exactly once', async()=>{
  const queued=[];
  const runtime=createProviderRuntime({
    controlPlane:{resolve(){return{providerId:'zapier'}}},
    adapters:{zapier:{providerId:'zapier',capability:'integration.saas',async execute(){
      const e=new Error('secret provider message');
      e.code='ZAPIER_OUTCOME_UNKNOWN';e.retryable=false;e.outcomeUnknown=true;e.providerRunId='run-77';
      throw e;
    }}},
    reconciliation:{
      async enqueue(record){queued.push(record);return{outcome:'CREATED'}},
    },
    idFactory:()=> 'recon-77',
  });

  await assert.rejects(()=>runtime.execute({
    capability:'integration.saas',dataClassification:'internal',riskClass:'medium',executionJob:job(),
  }),/ZAPIER_OUTCOME_UNKNOWN/);

  assert.equal(queued.length,1);
  assert.equal(queued[0].reconciliationId,'recon-77');
  assert.equal(queued[0].providerId,'zapier');
  assert.equal(queued[0].providerRunId,'run-77');
  assert.equal(JSON.stringify(queued[0]).includes('secret provider message'),false);
});

test('runtime records provider selection audit without job payload or secrets', async()=>{
  const audit=[];
  const runtime=createProviderRuntime({
    controlPlane:{resolve(){return{providerId:'n8n'}}},
    adapters:{n8n:{providerId:'n8n',capability:'workflow.orchestrate',async execute(){return{providerId:'n8n',capability:'workflow.orchestrate',adapterId:'n8n.v1',effect:{},verification:{verified:true}}}}},
    recordAudit:async e=>audit.push(e),
    now:()=>new Date('2026-10-08T00:00:00.000Z'),
  });
  const secretJob={...job(),payload:{secret:'do-not-audit'}};
  await runtime.execute({capability:'workflow.orchestrate',dataClassification:'confidential',riskClass:'medium',executionJob:secretJob});
  assert.equal(audit[0].type,'PROVIDER.ROUTED');
  assert.equal(audit[0].providerId,'n8n');
  assert.equal(JSON.stringify(audit).includes('do-not-audit'),false);
});


test('runtime supports multiple capability-specific adapters for the same provider', async()=>{
  const runtime=createProviderRuntime({
    controlPlane:{
      resolve(capability){
        return capability.startsWith('document.')?{providerId:'paperwork'}:null;
      },
    },
    adapters:{
      'paperwork:document.extract':{
        providerId:'paperwork',capability:'document.extract',
        async execute(){return{providerId:'paperwork',capability:'document.extract',verification:{verified:true},effect:{resourceId:'extract-1'}}}
      },
      'paperwork:document.fill':{
        providerId:'paperwork',capability:'document.fill',
        async execute(){return{providerId:'paperwork',capability:'document.fill',verification:{verified:true},effect:{resourceId:'fill-1'}}}
      },
    },
  });

  const extract=await runtime.execute({
    capability:'document.extract',dataClassification:'internal',riskClass:'low',executionJob:job(),
  });
  const fill=await runtime.execute({
    capability:'document.fill',dataClassification:'internal',riskClass:'low',executionJob:job(),
  });
  assert.equal(extract.effect.resourceId,'extract-1');
  assert.equal(fill.effect.resourceId,'fill-1');
});
