import test from 'node:test';
import assert from 'node:assert/strict';
import {saveA01Evidence,readA01Evidence} from './jarvis-a01-evidence-archive.mjs';

const now=new Date('2026-11-18T01:00:00.000Z');
const sha='a'.repeat(64);
const sourceKinds=['inventory','shortages','purchaseOrders'];
function report(){
 return {schemaVersion:'VAOS_JARVIS_A01_SOURCE_RECONCILIATION_V1',mission:'JARVIS-A01',
  status:'HOLD',consistencyGate:'PASS',businessSourceAuthorityVerified:false,
  readOnly:true,actionAuthorized:false,productionWriteAuthorized:false,aiModelInvocations:0,
  holds:['AUTHORITATIVE_DATABASE_REVISION_REQUIRED'],
  sources:sourceKinds.map((sourceKind,i)=>({
   sourceKind,consistency:'MATCHED',observationCount:[1,0,47][i],
   contentDigest:sha,secondReadDigest:sha,checkedAt:now.toISOString(),
   extractedAt:now.toISOString(),sourceRevisionAuthority:'CONTENT_DIGEST_ONLY',
   authoritativeRevisionVerified:false,sourceCompletenessVerified:false,
   projectionReconciled:true,readOnly:true,productionWriteAuthorized:false,holds:[]
  })),
  specialistReview:{status:'BOUNDED_EVIDENCE',readOnly:true,actionAuthorized:false,
   productionWriteAuthorized:false,aiModelInvocations:0,holds:['ACTUAL_CAUSAL_IMPACT_NOT_ESTABLISHED'],
   findings:[{code:'SAMPLE_DISCREPANCY',severity:'MEDIUM',observedCount:1,classification:'SIGNAL',
    recommendedPreparation:'CONFIDENTIAL-ROW-NEVER-ARCHIVE'}],sourceDomains:[]}
 };
}
function bucket(){
 const objects=new Map();
 return {objects,async put(k,v,options){if(!options?.onlyIf||options.onlyIf.etagDoesNotMatch!=='*'||objects.has(k))return null;objects.set(k,v);return {etag:'1'};},
 async get(k){const s=objects.get(k);return s?{text:async()=>s}:null;}};
}
const uuid=()=> '11111111-1111-4111-8111-111111111111';

test('explicit R2 archive retains metadata, never raw records, notes or arbitrary findings prose',async()=>{
 const b=bucket(),input=report();
 input.sources[0].records=[{sku:'CONFIDENTIAL-SKU-DO-NOT-ARCHIVE'}];
 const out=await saveA01Evidence({bucket:b,report:input,now,uuid});
 assert.equal(out.stored,true);
 assert.equal(out.businessSourceAuthorityVerified,false);
 assert.equal(out.actionAuthorized,false);
 assert.equal(b.objects.size,1);
 const raw=[...b.objects.values()][0];
 assert.doesNotMatch(raw,/CONFIDENTIAL|recommendedPreparation|sourceDomains|records/);
 const replay=await readA01Evidence({bucket:b,receipt:out.receipt});
 assert.equal(replay.evidence.status,'HOLD');
 assert.equal(replay.evidence.sourceEvidence.length,3);
 assert.equal(replay.evidence.specialistFindings[0].code,'SAMPLE_DISCREPANCY');
 assert.equal(replay.integrityVerified,true);
 assert.equal(replay.businessSourceAuthorityVerified,false);
});

test('source authority cannot be promoted by fabricated A01 response',async()=>{
 const b=bucket();
 for(const bad of [
  {...report(),status:'PASS'}, {...report(),businessSourceAuthorityVerified:true},
  {...report(),productionWriteAuthorized:true},
  {...report(),aiModelInvocations:1}, {...report(),sources:report().sources.slice(0,2)},
  {...report(),sources:report().sources.map(s=>({...s,sourceRevisionAuthority:'AUTHORITATIVE_DB'}))},
 ])await assert.rejects(saveA01Evidence({bucket:b,report:bad,now,uuid}),/A01_ARCHIVE_REPORT_INVALID/);
 assert.equal(b.objects.size,0);
});

test('missing R2, conflicts and altered persisted summaries hold closed',async()=>{
 const input=report(),b=bucket();
 await assert.rejects(saveA01Evidence({bucket:null,report:input,now,uuid}),/A01_ARCHIVE_UNAVAILABLE/);
 const receipt=(await saveA01Evidence({bucket:b,report:input,now,uuid})).receipt;
 await assert.rejects(saveA01Evidence({bucket:b,report:input,now,uuid}),/A01_ARCHIVE_CONFLICT/);
 const key=[...b.objects.keys()][0],record=JSON.parse(b.objects.get(key));
 record.evidence.sourceEvidence[0].observationCount=123;
 b.objects.set(key,JSON.stringify(record));
 await assert.rejects(readA01Evidence({bucket:b,receipt}),/A01_ARCHIVE_UNVERIFIED/);
});

test('receipt traversal and unknown receipt are rejected without exposing storage',async()=>{
 const b=bucket(),receipt='2026-11-18/11111111-1111-4111-8111-111111111111';
 for(const r of ['../../private','2026-11-18/../../secret','2026-11-18/nope',
  '2026-11-18/11111111-1111-4111-8111-111111111111?x=1']){
  await assert.rejects(readA01Evidence({bucket:b,receipt:r}),/A01_ARCHIVE_RECEIPT_INVALID/);
 }
 await assert.rejects(readA01Evidence({bucket:b,receipt}),/A01_ARCHIVE_NOT_FOUND/);
});
