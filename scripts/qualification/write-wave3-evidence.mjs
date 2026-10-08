import fs from 'node:fs';
import path from 'node:path';
import {getProviderWave3Profile} from '../../platform/qualification/provider-wave-3-profiles.mjs';

const required=name=>{const value=process.env[name];if(!value)throw Error('missing env: '+name);return value};
const providerId=required('WAVE3_PROVIDER_ID');
const profile=getProviderWave3Profile(providerId);
if(!profile)throw Error('WAVE3_PROVIDER_UNKNOWN');
const observedVersion=required('WAVE3_RUNTIME_VERSION');
if(observedVersion!==profile.runtimeVersion)throw Error('WAVE3_RUNTIME_VERSION_MISMATCH');
const passed=new Set(required('WAVE3_PASSED_CHECKS').split(',').map(x=>x.trim()).filter(Boolean));
if(profile.requiredChecks.some(check=>!passed.has(check)))throw Error('WAVE3_REQUIRED_CHECK_MISSING');
const runId=required('GITHUB_RUN_ID');
const repository=required('GITHUB_REPOSITORY');
const sha=required('GITHUB_SHA');
if(repository!=='vyndivybes/vaos'||!/^[0-9]+$/.test(runId)||!/^[0-9a-f]{40}$/.test(sha))
  throw Error('WAVE3_GITHUB_CONTEXT_INVALID');
const runUrl=`https://github.com/${repository}/actions/runs/${runId}`;
const evidence=Object.freeze({
  schemaVersion:'vaos.provider-live-evidence.v1',
  wave:3,
  stage:'ephemeral-live',
  providerId,
  capability:profile.capability,
  runtimeVersion:observedVersion,
  source:Object.freeze({repository,commitSha:sha,runId,runUrl}),
  checks:profile.requiredChecks.map(checkId=>Object.freeze({checkId,outcome:'pass'})),
  syntheticDataOnly:true,
  productionCredentials:false,
  productionActivation:false,
  generatedAt:new Date().toISOString(),
});
const dir=path.join('qualification-evidence','provider-wave-3');
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,`${providerId}.json`),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({providerId,stage:evidence.stage,productionActivation:false,runUrl}));
