// Opt-in bridge between the VAOS governed ProviderRuntime and read-only insight adapters.
// No factory is registered or enabled automatically. The control plane must select a
// qualified, healthy, explicitly enabled provider before factory creation.
import { createInsightReadAdapter } from './read-only-adapters.mjs';
import { createGovernedHttpTransport } from '../../platform/execution/governed-http-transport.mjs';

const CAPABILITIES=Object.freeze({
 metabase:'analytics.bi',
 qdrant:'search.semantic',
 meilisearch:'search.fulltext',
 typesense:'search.fulltext',
});
function fail(code){
 const error=new Error('INSIGHT_FACTORY_'+code);
 error.code='INSIGHT_FACTORY_'+code;
 error.retryable=false;
 throw error;
}
export function createInsightProviderFactories({
 configurations={},credentialBroker,transportFactory=null,fetchImpl=globalThis.fetch
}={}){
 if(!configurations||typeof configurations!=='object'||Array.isArray(configurations))fail('CONFIG_INVALID');
 if(typeof credentialBroker?.withCredential!=='function')fail('CREDENTIAL_BROKER_REQUIRED');
 if(transportFactory!==null&&typeof transportFactory!=='function')fail('TRANSPORT_FACTORY_INVALID');
 const factories=Object.create(null);
 for(const [providerId,config] of Object.entries(configurations)){
  if(!Object.hasOwn(CAPABILITIES,providerId))fail('PROVIDER_INVALID');
  if(!config||typeof config!=='object'||typeof config.baseUrl!=='string')fail('CONFIG_INVALID');
  const expectedCapability=CAPABILITIES[providerId];
  factories[providerId]=({capabilityRegistry,capability})=>{
   if(capability!==expectedCapability)fail('CAPABILITY_DENIED');
   const transport=transportFactory
     ?transportFactory({providerId,allowedOrigins:[config.baseUrl]})
     :createGovernedHttpTransport({allowedOrigins:[config.baseUrl],fetchImpl});
   return createInsightReadAdapter({
    providerId,capabilityRegistry,credentialBroker,transport,config
   });
  };
 }
 return Object.freeze(factories);
}
