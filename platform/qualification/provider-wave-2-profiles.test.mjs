import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createProviderQualificationEngine } from '../execution/provider-qualification-engine.mjs';

const wave=JSON.parse(fs.readFileSync(new URL('./provider-wave-2-profiles.json',import.meta.url),'utf8'));

function controlPlane(){
  return {
    snapshot(){return{providerId:'infisical',enabled:false,capabilityEnabled:{},qualification:{state:'evaluation',qualifiedCapabilities:[]},health:null}},
    async transitionQualification(){},
    async setProviderEnabled(){},
    async setCapabilityEnabled(){},
  };
}

test('wave 2 is dedicated to Infisical secret broker qualification',()=>{
  assert.equal(wave.schemaVersion,'vaos.provider-qualification-wave.v1');
  assert.equal(wave.waveId,'provider-wave-2');
  assert.deepEqual(wave.profiles.map(p=>[p.providerId,p.capability]),[['infisical','secret.broker']]);
  assert.doesNotThrow(()=>createProviderQualificationEngine({controlPlane:controlPlane(),profiles:wave.profiles}));
});

test('Infisical profile preserves all four qualification stages',()=>{
  const profile=wave.profiles[0];
  assert.deepEqual(profile.stages.map(s=>s.stage),['contract','ephemeral-live','staging','production']);
});

test('ephemeral-live requires auth, allowed read, denied-scope enforcement and bounded token TTL',()=>{
  const ids=wave.profiles[0].stages.find(s=>s.stage==='ephemeral-live').checks.map(c=>c.id);
  assert.deepEqual(ids,[
    'universal-auth-login',
    'allowed-secret-read',
    'denied-scope-read',
    'token-ttl-bounded',
  ]);
  assert.equal(wave.profiles[0].stages.find(s=>s.stage==='ephemeral-live').checks.every(c=>c.requiredEvidenceClass==='live'),true);
});

test('production qualification requires rotation, rollback and owner approval',()=>{
  const checks=Object.fromEntries(wave.profiles[0].stages.find(s=>s.stage==='production').checks.map(c=>[c.id,c.requiredEvidenceClass]));
  assert.equal(checks['bootstrap-credential-rotation'],'live');
  assert.equal(checks['rollback-drill'],'live');
  assert.equal(checks['owner-approval'],'manual');
});
