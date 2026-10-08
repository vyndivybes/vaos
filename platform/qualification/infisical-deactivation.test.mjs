import test from 'node:test';
import assert from 'node:assert/strict';
import { disableInfisicalProvider } from './infisical-deactivation.mjs';

test('emergency disable turns off capability first and provider second, then verifies persisted state',async()=>{
  const calls=[];
  const state={enabled:true,capabilityEnabled:{'secret.broker':true}};
  const controlPlane={
    async setCapabilityEnabled({capability,enabled}){calls.push(['capability',capability,enabled]);state.capabilityEnabled[capability]=enabled},
    async setProviderEnabled({enabled}){calls.push(['provider',enabled]);state.enabled=enabled},
    snapshot(){return{providerId:'infisical',enabled:state.enabled,capabilityEnabled:{...state.capabilityEnabled}}},
  };
  const result=await disableInfisicalProvider({controlPlane,authorityRef:'approval:incident-1',reason:'incident containment'});
  assert.equal(result.disabled,true);
  assert.deepEqual(calls,[['capability','secret.broker',false],['provider',false]]);
  assert.equal(result.snapshot.enabled,false);
  assert.equal(result.snapshot.capabilityEnabled['secret.broker'],false);
});

test('disable fails if persisted state remains enabled',async()=>{
  await assert.rejects(()=>disableInfisicalProvider({
    controlPlane:{
      async setCapabilityEnabled(){},
      async setProviderEnabled(){},
      snapshot(){return{providerId:'infisical',enabled:true,capabilityEnabled:{'secret.broker':false}}},
    },
    authorityRef:'approval:1',reason:'x',
  }),/INFISICAL_DISABLE_STATE_MISMATCH/);
});
