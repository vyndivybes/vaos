import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PROVIDER_WAVE_4_PROFILES,getProviderWave4Profile} from './provider-wave-4-profiles.mjs';

test('wave 4 profiles reconcile exactly the five prepared provider adapters',()=>{
  assert.deepEqual(PROVIDER_WAVE_4_PROFILES.map(x=>x.providerId),
    ['windmill','documenso','airbyte','zapier','paperwork']);
  for(const profile of PROVIDER_WAVE_4_PROFILES){
    assert.match(profile.adapterVersion,/^\d+\.\d+\.\d+$/);
    assert.ok(profile.livePrerequisites.length>=3);
  }
  assert.equal(getProviderWave4Profile('unknown'),null);
});

test('wave 4 manifests remain disabled and evaluation-only until separate live evidence',()=>{
  for(const profile of PROVIDER_WAVE_4_PROFILES){
    const manifest=JSON.parse(readFileSync(
      new URL(`../../integrations/${profile.providerId}/provider-manifest.json`,import.meta.url),'utf8'));
    assert.equal(manifest.enabled,false);
    assert.equal(manifest.qualification.state,'evaluation');
    assert.deepEqual(manifest.qualification.qualifiedCapabilities,[]);
    assert.ok(manifest.capabilities.includes(profile.capability));
    assert.equal(manifest.adapterVersion,profile.adapterVersion);
  }
});

test('credential-dependent providers cannot be represented as live-qualified by readiness evidence',()=>{
  for(const profile of PROVIDER_WAVE_4_PROFILES){
    assert.ok(profile.livePrerequisites.some(x=>/credential|key|url|hook/.test(x)));
  }
});
