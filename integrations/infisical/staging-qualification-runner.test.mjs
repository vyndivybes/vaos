import test from 'node:test';
import assert from 'node:assert/strict';
import { runInfisicalStagingQualification } from './staging-qualification-runner.mjs';

test('staging qualification proves broker integration, nondisclosure, health/expiry and kill-switch',async()=>{
  const audit=[];
  const credentialBroker={
    async withCredential(request,operation){
      assert.equal(request.bindingRef,'secret:infisical:qualification-canary');
      return operation({kind:'token',value:'canary-secret'});
    },
  };
  let enabled=true;
  const controlPlane={
    async setProviderEnabled({enabled:value}){enabled=value},
    resolve(){return enabled?{providerId:'infisical'}:null},
  };
  const healthService={async check(){return{providerId:'infisical',status:'healthy',checkedAt:'2026-10-08T00:00:00.000Z',evidenceRef:'health:live'}}};

  const result=await runInfisicalStagingQualification({
    credentialBroker,controlPlane,healthService,
    bindingRef:'secret:infisical:qualification-canary',
    executionJobId:'job-stage-1',intentId:'intent-stage-1',
    recordAudit:async event=>audit.push(event),
    tokenTtlSeconds:900,
  });

  assert.deepEqual(result.checks.map(x=>x.checkId),[
    'credential-broker-integration',
    'secret-value-nondisclosure',
    'health-and-expiry',
    'kill-switch',
  ]);
  assert.equal(result.checks.every(x=>x.outcome==='pass'),true);
  assert.equal(JSON.stringify(result).includes('canary-secret'),false);
  assert.equal(JSON.stringify(audit).includes('canary-secret'),false);
  assert.equal(enabled,true);
});

test('broker failure fails staging qualification closed',async()=>{
  await assert.rejects(()=>runInfisicalStagingQualification({
    credentialBroker:{async withCredential(){throw new Error('secret leaked')}},
    controlPlane:{async setProviderEnabled(){},resolve(){return null}},
    healthService:{async check(){return{status:'healthy'}}},
    bindingRef:'b',executionJobId:'j',intentId:'i',tokenTtlSeconds:900,
  }),/INFISICAL_STAGING_BROKER_FAILED/);
});

test('unhealthy live provider blocks staging qualification',async()=>{
  await assert.rejects(()=>runInfisicalStagingQualification({
    credentialBroker:{async withCredential(_r,op){return op({kind:'token',value:'x'})}},
    controlPlane:{async setProviderEnabled(){},resolve(){return{providerId:'infisical'}}},
    healthService:{async check(){return{providerId:'infisical',status:'unhealthy'}}},
    bindingRef:'b',executionJobId:'j',intentId:'i',tokenTtlSeconds:900,
  }),/INFISICAL_STAGING_HEALTH_FAILED/);
});

test('kill switch must actually block routing',async()=>{
  await assert.rejects(()=>runInfisicalStagingQualification({
    credentialBroker:{async withCredential(_r,op){return op({kind:'token',value:'x'})}},
    controlPlane:{async setProviderEnabled(){},resolve(){return{providerId:'infisical'}}},
    healthService:{async check(){return{providerId:'infisical',status:'healthy'}}},
    bindingRef:'b',executionJobId:'j',intentId:'i',tokenTtlSeconds:900,
  }),/INFISICAL_STAGING_KILL_SWITCH_FAILED/);
});
