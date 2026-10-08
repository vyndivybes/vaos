import fs from 'node:fs';
import { createGovernedHttpTransport } from '../../platform/execution/governed-http-transport.mjs';
import { createInfisicalApiTransport } from '../../integrations/infisical/api-transport.mjs';
import { runInfisicalEphemeralQualification } from '../../integrations/infisical/qualification-runner.mjs';
import { runInfisicalStagingQualification } from '../../integrations/infisical/staging-qualification-runner.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createInfisicalSecretResolver } from '../../integrations/infisical/secret-resolver.mjs';
import { createProviderControlPlane } from '../../platform/execution/provider-control-plane.mjs';
import { createProviderHealthService } from '../../platform/execution/provider-health-service.mjs';
import { validateProviderLiveEvidence } from '../../platform/qualification/provider-live-evidence.mjs';

const required=name=>{
  const value=process.env[name];
  if(!value)throw new Error('missing env: '+name);
  return value;
};
const baseUrl=process.env.INFISICAL_BASE_URL||'https://us.infisical.com';
const clientId=required('INFISICAL_CLIENT_ID');
const clientSecret=required('INFISICAL_CLIENT_SECRET');
const projectId=required('INFISICAL_PROJECT_ID');
const environment=required('INFISICAL_ENVIRONMENT');
const allowedSecretPath=required('INFISICAL_ALLOWED_SECRET_PATH');
const allowedSecretKey=required('INFISICAL_ALLOWED_SECRET_KEY');
const deniedSecretPath=required('INFISICAL_DENIED_SECRET_PATH');
const deniedSecretKey=required('INFISICAL_DENIED_SECRET_KEY');
const deniedProjectId=process.env.INFISICAL_DENIED_PROJECT_ID||projectId;
const runId=required('GITHUB_RUN_ID');
const sha=required('GITHUB_SHA');
const repository=required('GITHUB_REPOSITORY');

const origin=new URL(baseUrl).origin;
const httpTransport=createGovernedHttpTransport({allowedOrigins:[origin]});
const transport=createInfisicalApiTransport({baseUrl,httpTransport});
const ephemeral=await runInfisicalEphemeralQualification({
  transport,
  clientId,
  clientSecret,
  allowedProbe:{projectId,environment,secretPath:allowedSecretPath,secretKey:allowedSecretKey},
  deniedProbe:{projectId:deniedProjectId,environment,secretPath:deniedSecretPath,secretKey:deniedSecretKey},
  minTokenTtlSeconds:Number(process.env.INFISICAL_MIN_TOKEN_TTL_SECONDS||60),
  maxTokenTtlSeconds:Number(process.env.INFISICAL_MAX_TOKEN_TTL_SECONDS||7200),
});

const manifest=JSON.parse(fs.readFileSync(new URL('../../integrations/infisical/provider-manifest.json',import.meta.url),'utf8'));
const qualificationManifest={
  ...manifest,
  enabled:true,
  qualification:{
    state:'qualified',
    qualifiedCapabilities:['secret.broker'],
    evidenceRefs:['qualification:provider-wave-2:staging'],
    validUntil:new Date(Date.now()+60*60*1000).toISOString(),
  },
};
const controlPlane=createProviderControlPlane({providers:[qualificationManifest]});
const audit=[];
const resolver=createInfisicalSecretResolver({
  bootstrapIdentity:async()=>({clientId,clientSecret}),
  transport,
  config:{
    bindings:{
      'secret:infisical:qualification-canary':{
        projectId,
        environment,
        secretPath:allowedSecretPath,
        secretKey:allowedSecretKey,
        providerId:'infisical',
        capabilities:['secret.broker'],
        kind:'token',
      },
    },
    leaseTtlSeconds:Math.min(ephemeral.tokenTtlSeconds,900),
  },
  recordAudit:async event=>audit.push(event),
});
const credentialBroker=createCredentialBroker({
  resolveCredential:resolver,
  recordAudit:async event=>audit.push(event),
});
const healthService=createProviderHealthService({
  controlPlane,
  probes:{
    infisical:async()=>{
      const login=await transport.universalLogin({clientId,clientSecret});
      await transport.readSecret({
        accessToken:login.accessToken,
        projectId,
        environment,
        secretPath:allowedSecretPath,
        secretKey:allowedSecretKey,
      });
      return {status:'healthy',evidenceRef:'github-actions:'+runId+':infisical:staging-health'};
    },
  },
});
const staging=await runInfisicalStagingQualification({
  credentialBroker,
  controlPlane,
  healthService,
  bindingRef:'secret:infisical:qualification-canary',
  executionJobId:'qualification-'+runId,
  intentId:'provider-wave-2-infisical',
  tokenTtlSeconds:ephemeral.tokenTtlSeconds,
  recordAudit:async event=>audit.push(event),
});
if(JSON.stringify(audit).includes(clientSecret))throw new Error('INFISICAL_QUALIFICATION_SECRET_LEAK');

const runUrl='https://github.com/'+repository+'/actions/runs/'+runId;
const evidence={
  schemaVersion:'vaos.provider-live-evidence.v1',
  waveId:'provider-wave-2',
  providerId:'infisical',
  capability:'secret.broker',
  evidenceClass:'live',
  runtimeVersion:ephemeral.runtimeVersion,
  source:{type:'github-actions',runId,runUrl,commitSha:sha},
  createdAt:new Date().toISOString(),
  checks:[...ephemeral.checks,...staging.checks].map(check=>({
    checkId:check.checkId,
    outcome:check.outcome,
    evidenceRef:'github-actions:'+runId+':infisical:'+check.checkId,
  })),
  productionActivation:false,
};
const outDir='qualification-evidence/provider-wave-2';
fs.mkdirSync(outDir,{recursive:true});
const validated=validateProviderLiveEvidence(evidence);
fs.writeFileSync(outDir+'/infisical.json',JSON.stringify(validated,null,2)+'\n');
console.log('Infisical Wave 2 live qualification passed; governed evidence bundle written.');
