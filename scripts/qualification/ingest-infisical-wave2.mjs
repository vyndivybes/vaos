import fs from 'node:fs';
import { createAutomationFabricSupabaseStores } from '../../platform/persistence/automation-fabric-supabase-stores.mjs';
import { createProviderControlPlane } from '../../platform/execution/provider-control-plane.mjs';
import { createProviderQualificationEngine } from '../../platform/execution/provider-qualification-engine.mjs';
import { ingestInfisicalWave2Evidence, qualifyInfisicalIfReady } from '../../platform/qualification/infisical-wave2-ingestion.mjs';

const required=name=>{const value=process.env[name];if(!value)throw new Error('missing env: '+name);return value};
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function supabaseUrl(){
  if(process.env.SUPABASE_URL)return process.env.SUPABASE_URL;
  try{return JSON.parse(fs.readFileSync('wrangler.jsonc','utf8')).vars.SUPABASE_URL}catch{}
  throw new Error('missing env: SUPABASE_URL');
}

const liveFile=process.env.INFISICAL_LIVE_EVIDENCE_FILE||'qualification-evidence/provider-wave-2/infisical.json';
const productionFile=process.env.INFISICAL_PRODUCTION_EVIDENCE_FILE||'';
const ownerApprovalRef=process.env.INFISICAL_OWNER_APPROVAL_REF||null;
const shouldQualify=String(process.env.VAOS_QUALIFY_INFISICAL||'false').toLowerCase()==='true';
const serverSecret=required('VAOS_DB_RPC_SECRET');

const stores=createAutomationFabricSupabaseStores({url:supabaseUrl(),serverSecret});
const manifest=readJson('integrations/infisical/provider-manifest.json');
const wave=readJson('platform/qualification/provider-wave-2-profiles.json');
const controlPlane=createProviderControlPlane({providers:[manifest],stateStore:stores.providerState});
await controlPlane.restore();
const engine=createProviderQualificationEngine({
  controlPlane,profiles:wave.profiles,evidenceStore:stores.qualificationEvidence,
});
await engine.restoreEvidence();

const liveBundle=readJson(liveFile);
const productionBundle=productionFile&&fs.existsSync(productionFile)?readJson(productionFile):null;
const ingested=await ingestInfisicalWave2Evidence({engine,liveBundle,productionBundle,ownerApprovalRef});
let qualified=false;
if(shouldQualify){
  if(!ownerApprovalRef)throw new Error('INFISICAL_OWNER_APPROVAL_REQUIRED');
  await qualifyInfisicalIfReady({
    engine,authorityRef:ownerApprovalRef,reason:'Infisical Wave 2 qualification evidence complete',
  });
  qualified=true;
}
const assessment=engine.assess('infisical','secret.broker');
console.log(JSON.stringify({providerId:'infisical',capability:'secret.broker',qualified,readyForQualification:assessment.readyForQualification,stages:assessment.stages},null,2));
