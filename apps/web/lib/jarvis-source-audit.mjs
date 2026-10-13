/** G2b source authority audit: aggregate-only read via pre-existing server-key edge.
 * Qualification is not conferred by a successful read or metadata replay.
 */
import {createHash} from 'node:crypto';
const F=()=>{throw Error('G2B_AUDIT_INVALID')};
const REPLAY_FAIL=()=>{throw Error('G2B_REPLAY_INVALID')};
const COUNT=x=>Number.isSafeInteger(x)&&x>=0;
const DT=/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;
const DATE=x=>typeof x==='string'&&DT.test(x)&&Number.isFinite(Date.parse(x));
const AUDIT_KEYS=[
 'checkedAt','changedAfterLinkCount','futureSourceTimestamps','fullDatabaseRecoveryQualified',
 'legacyLinkCount','missingSourceTimestamps','qualifiedLinkCount','schemaVersion',
 'scope','semanticContradictionsResolved','sourceDocumentVersionsIndependentlyVerified',
 'sourceEndpointJobsSucceeded','sourceVersionSignatureVerified','totalLinkCount'
].sort().join(',');
export function validateSourceAudit(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!==AUDIT_KEYS
  ||raw.schemaVersion!=='G2B_SOURCE_AUDIT_V1'
  ||raw.scope!=='GOVERNED_VAOS_DIGITAL_THREAD'||!DATE(raw.checkedAt)
  ||!COUNT(raw.totalLinkCount)||!COUNT(raw.qualifiedLinkCount)
  ||!COUNT(raw.sourceEndpointJobsSucceeded)||!COUNT(raw.changedAfterLinkCount)
  ||!COUNT(raw.missingSourceTimestamps)||!COUNT(raw.futureSourceTimestamps)
  ||!COUNT(raw.legacyLinkCount)
  ||raw.qualifiedLinkCount>raw.totalLinkCount||raw.legacyLinkCount>raw.totalLinkCount-raw.qualifiedLinkCount
  ||raw.sourceEndpointJobsSucceeded>raw.totalLinkCount
  ||raw.changedAfterLinkCount>raw.totalLinkCount||raw.missingSourceTimestamps>raw.totalLinkCount
  ||raw.futureSourceTimestamps>raw.totalLinkCount
  ||raw.sourceVersionSignatureVerified!==false
  ||raw.sourceDocumentVersionsIndependentlyVerified!==false
  ||raw.fullDatabaseRecoveryQualified!==false
  ||raw.semanticContradictionsResolved!==false)F();
 return Object.freeze({
  schemaVersion:raw.schemaVersion,scope:raw.scope,checkedAt:raw.checkedAt,
  status:'SOURCE_AUTHORITY_REVIEW_OPEN',
  totalLinkCount:raw.totalLinkCount,qualifiedLinkCount:raw.qualifiedLinkCount,
  unqualifiedLinkCount:raw.totalLinkCount-raw.qualifiedLinkCount,
  sourceEndpointJobsSucceeded:raw.sourceEndpointJobsSucceeded,
  changedAfterLinkCount:raw.changedAfterLinkCount,
  missingSourceTimestamps:raw.missingSourceTimestamps,
  futureSourceTimestamps:raw.futureSourceTimestamps,legacyLinkCount:raw.legacyLinkCount,
  sourceVersionSignatureVerified:false,sourceDocumentVersionsIndependentlyVerified:false,
  fullDatabaseRecoveryQualified:false,semanticContradictionsResolved:false,
  g2bFullyCommissioned:false,actionAuthorized:false,agentDispatchAuthorized:false,
  auditKind:'AUTHORITY_METADATA_ONLY',
  interpretation:'Creation job and timestamp consistency are observed only; source data freshness, document versions, semantic contradictions and independent disaster recovery remain unverified.'
 });
}
export async function readSourceAudit({url,serverSecret,fetchImpl=globalThis.fetch}={}){
 if(typeof url!=='string'||!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)
   ||typeof serverSecret!=='string'||serverSecret.length<3||typeof fetchImpl!=='function')
   throw Error('G2B_AUDIT_CONFIG_HOLD');
 const response=await fetchImpl(url.replace(/\/$/,'')+'/functions/v1/vaos-control',{
  method:'POST',headers:{'Content-Type':'application/json','Cache-Control':'no-store',
    'x-vaos-server-key':serverSecret},
  body:JSON.stringify({operation:'jarvisSourceAudit',payload:{}})
 });
 if(!response?.ok)throw Error('G2B_AUDIT_UNAVAILABLE');
 return validateSourceAudit(await response.json());
}
const ID=/^(?:link|node):g2b:[0-9a-f]{64}$/;
const DOMAIN=new Set(['QA_CAPA','PROJECT_RISK','ENGINEERING_BASELINE']);
const REL=new Set(['DRIVES_CHANGE','MITIGATES_RISK','TRIGGERS_CAPA','RELATED_TO']);
const LINK_FIELDS=['createdAt','id','provenance','relationType','source','sourceDomain','target','targetDomain'].sort().join(',');
/** An ISOLATED deterministic serializer/reconstructor for pseudonymous graph
 * projection only. This is NOT pg_dump and does NOT prove business DB restore.
 */
export async function verifyMetadataRoundTrip(snapshot){
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||
  Object.keys(snapshot).sort().join(',')!=='links,schemaVersion'||
  snapshot.schemaVersion!=='G2B_AUTHORITY_GRAPH_V1'||
  !Array.isArray(snapshot.links)||snapshot.links.length>100)REPLAY_FAIL();
 const seen=new Set();
 const links=snapshot.links.map(x=>{
  if(!x||typeof x!=='object'||Array.isArray(x)||
   Object.keys(x).sort().join(',')!==LINK_FIELDS||
   !ID.test(x.id)||!x.id.startsWith('link:')||
   !ID.test(x.source)||!x.source.startsWith('node:')||
   !ID.test(x.target)||!x.target.startsWith('node:')||
   !DOMAIN.has(x.sourceDomain)||!DOMAIN.has(x.targetDomain)||
   !REL.has(x.relationType)||
   x.provenance!=='LEASED_GOVERNED_SUCCESSFUL_JOB'||
   !DATE(x.createdAt)||seen.has(x.id))REPLAY_FAIL();
  seen.add(x.id);
  return {...x};
 });
 // Simulated read-only reconstruction within JS memory, never touching production data.
 const canonical=JSON.stringify({schemaVersion:snapshot.schemaVersion,
  links:links.sort((a,b)=>a.id.localeCompare(b.id))});
 const originalHash=createHash('sha256').update(canonical).digest('hex');
 const replayed=JSON.parse(canonical);
 const replayHash=createHash('sha256').update(JSON.stringify(replayed)).digest('hex');
 if(originalHash!==replayHash||replayed.links.length!==snapshot.links.length)REPLAY_FAIL();
 return Object.freeze({status:'METADATA_ROUNDTRIP_PASS',recordCount:links.length,
  checksumSha256:originalHash,fullDatabaseRecoveryQualified:false,
  businessDataRestored:false,productionWrites:0});
}
