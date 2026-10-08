import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createProviderQualificationEngine } from '../execution/provider-qualification-engine.mjs';

const wave=JSON.parse(fs.readFileSync(new URL('./provider-wave-1-profiles.json',import.meta.url),'utf8'));

function controlPlane(){
  return {
    snapshot(){return{providerId:'x',enabled:false,capabilityEnabled:{},qualification:{state:'evaluation',qualifiedCapabilities:[]},health:null}},
    async transitionQualification(){},
    async setProviderEnabled(){},
    async setCapabilityEnabled(){},
  };
}

test('wave 1 profiles are accepted by the qualification engine and preserve the intended providers',()=>{
  assert.equal(wave.schemaVersion,'vaos.provider-qualification-wave.v1');
  assert.equal(wave.waveId,'provider-wave-1');
  assert.deepEqual(
    wave.profiles.map(p=>p.providerId).sort(),
    ['node-red','opentelemetry','playwright'],
  );
  assert.doesNotThrow(()=>createProviderQualificationEngine({controlPlane:controlPlane(),profiles:wave.profiles}));
});

test('every wave 1 profile contains all four staged evidence levels',()=>{
  const expected=['contract','ephemeral-live','staging','production'];
  for(const profile of wave.profiles){
    assert.deepEqual(profile.stages.map(s=>s.stage),expected,profile.providerId);
    for(const stage of profile.stages){
      assert.equal(stage.checks.length>0,true,`${profile.providerId}:${stage.stage}`);
    }
  }
});

test('wave 1 live checks cannot be downgraded to automated evidence',()=>{
  for(const profile of wave.profiles){
    const live=profile.stages.find(s=>s.stage==='ephemeral-live');
    assert.equal(live.checks.every(c=>c.requiredEvidenceClass==='live'),true,profile.providerId);
  }
});
