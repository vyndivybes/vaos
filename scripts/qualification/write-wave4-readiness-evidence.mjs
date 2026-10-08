import fs from 'node:fs';
import path from 'node:path';
import {PROVIDER_WAVE_4_PROFILES} from '../../platform/qualification/provider-wave-4-profiles.mjs';

const required=name=>{const value=process.env[name];if(!value)throw Error('missing env: '+name);return value};
const repository=required('GITHUB_REPOSITORY');
const sha=required('GITHUB_SHA');
const runId=required('GITHUB_RUN_ID');
if(repository!=='vyndivybes/vaos'||!/^[0-9a-f]{40}$/.test(sha)||!/^[0-9]+$/.test(runId))
  throw Error('WAVE4_GITHUB_CONTEXT_INVALID');
const runUrl=`https://github.com/${repository}/actions/runs/${runId}`;
const evidence={
  schemaVersion:'vaos.provider-readiness-evidence.v1',
  wave:4,
  stage:'contract-readiness',
  source:{repository,commitSha:sha,runId,runUrl},
  providers:PROVIDER_WAVE_4_PROFILES.map(profile=>({
    providerId:profile.providerId,
    capability:profile.capability,
    adapterVersion:profile.adapterVersion,
    implementation:profile.implementation,
    adapterContract:'pass',
    livePrerequisites:[...profile.livePrerequisites],
    ephemeralLive:'pending-external-prerequisites',
    productionActivation:false,
  })),
  syntheticDataOnly:true,
  productionCredentials:false,
  productionActivation:false,
  generatedAt:new Date().toISOString(),
};
const dir=path.join('qualification-evidence','provider-wave-4');
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'readiness.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({wave:4,stage:evidence.stage,providers:evidence.providers.length,runUrl}));
