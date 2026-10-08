import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createProviderQualificationEngine } from '../execution/provider-qualification-engine.mjs';

const wave=JSON.parse(fs.readFileSync(new URL('./provider-wave-2-profiles.json',import.meta.url),'utf8'));

function controlPlane(){
  return {
    snapshot(){return{providerId:'x',enabled:false,capabilityEnabled:{},qualification:{state:'evaluation',qualifiedCapabilities:[]},health:null}},
    async transitionQualification(){},
    async setProviderEnabled(){},
    async setCapabilityEnabled(){},
  };
}

test('wave 2 profiles are accepted by the qualification engine and preserve intended providers',()=>{
  assert.equal(wave.schemaVersion,'vaos.provider-qualification-wave.v1');
  assert.equal(wave.waveId,'provider-wave-2');
  assert.deepEqual(
    wave.profiles.map(p=>p.providerId).sort(),
    ['activepieces','airbyte','n8n','paperless-ngx','paperwork','stirling-pdf','windmill'],
  );
  assert.doesNotThrow(()=>createProviderQualificationEngine({controlPlane:controlPlane(),profiles:wave.profiles}));
});

test('every wave 2 profile contains contract, ephemeral-live, staging and production evidence stages',()=>{
  const expected=['contract','ephemeral-live','staging','production'];
  for(const profile of wave.profiles){
    assert.deepEqual(profile.stages.map(s=>s.stage),expected,profile.providerId);
    for(const stage of profile.stages){
      assert.equal(stage.checks.length>0,true,`${profile.providerId}:${stage.stage}`);
    }
  }
});

test('all ephemeral-live wave 2 checks require live evidence',()=>{
  for(const profile of wave.profiles){
    const stage=profile.stages.find(s=>s.stage==='ephemeral-live');
    assert.equal(stage.checks.every(c=>c.requiredEvidenceClass==='live'),true,profile.providerId);
  }
});

test('all wave 2 production profiles require manual owner approval and live rollback evidence',()=>{
  for(const profile of wave.profiles){
    const stage=profile.stages.find(s=>s.stage==='production');
    const owner=stage.checks.find(c=>c.id==='owner-approval');
    assert.equal(owner?.requiredEvidenceClass,'manual',profile.providerId);
    assert.equal(stage.checks.some(c=>/rollback|cancel|restore/.test(c.id)&&c.requiredEvidenceClass==='live'),true,profile.providerId);
  }
});

test('wave 2 profiles do not contain activation as a qualification check',()=>{
  for(const profile of wave.profiles){
    for(const stage of profile.stages){
      assert.equal(stage.checks.some(c=>/activate|enable-production/.test(c.id)),false,`${profile.providerId}:${stage.stage}`);
    }
  }
});
