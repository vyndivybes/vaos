import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PROVIDER_WAVE_3_PROFILES,getProviderWave3Profile} from './provider-wave-3-profiles.mjs';

test('wave 3 profiles pin four evaluation runtimes and require kill switches',()=>{
  assert.deepEqual(PROVIDER_WAVE_3_PROFILES.map(x=>x.providerId),
    ['n8n','activepieces','paperless-ngx','stirling-pdf']);
  for(const profile of PROVIDER_WAVE_3_PROFILES){
    assert.match(profile.runtimeVersion,/^\d+\.\d+\.\d+$/);
    assert.ok(profile.requiredChecks.includes('runtime-ready'));
    assert.ok(profile.requiredChecks.includes('kill-switch'));
  }
});

test('wave 3 manifests remain disabled and evaluation-only',()=>{
  for(const profile of PROVIDER_WAVE_3_PROFILES){
    const manifest=JSON.parse(readFileSync(
      new URL(`../../integrations/${profile.providerId}/provider-manifest.json`,import.meta.url),'utf8'));
    assert.equal(manifest.enabled,false);
    assert.equal(manifest.qualification.state,'evaluation');
    assert.deepEqual(manifest.qualification.qualifiedCapabilities,[]);
  }
  assert.equal(getProviderWave3Profile('unknown'),null);
});
