import fs from 'node:fs';
import { createAutomationFabricSupabaseStores } from '../../platform/persistence/automation-fabric-supabase-stores.mjs';
import { assessInfisicalCommissioning } from '../../platform/qualification/infisical-commissioning-readiness.mjs';

const config=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
const url=process.env.SUPABASE_URL || config.vars?.SUPABASE_URL;
const readCredential=process.env.VAOS_DB_RPC_SECRET;
if(!readCredential)throw new Error('INFISICAL_READINESS_READ_CREDENTIAL_MISSING');

// Only two read RPCs; this code cannot modify provider state or route requests.
const stores=createAutomationFabricSupabaseStores({url,serverSecret:readCredential});
const profiles=JSON.parse(fs.readFileSync('platform/qualification/provider-wave-2-profiles.json','utf8')).profiles;
const profile=profiles.find(x=>x.providerId==='infisical'&&x.capability==='secret.broker');
if(!profile)throw new Error('INFISICAL_READINESS_PROFILE_NOT_FOUND');
const [snapshot,evidence]=await Promise.all([
  stores.providerState.load('infisical'),
  stores.qualificationEvidence.list('infisical','secret.broker')
]);
const assessment=assessInfisicalCommissioning({snapshot,evidence,profile});
const report={schemaVersion:'vaos.infisical-commissioning-readiness.v1',
  recordedAt:new Date().toISOString(),assessment};
fs.mkdirSync('qualification-evidence/provider-wave-2',{recursive:true});
fs.writeFileSync('qualification-evidence/provider-wave-2/infisical-commissioning-readiness.json',
  JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(assessment,null,2));
// SAFE_HOLD is the expected outcome until activation is approved separately.
if(assessment.status!=='SAFE_HOLD')process.exitCode=1;
