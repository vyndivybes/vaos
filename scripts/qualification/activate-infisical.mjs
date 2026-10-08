import fs from 'node:fs';
import { createAutomationFabricSupabaseStores } from '../../platform/persistence/automation-fabric-supabase-stores.mjs';
import { createProviderControlPlane } from '../../platform/execution/provider-control-plane.mjs';
import { createProviderQualificationEngine } from '../../platform/execution/provider-qualification-engine.mjs';
import { createProviderHealthService } from '../../platform/execution/provider-health-service.mjs';
import { createGovernedHttpTransport } from '../../platform/execution/governed-http-transport.mjs';
import { createInfisicalApiTransport } from '../../integrations/infisical/api-transport.mjs';
import { activateInfisicalProvider } from '../../platform/qualification/infisical-activation.mjs';

const required=name=>{const value=process.env[name];if(!value)throw new Error('missing env: '+name);return value};
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function supabaseUrl(){if(process.env.SUPABASE_URL)return process.env.SUPABASE_URL;try{return JSON.parse(fs.readFileSync('wrangler.jsonc','utf8')).vars.SUPABASE_URL}catch{}throw new Error('missing env: SUPABASE_URL')}

if(process.env.INFISICAL_ACTIVATION_CONFIRM!=='ACTIVATE-INFISICAL')throw new Error('INFISICAL_ACTIVATION_CONFIRMATION_REQUIRED');
const authorityRef=required('INFISICAL_ACTIVATION_AUTHORITY_REF');
const reason=required('INFISICAL_ACTIVATION_REASON');
const clientId=required('INFISICAL_CLIENT_ID');
const clientSecret=required('INFISICAL_CLIENT_SECRET');
const projectId=required('INFISICAL_PROJECT_ID');
const environment=required('INFISICAL_ENVIRONMENT');
const secretPath=required('INFISICAL_ALLOWED_SECRET_PATH');
const secretKey=required('INFISICAL_ALLOWED_SECRET_KEY');
const baseUrl=process.env.INFISICAL_BASE_URL||'https://app.infisical.com';

const stores=createAutomationFabricSupabaseStores({url:supabaseUrl(),serverSecret:required('VAOS_DB_RPC_SECRET')});
const manifest=readJson('integrations/infisical/provider-manifest.json');
const wave=readJson('platform/qualification/provider-wave-2-profiles.json');
const controlPlane=createProviderControlPlane({providers:[manifest],stateStore:stores.providerState});
await controlPlane.restore();
const engine=createProviderQualificationEngine({controlPlane,profiles:wave.profiles,evidenceStore:stores.qualificationEvidence});
await engine.restoreEvidence();

const origin=new URL(baseUrl).origin;
const httpTransport=createGovernedHttpTransport({allowedOrigins:[origin]});
const transport=createInfisicalApiTransport({baseUrl,httpTransport});
const healthService=createProviderHealthService({
  controlPlane,
  probes:{infisical:async()=>{
    const login=await transport.universalLogin({clientId,clientSecret});
    await transport.readSecret({accessToken:login.accessToken,projectId,environment,secretPath,secretKey});
    return{status:'healthy',evidenceRef:'activation:infisical:live-health'};
  }},
});
const result=await activateInfisicalProvider({healthService,engine,controlPlane,authorityRef,reason});
console.log(JSON.stringify({providerId:result.providerId,capability:result.capability,activated:result.activated,enabled:result.snapshot.enabled,qualificationState:result.snapshot.qualification?.state,healthStatus:result.snapshot.health?.status||null},null,2));
