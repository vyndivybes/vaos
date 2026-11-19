/** A03 founder-consented durable evidence: bounded signed-read metadata only.
 * Object SHA256 checks corruption; it is not a provider signature or source revision.
 * This archive NEVER certifies enterprise completeness or grants business authority.
 */
const PREFIX='jarvis/a03/evidence/v1/';
const KINDS=Object.freeze(['inventory','shortages','purchaseOrders']);
const HASH=/^[a-f0-9]{64}$/;
const CODE=/^[A-Z][A-Z0-9_:]{2,95}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECEIPT=/^(\d{4}-\d{2}-\d{2})\/([0-9a-f-]{36})$/i;
function error(code){throw Error(code);}
function iso(value){
 return typeof value==='string'&&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&
  Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
}
const sha256=async str=>Array.from(new Uint8Array(await crypto.subtle.digest(
 'SHA-256',new TextEncoder().encode(str))),x=>x.toString(16).padStart(2,'0')).join('');
function key(receipt){
 const m=typeof receipt==='string'?RECEIPT.exec(receipt):null;
 if(!m||!UUID.test(m[2])||!iso(m[1]+'T00:00:00.000Z'))
  error('A03_ARCHIVE_RECEIPT_INVALID');
 return PREFIX+receipt+'.json';
}
function normalize(report){
 const invalid=()=>error('A03_ARCHIVE_REPORT_INVALID');
 if(!report||typeof report!=='object'||Array.isArray(report)||
  report.schemaVersion!=='VAOS_JARVIS_A03_SIGNED_READ_CANARY_V1'||
  report.mission!=='JARVIS-A03-MANUAL-READ'||
  report.mode!=='FOUNDER_MANUAL_SIGNED_READ'||
  !['BOUNDED_READ_COMPLETE','HOLD'].includes(report.status)||
  report.qualificationStatus!=='HOLD'||
  report.readOnly!==true||
  report.independentBusinessFactsCertified!==false||
  report.sourceCompletenessVerified!==false||
  report.sameTransactionSnapshotVerified!==false||
  report.businessSourceAuthorityVerified!==false||
  report.businessWritesExecuted!==0||report.modelCalls!==0||
  report.productionWriteAuthorized!==false||report.actionAuthorized!==false||
  report.agentDispatchAuthorized!==false||
  !Number.isSafeInteger(report.externalReadInvocations)||
  report.externalReadInvocations<0||report.externalReadInvocations>3||
  !Array.isArray(report.sources)||report.sources.length!==3||
  !Array.isArray(report.holds)||report.holds.length<1||report.holds.length>12||
  report.holds.some(x=>typeof x!=='string'||!CODE.test(x))||
  !report.holds.includes('INDEPENDENT_SOURCE_REVISION_REQUIRED'))
  invalid();
 const sources=report.sources.map((source,i)=>{
  if(!source||typeof source!=='object'||source.sourceKind!==KINDS[i]||
   !['SIGNED_BOUNDED_OBSERVATION','HOLD','NOT_ATTEMPTED'].includes(source.status)||
   source.authoritativeRevisionVerified!==false||
   source.sourceCompletenessVerified!==false||
   source.sameTransactionSnapshotVerified!==false||
   source.productionWriteAuthorized!==false)
   invalid();
  const good=source.status==='SIGNED_BOUNDED_OBSERVATION';
  if(good?(!Number.isSafeInteger(source.sourceCount)||source.sourceCount<0||
            source.sourceCount>100||typeof source.verifiedContentDigest!=='string'||
            !HASH.test(source.verifiedContentDigest)||!iso(source.asOf)):
      (source.sourceCount!==null||source.verifiedContentDigest!==null))
    invalid();
  return Object.freeze({sourceKind:source.sourceKind,status:source.status,
   sourceCount:good?source.sourceCount:null,
   contentDigest:good?source.verifiedContentDigest:null,
   extractedAt:good?source.asOf:null,
   sourceRevisionAuthority:'CONTENT_DIGEST_ONLY',
   independentlyCertified:false,
   sourceCompletenessVerified:false});
 });
 const successes=sources.filter(x=>x.status==='SIGNED_BOUNDED_OBSERVATION').length;
 const attempted=sources.filter(x=>x.status!=='NOT_ATTEMPTED').length;
 if(attempted!==report.externalReadInvocations||
  (report.status==='BOUNDED_READ_COMPLETE'&&(successes!==3||attempted!==3))||
  (report.status==='HOLD'&&successes===3))
  invalid();
 return Object.freeze({
  schemaVersion:'VAOS_JARVIS_A03_ARCHIVED_OBSERVATION_V1',
  mission:'JARVIS-A03-MANUAL-READ',status:report.status,
  boundedReadCompleted:report.status==='BOUNDED_READ_COMPLETE',
  externalReadInvocations:report.externalReadInvocations,
  qualificationStatus:'HOLD',sourceRevisionAuthority:'CONTENT_DIGEST_ONLY',
  sourceCompletenessVerified:false,
  businessSourceAuthorityVerified:false,independentBusinessFactsCertified:false,
  actionAuthorized:false,productionWriteAuthorized:false,
  agentDispatchAuthorized:false,businessWritesExecuted:0,
  sources:Object.freeze(sources),holds:Object.freeze([...new Set(report.holds)])
 });
}
export async function saveA03Evidence({bucket,report,now=new Date(),uuid=()=>crypto.randomUUID()}={}){
 if(typeof bucket?.put!=='function')error('A03_ARCHIVE_UNAVAILABLE');
 const evidence=normalize(report);
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))error('A03_ARCHIVE_REPORT_INVALID');
 const id=uuid();
 if(!UUID.test(id))error('A03_ARCHIVE_REPORT_INVALID');
 const receipt=now.toISOString().slice(0,10)+'/'+id;
 const integritySha256=await sha256(JSON.stringify(evidence));
 const object={
  schemaVersion:'VAOS_JARVIS_A03_EVIDENCE_RECEIPT_V1',
  receipt,recordedAt:now.toISOString(),evidence,integritySha256,
  integrityScope:'SAME_RECORD_CONTENT_HASH_NOT_INDEPENDENT_SIGNATURE',
  independentlyVerified:false,actionAuthorized:false,productionWriteAuthorized:false,
  businessSourceAuthorityVerified:false
 };
 const saved=await bucket.put(key(receipt),JSON.stringify(object),{
  onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}
 });
 if(!saved)error('A03_ARCHIVE_CONFLICT');
 return {stored:true,receipt,integritySha256,boundedReadCompleted:evidence.boundedReadCompleted,
  status:'HOLD',qualificationStatus:'HOLD',businessSourceAuthorityVerified:false,
  actionAuthorized:false,productionWriteAuthorized:false};
}
export async function readA03Evidence({bucket,receipt}={}){
 const k=key(receipt);
 if(typeof bucket?.get!=='function')error('A03_ARCHIVE_UNAVAILABLE');
 const entry=await bucket.get(k);
 if(!entry)error('A03_ARCHIVE_NOT_FOUND');
 let item;
 try{item=JSON.parse(await entry.text());}catch{error('A03_ARCHIVE_UNVERIFIED');}
 const fail=()=>error('A03_ARCHIVE_UNVERIFIED');
 if(item?.schemaVersion!=='VAOS_JARVIS_A03_EVIDENCE_RECEIPT_V1'||
   item.receipt!==receipt||!iso(item.recordedAt)||
   item.integrityScope!=='SAME_RECORD_CONTENT_HASH_NOT_INDEPENDENT_SIGNATURE'||
   !HASH.test(item.integritySha256||'')||
   item.independentlyVerified!==false||item.actionAuthorized!==false||
   item.productionWriteAuthorized!==false||item.businessSourceAuthorityVerified!==false)
  fail();
 const hash=await sha256(JSON.stringify(item.evidence));
 if(hash!==item.integritySha256)fail();
 const e=item.evidence;
 if(e?.schemaVersion!=='VAOS_JARVIS_A03_ARCHIVED_OBSERVATION_V1'||
  e?.mission!=='JARVIS-A03-MANUAL-READ'||
  !['BOUNDED_READ_COMPLETE','HOLD'].includes(e?.status)||
  e.qualificationStatus!=='HOLD'||e.businessSourceAuthorityVerified!==false||
  e.sourceCompletenessVerified!==false||e.independentBusinessFactsCertified!==false||
  e.sourceRevisionAuthority!=='CONTENT_DIGEST_ONLY'||
  e.actionAuthorized!==false||e.productionWriteAuthorized!==false||
  e.agentDispatchAuthorized!==false||e.businessWritesExecuted!==0||
  !Array.isArray(e.sources)||e.sources.length!==3||
  e.sources.some((s,i)=>s.sourceKind!==KINDS[i]||
   !['SIGNED_BOUNDED_OBSERVATION','HOLD','NOT_ATTEMPTED'].includes(s.status)||
   s.independentlyCertified!==false||s.sourceCompletenessVerified!==false||
   (s.status==='SIGNED_BOUNDED_OBSERVATION'?
     (!Number.isSafeInteger(s.sourceCount)||s.sourceCount<0||s.sourceCount>100||
      !HASH.test(s.contentDigest||'')||!iso(s.extractedAt)):
     s.sourceCount!==null)))
   fail();
 // Return only a fixed evidence summary, not the entire potentially mutated R2 object.
 return {schemaVersion:item.schemaVersion,receipt,recordedAt:item.recordedAt,
  integritySha256:item.integritySha256,integrityVerified:true,
  independentSignatureVerified:false,businessSourceAuthorityVerified:false,
  productionWriteAuthorized:false,actionAuthorized:false,
  evidence:{
   schemaVersion:e.schemaVersion,mission:e.mission,status:e.status,
   boundedReadCompleted:e.boundedReadCompleted,qualificationStatus:'HOLD',
   sourceRevisionAuthority:'CONTENT_DIGEST_ONLY',sourceCompletenessVerified:false,
   independentBusinessFactsCertified:false,businessSourceAuthorityVerified:false,
   productionWriteAuthorized:false,actionAuthorized:false,businessWritesExecuted:0,
   sources:e.sources.map(s=>({
    sourceKind:s.sourceKind,status:s.status,sourceCount:s.sourceCount,
    contentDigest:s.contentDigest,extractedAt:s.extractedAt,
    independentlyCertified:false,sourceCompletenessVerified:false
   }))
  }};
}
