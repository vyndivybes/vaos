/** Fixed four-domain signed-read specialist investigation.
 * An observed discrepancy is a prelaunch evidence lead, not a proven
 * production delay, actual incident, financial loss or approved correction.
 * Raw source identifiers remain request-local and are never returned.
 */
import {G3_REQUIRED_READS} from './g3-source-readiness.mjs';
import {buildDataAgentInvestigation} from '../apps/web/lib/data-agent-investigation.mjs';

const HOLD=(reason)=>Object.freeze({
 schemaVersion:'VAOS_JARVIS_A01_SPECIALIST_REVIEW_V1',
 status:'SOURCE_HOLD',findings:[],holds:[reason],
 sourceDomains:['procurement','inventory','production','engineering'],
 causalProofEstablished:false,completeDatasetVerified:false,
 sourceRevisionVerified:false,actualProductionIncidentConfirmed:false,
 aiModelInvocations:0,externalActionDispatched:false,readOnly:true,
 actionAuthorized:false,productionWriteAuthorized:false
});

export async function runA01SpecialistReview({reader}={}){
 if(typeof reader?.execute!=='function')return HOLD('SIGNED_SPECIALIST_READER_UNAVAILABLE');
 const observations=await Promise.all(G3_REQUIRED_READS.map(async ({domain:upper,actionType,authority})=>{
  const domain=upper.toLowerCase();
  try{
   const output=await reader.execute({
    actionType,id:crypto.randomUUID(),intentId:crypto.randomUUID(),
    payload:{missionId:'jarvis:a01:four-domain-evidence',limit:50}
   });
   if(output?.actionType!==actionType||output?.sourceAuthority!==authority||
      output?.effectClass!=='read'||output?.readOnly!==true||
      output?.actionAuthorized!==false||output?.productionWriteAuthorized!==false||
      !output?.data||typeof output.data!=='object'||Array.isArray(output.data))
     return {domain,status:'HOLD'};
   return {domain,status:'OBSERVED',data:output.data};
  }catch{return {domain,status:'HOLD'};}
 }));
 let review;
 try{
  review=buildDataAgentInvestigation({
   question:'Investigate prelaunch procurement inventory production and engineering discrepancies',
   observations
  });
 }catch{return HOLD('SPECIALIST_SOURCE_FORMAT_UNVERIFIED');}
 if(review?.status!=='BOUNDED_EVIDENCE'||
  review.readOnly!==true||review.actionAuthorized!==false||
  review.causalProofEstablished!==false||review.completeDatasetVerified!==false||
  !Array.isArray(review.findings)||review.findings.length>8)return HOLD('SPECIALIST_SOURCE_HOLD');
 const allowed=new Set(['LOW','MEDIUM','HIGH','CRITICAL']);
 const findings=review.findings.map(x=>{
  if(!/^[A-Z_]{8,96}$/.test(x.code)||!allowed.has(x.severity)||
    !Number.isSafeInteger(x.observedCount)||x.observedCount<1||
    x.observedCount>50)throw Error('SPECIALIST_FINDING_INVALID');
  return {code:x.code,severity:x.severity,classification:x.classification,
   observedCount:x.observedCount,reviewPriority:x.reviewPriority,
   recommendedPreparation:x.action};
 });
 return Object.freeze({
  schemaVersion:'VAOS_JARVIS_A01_SPECIALIST_REVIEW_V1',
  status:'BOUNDED_EVIDENCE',findings,
  holds:['INDEPENDENT_SOURCE_SNAPSHOT_AND_REVISION_UNVERIFIED',
   'SELECTED_ROWS_NOT_COMPLETE_ENTERPRISE_DATASET',
   'ACTUAL_CAUSAL_IMPACT_NOT_ESTABLISHED'],
  sourceDomains:G3_REQUIRED_READS.map(x=>x.domain.toLowerCase()),
  sourceReadCoverage:observations.map(x=>({domain:x.domain,status:x.status})),
  causalProofEstablished:false,completeDatasetVerified:false,
  sourceRevisionVerified:false,actualProductionIncidentConfirmed:false,
  aiModelInvocations:0,externalActionDispatched:false,readOnly:true,
  actionAuthorized:false,productionWriteAuthorized:false
 });
}
