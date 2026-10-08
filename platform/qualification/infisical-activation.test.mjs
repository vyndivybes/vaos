import test from 'node:test';
import assert from 'node:assert/strict';
import { activateInfisicalProvider } from './infisical-activation.mjs';

test('activation requires a fresh healthy live probe before the qualification engine can enable Infisical',async()=>{
  const calls=[];
  const controlPlane={
    snapshot(){return{providerId:'infisical',enabled:true,capabilityEnabled:{'secret.broker':true},qualification:{state:'qualified',qualifiedCapabilities:['secret.broker']},health:{status:'healthy'}}},
  };
  const result=await activateInfisicalProvider({
    healthService:{async check(providerId){calls.push(['health',providerId]);return{providerId,status:'healthy',checkedAt:'2026-10-08T00:00:00.000Z'}}},
    engine:{async activate(input){calls.push(['activate',input]);return{activated:true}}},
    controlPlane,
    authorityRef:'approval:owner-1',
    reason:'Wave 2 approved',
  });
  assert.equal(result.activated,true);
  assert.deepEqual(calls.map(x=>x[0]),['health','activate']);
  assert.equal(result.snapshot.enabled,true);
  assert.equal(result.snapshot.capabilityEnabled['secret.broker'],true);
});

test('unhealthy provider blocks activation before engine action',async()=>{
  let activated=false;
  await assert.rejects(()=>activateInfisicalProvider({
    healthService:{async check(){return{providerId:'infisical',status:'unhealthy'}}},
    engine:{async activate(){activated=true}},
    controlPlane:{snapshot(){return{}}},
    authorityRef:'approval:1',reason:'x',
  }),/INFISICAL_ACTIVATION_HEALTH_FAILED/);
  assert.equal(activated,false);
});

test('activation verifies persisted provider and capability enablement',async()=>{
  await assert.rejects(()=>activateInfisicalProvider({
    healthService:{async check(){return{providerId:'infisical',status:'healthy'}}},
    engine:{async activate(){return{activated:true}}},
    controlPlane:{snapshot(){return{providerId:'infisical',enabled:true,capabilityEnabled:{'secret.broker':false}}}},
    authorityRef:'approval:1',reason:'x',
  }),/INFISICAL_ACTIVATION_STATE_MISMATCH/);
});
