/** Founder-consented A01 metadata receipts. R2 is NOT a source-of-record certification.
 * Preserve only allowlisted aggregate diagnostics; never raw ERP identifiers/rows.
 */
const PREFIX='jarvis/a01/evidence/v1/';
const KINDS=['inventory','shortages','purchaseOrders'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECEIPT=/^(\d{4}-\d{2}-\d{2})\/([0-9a-f-]{36})$/i;
const HASH=/^[a-f0-9]{64}$/;
const CODE=/^[A-Za-z][A-Za-z0-9_:.-]{1,95}$/;
const ERROR=code=>{throw Error(code)};
const sha256=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),
 n=>n.toString(16).padStart(2,'0')).join('');
function iso(v){
 if(typeof v!=='string'||! /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))return false;
 const ms=Date.parse(v);return Number.isFinite(ms)&&new Date(ms).toISOString()===v;
}
function codes(xs){
 if(!Array.isArray(xs)||xs.length>30||xs.some(v=>typeof v!=='string'||!CODE.test(v)))
  ERROR('A01_ARCHIVE_REPORT_INVALID');
 return [...new Set(xs)];
}
function digest(v){if(v===null)return null;if(typeof v!=='string'||!HASH.test(v))ERROR('A01_ARCHIVE_REPORT_INVALID');return v;}
function normalize(report){
 if(!report||report.schemaVersion!=='VAOS_JARVIS_A01_SOURCE_RECONCILIATION_V1'||
    report.mission!=='JARVIS-A01'||report.status!=='HOLD'||
    !['PASS','HOLD'].includes(report.consistencyGate)||
    report.businessSourceAuthorityVerified!==false||
    report.productionWriteAuthorized!==false||report.actionAuthorized!==false||
    report.readOnly!==true||report.aiModelInvocations!==0||
    !Array.isArray(report.sources)||report.sources.length!==3)
   ERROR('A01_ARCHIVE_REPORT_INVALID');
 const holds=codes(report.holds);
 if(!holds.includes('AUTHORITATIVE_DATABASE_REVISION_REQUIRED'))ERROR('A01_ARCHIVE_REPORT_INVALID');
 const sourceEvidence=KINDS.map((kind,i)=>{
  const v=report.sources[i];
  if(!v||v.sourceKind!==kind||!['MATCHED','HOLD'].includes(v.consistency)||
     v.sourceRevisionAuthority!=='CONTENT_DIGEST_ONLY'||v.authoritativeRevisionVerified!==false||
     v.sourceCompletenessVerified!==false||v.readOnly!==true||v.productionWriteAuthorized!==false||
     typeof v.projectionReconciled!=='boolean'||!iso(v.checkedAt)||
     (v.observationCount!==null&&(!Number.isSafeInteger(v.observationCount)||v.observationCount<0||v.observationCount>100)))
    ERROR('A01_ARCHIVE_REPORT_INVALID');
  const contentDigest=digest(v.contentDigest);
  const secondReadDigest=digest(v.secondReadDigest);
  if(v.consistency==='MATCHED'&&(contentDigest===null||secondReadDigest===null||
    contentDigest!==secondReadDigest||!v.projectionReconciled||v.observationCount===null))
    ERROR('A01_ARCHIVE_REPORT_INVALID');
  return {sourceKind:kind,consistency:v.consistency,observationCount:v.observationCount,
   contentDigest,secondReadDigest,checkedAt:v.checkedAt,projectionReconciled:v.projectionReconciled,
   authoritativeRevisionVerified:false,holds:codes(v.holds)};
 });
 if((report.consistencyGate==='PASS')!==sourceEvidence.every(s=>s.consistency==='MATCHED'))
  ERROR('A01_ARCHIVE_REPORT_INVALID');
 const review=report.specialistReview;
 if(!review||!['BOUNDED_EVIDENCE','SOURCE_HOLD','NOT_RUN_SOURCE_GATE_HOLD'].includes(review.status)||
  review.actionAuthorized!==false||review.productionWriteAuthorized!==false||
  review.readOnly!==true||review.aiModelInvocations!==0||
  !Array.isArray(review.findings)||review.findings.length>8||
  (report.consistencyGate==='HOLD'&&review.status!=='NOT_RUN_SOURCE_GATE_HOLD'))
  ERROR('A01_ARCHIVE_REPORT_INVALID');
 const specialistFindings=review.findings.map(f=>{
  if(!f||typeof f.code!=='string'||! /^[A-Z][A-Z_]{7,95}$/.test(f.code)||
    !['LOW','MEDIUM','HIGH','CRITICAL'].includes(f.severity)||
    !Number.isSafeInteger(f.observedCount)||f.observedCount<1||f.observedCount>50)
   ERROR('A01_ARCHIVE_REPORT_INVALID');
  return {code:f.code,severity:f.severity,observedCount:f.observedCount};
 });
 const specialistHolds=Array.isArray(review.holds)?codes(review.holds):[];
 return {schemaVersion:'VAOS_JARVIS_A01_ARCHIVED_EVIDENCE_V1',
   mission:'JARVIS-A01',status:'HOLD',consistencyGate:report.consistencyGate,
   sourceRevisionAuthority:'CONTENT_DIGEST_ONLY',businessSourceAuthorityVerified:false,
   sourceCompletenessVerified:false,readOnly:true,actionAuthorized:false,productionWriteAuthorized:false,
   aiModelInvocations:0,sourceEvidence,holds,
   specialistStatus:review.status,specialistFindings,specialistHolds};
}
function keyOf(receipt){
 const m=typeof receipt==='string'?RECEIPT.exec(receipt):null;
 if(!m||!UUID.test(m[2])||!Number.isFinite(Date.parse(m[1]+'T00:00:00.000Z'))||
    new Date(m[1]+'T00:00:00.000Z').toISOString().slice(0,10)!==m[1])
  ERROR('A01_ARCHIVE_RECEIPT_INVALID');
 return PREFIX+receipt+'.json';
}
export async function saveA01Evidence({bucket,report,now=new Date(),uuid=()=>crypto.randomUUID()}={}){
 if(typeof bucket?.put!=='function')ERROR('A01_ARCHIVE_UNAVAILABLE');
 const evidence=normalize(report);
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))ERROR('A01_ARCHIVE_REPORT_INVALID');
 const id=uuid();if(!UUID.test(id))ERROR('A01_ARCHIVE_REPORT_INVALID');
 const receipt=now.toISOString().slice(0,10)+'/'+id;
 const integritySha256=await sha256(JSON.stringify(evidence));
 const record={schemaVersion:'VAOS_JARVIS_A01_EVIDENCE_RECEIPT_V1',
  receipt,recordedAt:now.toISOString(),evidence,integritySha256,
  integrityScope:'SAME_RECORD_CONTENT_HASH_NOT_INDEPENDENT_SIGNATURE',
  businessSourceAuthorityVerified:false,actionAuthorized:false,productionWriteAuthorized:false};
 const saved=await bucket.put(keyOf(receipt),JSON.stringify(record),{
  onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}
 });
 if(!saved)ERROR('A01_ARCHIVE_CONFLICT');
 return {stored:true,receipt,integritySha256,status:'HOLD',businessSourceAuthorityVerified:false,
  actionAuthorized:false,productionWriteAuthorized:false};
}
export async function readA01Evidence({bucket,receipt}={}){
 const key=keyOf(receipt);
 if(typeof bucket?.get!=='function')ERROR('A01_ARCHIVE_UNAVAILABLE');
 const obj=await bucket.get(key);
 if(!obj)ERROR('A01_ARCHIVE_NOT_FOUND');
 let record;
 try{record=JSON.parse(await obj.text());}catch{ERROR('A01_ARCHIVE_UNVERIFIED');}
 if(record?.schemaVersion!=='VAOS_JARVIS_A01_EVIDENCE_RECEIPT_V1'||
  record.receipt!==receipt||!iso(record.recordedAt)||
  record.businessSourceAuthorityVerified!==false||record.actionAuthorized!==false||
  record.productionWriteAuthorized!==false||
  record.integrityScope!=='SAME_RECORD_CONTENT_HASH_NOT_INDEPENDENT_SIGNATURE'||
  !HASH.test(record.integritySha256||''))ERROR('A01_ARCHIVE_UNVERIFIED');
 const actual=await sha256(JSON.stringify(record.evidence));
 if(actual!==record.integritySha256)ERROR('A01_ARCHIVE_UNVERIFIED');
 // Return allowlisted data only; no document/row data and no client-provided prose.
 const e=record.evidence;
 if(e?.schemaVersion!=='VAOS_JARVIS_A01_ARCHIVED_EVIDENCE_V1'||e.mission!=='JARVIS-A01'||
  e.status!=='HOLD'||e.businessSourceAuthorityVerified!==false||
  e.sourceRevisionAuthority!=='CONTENT_DIGEST_ONLY'||e.actionAuthorized!==false||
  e.productionWriteAuthorized!==false||e.aiModelInvocations!==0||
  !Array.isArray(e.sourceEvidence)||e.sourceEvidence.length!==3)
  ERROR('A01_ARCHIVE_UNVERIFIED');
 return {schemaVersion:record.schemaVersion,receipt,recordedAt:record.recordedAt,
  evidence:e,integritySha256:record.integritySha256,integrityVerified:true,
  independentSignatureVerified:false,businessSourceAuthorityVerified:false,
  actionAuthorized:false,productionWriteAuthorized:false};
}
