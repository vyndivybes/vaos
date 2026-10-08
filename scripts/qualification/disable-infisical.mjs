import fs from 'node:fs';
import { createAutomationFabricSupabaseStores } from '../../platform/persistence/automation-fabric-supabase-stores.mjs';
import { createProviderControlPlane } from '../../platform/execution/provider-control-plane.mjs';
import { disableInfisicalProvider } from '../../platform/qualification/infisical-deactivation.mjs';

const required=name=>{const value=process.env[name];if(!value)throw new Error('missing env: '+name);return value};
function supabaseUrl(){if(process.env.SUPABASE_URL)return process.env.SUPABASE_URL;try{return JSON.parse(fs.readFileSync('wrangler.jsonc','utf8')).vars.SUPABASE_URL}catch{}throw new Error('missing env: SUPABASE_URL')}
if(process.env.INFISICAL_DISABLE_CONFIRM!=='DISABLE-INFISICAL')throw new Error('INFISICAL_DISABLE_CONFIRMATION_REQUIRED');
const stores=createAutomationFabricSupabaseStores({url:supabaseUrl(),serverSecret:required('VAOS_DB_RPC_SECRET')});
const manifest=JSON.parse(fs.readFileSync('integrations/infisical/provider-manifest.json','utf8'));
const controlPlane=createProviderControlPlane({providers:[manifest],stateStore:stores.providerState});
await controlPlane.restore();
const result=await disableInfisicalProvider({
  controlPlane,
  authorityRef:required('INFISICAL_DISABLE_AUTHORITY_REF'),
  reason:required('INFISICAL_DISABLE_REASON'),
});
console.log(JSON.stringify({providerId:result.providerId,capability:result.capability,disabled:result.disabled,enabled:result.snapshot.enabled},null,2));
