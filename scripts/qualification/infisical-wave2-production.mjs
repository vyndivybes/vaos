import fs from 'node:fs';
import { createGovernedHttpTransport } from '../../platform/execution/governed-http-transport.mjs';
import { createInfisicalApiTransport } from '../../integrations/infisical/api-transport.mjs';
import { runInfisicalProductionQualification } from '../../integrations/infisical/production-qualification-runner.mjs';
import { createProviderControlPlane } from '../../platform/execution/provider-control-plane.mjs';
import { validateProviderLiveEvidence } from '../../platform/qualification/provider-live-evidence.mjs';

const required=name=>{const value=process.env[name];if(!value)throw new Error('missing env: '+name);return value};
const baseUrl=process.env.INFISICAL_BASE_URL||'https://us.infisical.com';
const clientId=required('INFISICAL_CLIENT_ID');
const currentClientSecret=required('INFISICAL_CLIENT_SECRET');
const revokedClientSecret=required('INFISICAL_REVOKED_CLIENT_SECRET');
const projectId=required('INFISICAL_PROJECT_ID');
const environment=required('INFISICAL_ENVIRONMENT');
const allowedSecretPath=required('INFISICAL_ALLOWED_SECRET_PATH');
const allowedSecretKey=required('INFISICAL_ALLOWED_SECRET_KEY');
const runId=required('GITHUB_RUN_ID');
const sha=required('GITHUB_SHA');
const repository=required('GITHUB_REPOSITORY');

const origin=new URL(baseUrl).origin;
const httpTransport=createGovernedHttpTransport({allowedOrigins:[origin]});
const transport=createInfisicalApiTransport({baseUrl,httpTransport});
const manifest=JSON.parse(fs.readFileSync(new URL('../../integrations/infisical/provider-manifest.json',import.meta.url),'utf8'));
const qualificationManifest={
  ...manifest,enabled:true,
  qualification:{state:'qualified',qualifiedCapabilities:['secret.broker'],evidenceRefs:['qualification:provider-wave-2:production'],validUntil:new Date(Date.now()+60*60*1000).toISOString()},
};
const controlPlane=createProviderControlPlane({providers:[qualificationManifest]});
const result=await runInfisicalProductionQualification({
  transport,clientId,currentClientSecret,revokedClientSecret,
  allowedProbe:{projectId,environment,secretPath:allowedSecretPath,secretKey:allowedSecretKey},
  controlPlane,
});
const runUrl='https://github.com/'+repository+'/actions/runs/'+runId;
const evidence={
  schemaVersion:'vaos.provider-live-evidence.v1',waveId:'provider-wave-2',providerId:'infisical',capability:'secret.broker',evidenceClass:'live',
  runtimeVersion:'universal-auth-v1+secrets-v4',
  source:{type:'github-actions',runId,runUrl,commitSha:sha},createdAt:new Date().toISOString(),
  checks:result.checks.map(check=>({checkId:check.checkId,outcome:check.outcome,evidenceRef:'github-actions:'+runId+':infisical:'+check.checkId})),
  productionActivation:false,
};
const validated=validateProviderLiveEvidence(evidence);
const outDir='qualification-evidence/provider-wave-2';fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(outDir+'/infisical-production.json',JSON.stringify(validated,null,2)+'\n');
console.log('Infisical Wave 2 production qualification checks passed; governed evidence bundle written.');
