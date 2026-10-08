import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createPowerAutomateDesktopAdapter } from './desktop-adapter.mjs';

function manifest(overrides={}) {
  return {
    schemaVersion:'vaos.provider.v1',
    providerId:'power-automate-desktop',
    displayName:'Power Automate Desktop',
    capabilities:['desktop.automate'],
    deploymentModes:['desktop'],
    qualification:{state:'qualified',qualifiedCapabilities:['desktop.automate'],evidenceRefs:['q']},
    security:{secretBinding:'required',dataEgress:'controlled',authModes:['session'],callbackVerification:'none'},
    execution:{idempotency:'not-supported',retrySemantics:'conditional',verificationStrategy:'provider-readback',healthProbe:'required'},
    ...overrides,
  };
}
function broker(){return createCredentialBroker({async resolveCredential(){return{kind:'desktop-session',value:'opaque-desktop-session',providerId:'power-automate-desktop',capabilities:['desktop.automate']}}})}
function config(overrides={}) {
  return {
    secretBindingRef:'secret:pad:runner',
    flows:{
      'finance.excel-reconcile':{
        desktopFlowRef:'flow-finance-reconcile',
        machineGroupRef:'group-finance',
        mode:'unattended',
        effectClass:'write',
        allowedInputs:['workbookArtifactRef','period'],
        allowedOutputs:['reconciledArtifactRef','rowCount'],
      },
      'ops.status-read':{
        desktopFlowRef:'flow-ops-status',
        machineGroupRef:'group-ops',
        mode:'attended',
        effectClass:'read',
        allowedInputs:['assetId'],
        allowedOutputs:['status'],
      },
    },
    startTimeoutMs:30000,
    completionTimeoutMs:600000,
    ...overrides,
  };
}
function job(overrides={}){return{id:'job-pad-1',intentId:'intent-pad-1',actionType:'DESKTOP.RUN',payload:{flowKey:'finance.excel-reconcile',inputs:{workbookArtifactRef:'r2:sha256:abc',period:'2026-10'},desktopAuthorityRef:'approval:finance-1'},...overrides}}
function completed(overrides={}){return{runId:'pad-run-77',desktopFlowRef:'flow-finance-reconcile',machineGroupRef:'group-finance',mode:'unattended',status:'Succeeded',outputs:{reconciledArtifactRef:'r2:sha256:def',rowCount:42,secretDebug:'do-not-return'},...overrides}}

test('PAD adapter runs only approved flow/machine group and returns allow-listed outputs',async()=>{
  const calls=[];
  const a=createPowerAutomateDesktopAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),
    desktopExecutor:{
      async startFlow(req){calls.push({op:'start',req});return{runId:'pad-run-77',status:'Queued'}},
      async waitForRun(req){calls.push({op:'wait',req});return completed()},
    },config:config(),
  });
  const r=await a.execute(job());
  assert.equal(r.adapterId,'power-automate-desktop.v1');
  assert.equal(r.effect.resourceId,'pad-run-77');
  assert.equal(r.effect.state,'SUCCEEDED');
  assert.deepEqual(r.effect.output,{reconciledArtifactRef:'r2:sha256:def',rowCount:42});
  assert.equal(r.verification.machineGroupRef,'group-finance');
  assert.equal(r.verification.verified,true);

  const start=calls[0].req;
  assert.equal(start.desktopFlowRef,'flow-finance-reconcile');
  assert.equal(start.machineGroupRef,'group-finance');
  assert.equal(start.mode,'unattended');
  assert.equal(start.session.value,'opaque-desktop-session');
  assert.equal(JSON.stringify(r).includes('opaque-desktop-session'),false);
  assert.equal(JSON.stringify(r).includes('do-not-return'),false);
});

test('unknown flow or unapproved input fails before credential/runner access',async()=>{
  let touched=false;
  const b=createCredentialBroker({async resolveCredential(){touched=true}});
  for(const payload of [
    {flowKey:'unknown',inputs:{}},
    {flowKey:'ops.status-read',inputs:{assetId:'A1',command:'format c:'}},
  ]){
    const a=createPowerAutomateDesktopAdapter({
      capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:b,
      desktopExecutor:{async startFlow(){touched=true},async waitForRun(){touched=true}},config:config(),
    });
    await assert.rejects(()=>a.execute({id:'j',intentId:'i',actionType:'DESKTOP.RUN',payload}),/PAD_(FLOW_NOT_ALLOWED|INPUT_NOT_ALLOWED)/);
  }
  assert.equal(touched,false);
});

test('write flow requires explicit desktop authority before runner access',async()=>{
  let touched=false;
  const a=createPowerAutomateDesktopAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
    credentialBroker:createCredentialBroker({async resolveCredential(){touched=true}}),
    desktopExecutor:{async startFlow(){touched=true},async waitForRun(){touched=true}},config:config(),
  });
  await assert.rejects(()=>a.execute({...job(),payload:{...job().payload,desktopAuthorityRef:undefined}}),/PAD_AUTHORITY_REQUIRED/);
  assert.equal(touched,false);
});

test('pre-start runner failure is retryable; post-start ambiguity is never blindly restarted',async()=>{
  for(const [started,code,retryable,unknown] of [
    [false,'PAD_EXECUTOR_UNAVAILABLE',true,false],
    [true,'PAD_OUTCOME_UNKNOWN',false,true],
  ]){
    const a=createPowerAutomateDesktopAdapter({
      capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),
      desktopExecutor:{
        async startFlow(){const e=new Error('runner failure');e.started=started;throw e},
        async waitForRun(){throw new Error('unused')},
      },config:config(),
    });
    await assert.rejects(async()=>{try{await a.execute(job())}catch(e){assert.equal(e.code,code);assert.equal(e.retryable,retryable);assert.equal(e.outcomeUnknown,unknown);throw e}},new RegExp(code));
  }
});

test('status loss after run ID never starts a second desktop flow',async()=>{
  let starts=0;
  const a=createPowerAutomateDesktopAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),
    desktopExecutor:{
      async startFlow(){starts++;return{runId:'pad-run-77',status:'Queued'}},
      async waitForRun(){throw new Error('runner disconnected')},
    },config:config(),
  });
  await assert.rejects(async()=>{try{await a.execute(job())}catch(e){assert.equal(e.code,'PAD_RUN_STATUS_PENDING');assert.equal(e.providerRunId,'pad-run-77');assert.equal(e.outcomeUnknown,true);throw e}},/PAD_RUN_STATUS_PENDING/);
  assert.equal(starts,1);
});

test('queued/running remain reconcilable, failed/cancelled are terminal',async()=>{
  for(const [status,code,unknown] of [
    ['Queued','PAD_RUN_INCOMPLETE',true],
    ['Running','PAD_RUN_INCOMPLETE',true],
    ['Failed','PAD_RUN_FAILED',false],
    ['Cancelled','PAD_RUN_FAILED',false],
  ]){
    const a=createPowerAutomateDesktopAdapter({
      capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),
      desktopExecutor:{async startFlow(){return{runId:'pad-run-77'}},async waitForRun(){return completed({status})}},config:config(),
    });
    await assert.rejects(async()=>{try{await a.execute(job())}catch(e){assert.equal(e.code,code);assert.equal(e.outcomeUnknown,unknown);assert.equal(e.providerRunId,'pad-run-77');throw e}},new RegExp(code));
  }
});

test('run readback must match exact flow, machine group and mode',async()=>{
  for(const bad of [
    completed({desktopFlowRef:'other'}),
    completed({machineGroupRef:'other'}),
    completed({mode:'attended'}),
  ]){
    const a=createPowerAutomateDesktopAdapter({
      capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),
      desktopExecutor:{async startFlow(){return{runId:'pad-run-77'}},async waitForRun(){return bad}},config:config(),
    });
    await assert.rejects(()=>a.execute(job()),/PAD_VERIFICATION_FAILED/);
  }
});

test('adapter never exposes arbitrary command execution surface',()=>{
  const a=createPowerAutomateDesktopAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),
    desktopExecutor:{async startFlow(){},async waitForRun(){}},config:config(),
  });
  assert.deepEqual(Object.keys(a).sort(),['capability','execute','id','providerId']);
  assert.equal('exec' in a,false);
  assert.equal('runCommand' in a,false);
});
