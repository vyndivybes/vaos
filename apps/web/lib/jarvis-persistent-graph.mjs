/** G2b read-only projection of EXISTING governed durable digital-thread links.
 * Never stores or exposes underlying records, emails, source context, or raw UUIDs.
 * No model calls, business writes, new agents or paid storage.
 */
const HEX=/^[0-9a-f]{64}$/;
const DOMAINS=new Set(['QA_CAPA','ENGINEERING_BASELINE','PROJECT_RISK']);
const RELATIONS=new Set(['DRIVES_CHANGE','MITIGATES_RISK','TRIGGERS_CAPA','RELATED_TO']);
const KEYS=['createdAt','id','provenance','relationType','source','sourceDomain','target','targetDomain'].sort().join(',');
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
const FAIL=()=>{throw Error('G2B_GRAPH_INVALID')};
const validDate=x=>typeof x==='string'&&ISO.test(x)&&Number.isFinite(Date.parse(x));
export function validatePersistentGraph(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)
  ||raw.schemaVersion!=='G2B_AUTHORITY_GRAPH_V1'
  ||raw.sourceSystem!=='VAOS_GOVERNED_DIGITAL_THREAD'
  ||raw.graphStorage!=='POSTGRES_EXISTING_GOVERNED_LINKS'
  ||!['OBSERVED','HOLD'].includes(raw.status)
  ||!validDate(raw.asOf)
  ||raw.sourceDataFreshnessCertified!==false
  ||raw.causalRelationshipsVerified!==false
  ||raw.cryptographicSignatureVerified!==false
  ||raw.sourceRecordVersionsVerified!==false
  ||!Number.isSafeInteger(raw.eligibleLinkCount)||raw.eligibleLinkCount<0||raw.eligibleLinkCount>100
  ||!Number.isSafeInteger(raw.heldLegacyLinkCount)||raw.heldLegacyLinkCount<0
  ||!Number.isSafeInteger(raw.unprojectedLinkCount)||raw.unprojectedLinkCount<raw.heldLegacyLinkCount
  ||!Array.isArray(raw.links)||raw.links.length!==raw.eligibleLinkCount
  ||raw.links.length>100||raw.status!==(raw.links.length?'OBSERVED':'HOLD'))
  FAIL();
 const seen=new Set();
 const links=raw.links.map(x=>{
  if(!x||typeof x!=='object'||Array.isArray(x)
   ||Object.keys(x).sort().join(',')!==KEYS
   ||typeof x.id!=='string'||!x.id.startsWith('link:g2b:')||!HEX.test(x.id.slice(9))
   ||typeof x.source!=='string'||!x.source.startsWith('node:g2b:')||!HEX.test(x.source.slice(9))
   ||typeof x.target!=='string'||!x.target.startsWith('node:g2b:')||!HEX.test(x.target.slice(9))
   ||!DOMAINS.has(x.sourceDomain)||!DOMAINS.has(x.targetDomain)
   ||!RELATIONS.has(x.relationType)
   ||x.provenance!=='LEASED_GOVERNED_SUCCESSFUL_JOB'
   ||!validDate(x.createdAt)||seen.has(x.id))
   FAIL();
  seen.add(x.id);
  return Object.freeze({...x});
 });
 return Object.freeze({
  schemaVersion:raw.schemaVersion,sourceSystem:raw.sourceSystem,graphStorage:raw.graphStorage,
  status:raw.status,asOf:raw.asOf,
  eligibleLinkCount:raw.eligibleLinkCount,heldLegacyLinkCount:raw.heldLegacyLinkCount,
  unprojectedLinkCount:raw.unprojectedLinkCount,
  links:Object.freeze(links),
  persistenceVerified:true,
  sourceDataFreshnessCertified:false,causalRelationshipsVerified:false,
  cryptographicSignatureVerified:false,sourceRecordVersionsVerified:false,
  actionAuthorized:false,agentDispatchAuthorized:false,
  scope:'CONTROLLED_DOMAIN_LINK_METADATA_ONLY',
  notes:'Persisted link creation is not verification of underlying record version, current source freshness, causality or engineering release.',
 });
}
export async function readPersistentGraph({url,serverSecret,fetchImpl=globalThis.fetch}={}){
 if(typeof url!=='string'||!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)
  ||typeof serverSecret!=='string'||serverSecret.length<3
  ||typeof fetchImpl!=='function')throw Error('G2B_CONFIG_HOLD');
 const response=await fetchImpl(url.replace(/\/$/,'')+'/functions/v1/vaos-control',{
  method:'POST',headers:{'Content-Type':'application/json','Cache-Control':'no-store',
   'x-vaos-server-key':serverSecret},
  body:JSON.stringify({operation:'jarvisAuthorityGraph',payload:{}}),
 });
 if(!response?.ok)throw Error('G2B_SOURCE_UNAVAILABLE');
 const raw=await response.json();
 return validatePersistentGraph(raw);
}
