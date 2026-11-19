import test from 'node:test';
import assert from 'node:assert/strict';
import {saveA03Evidence,readA03Evidence} from './jarvis-a03-evidence-archive.mjs';

const NOW=new Date('2026-11-19T07:45:00.000Z');
const ID='f9531892-8811-4aba-9b21-4fcb24be5a01';
function trial(){
 return {schemaVersion:'VAOS_JARVIS_A03_SIGNED_READ_CANARY_V1',
  mission:'JARVIS-A03-MANUAL-READ',status:'BOUNDED_READ_COMPLETE',
  qualificationStatus:'HOLD',mode:'FOUNDER_MANUAL_SIGNED_READ',
  independentBusinessFactsCertified:false,sourceCompletenessVerified:false,
  sameTransactionSnapshotVerified:false,businessSourceAuthorityVerified:false,
  businessWritesExecuted:0,modelCalls:0,productionWriteAuthorized:false,
  actionAuthorized:false,agentDispatchAuthorized:false,readOnly:true,
  externalReadInvocations:3,
  sources:['inventory','shortages','purchaseOrders'].map((kind,i)=>({
   sourceKind:kind,status:'SIGNED_BOUNDED_OBSERVATION',
   sourceCount:[1,0,47][i],
   verifiedContentDigest:String(i+1).repeat(64),
   asOf:'2026-11-19T07:44:55.000Z',
   authoritativeRevisionVerified:false,sourceCompletenessVerified:false,
   sameTransactionSnapshotVerified:false,productionWriteAuthorized:false,
   rawRows:[{sku:'PRIVATE-SKU-550'}]})),
  holds:['INDEPENDENT_SOURCE_REVISION_REQUIRED','CROSS_SOURCE_TRANSACTION_SNAPSHOT_UNVERIFIED','A03_OPERATIONAL_QUALIFICATION_PENDING'],
  unexpectedPrivateData:{supplierId:'PRIVATE-SUPPLIER'}
 };
}
function bucket(){
 const rows=new Map();let writes=0;
 return {rows,get writes(){return writes},
  async put(key,value,opts){writes++;if(rows.has(key)||opts?.onlyIf?.etagDoesNotMatch!=='*')return null;rows.set(key,value);return {etag:'new'};},
  async get(key){return rows.has(key)?{text:async()=>rows.get(key)}:null;}
 };
}
test('A03 R2 evidence: one immutable hashed metadata-only receipt from a NEW verified signed-read result',async()=>{
 const b=bucket();
 const saved=await saveA03Evidence({bucket:b,report:trial(),now:NOW,uuid:()=>ID});
 assert.equal(saved.stored,true);
 assert.equal(saved.status,'HOLD');
 assert.equal(saved.boundedReadCompleted,true);
 assert.equal(saved.receipt,'2026-11-19/'+ID);
 assert.equal(saved.businessSourceAuthorityVerified,false);
 assert.equal(saved.actionAuthorized,false);
 assert.equal(b.writes,1);
 const key=[...b.rows.keys()][0];
 assert.equal(key,'jarvis/a03/evidence/v1/2026-11-19/'+ID+'.json');
 const stored=b.rows.get(key);
 assert.ok(!stored.includes('PRIVATE-SKU-550')&&!stored.includes('PRIVATE-SUPPLIER'));
 assert.ok(!stored.includes('rawRows'));
 const retrieved=await readA03Evidence({bucket:b,receipt:saved.receipt});
 assert.equal(retrieved.integrityVerified,true);
 assert.equal(retrieved.independentSignatureVerified,false);
 assert.equal(retrieved.evidence.status,'BOUNDED_READ_COMPLETE');
 assert.deepEqual(retrieved.evidence.sources.map(s=>s.sourceCount),[1,0,47]);
 assert.equal(retrieved.evidence.sourceRevisionAuthority,'CONTENT_DIGEST_ONLY');
 assert.equal(retrieved.businessSourceAuthorityVerified,false);
 assert.equal(retrieved.productionWriteAuthorized,false);
});
test('A03 R2 evidence detects tampering and denies invalid receipt identifiers, missing bucket or replay overwrite',async()=>{
 const b=bucket();
 const original=await saveA03Evidence({bucket:b,report:trial(),now:NOW,uuid:()=>ID});
 await assert.rejects(saveA03Evidence({bucket:b,report:trial(),now:NOW,uuid:()=>ID}),/A03_ARCHIVE_CONFLICT/);
 await assert.rejects(readA03Evidence({bucket:b,receipt:'../../private'}),/A03_ARCHIVE_RECEIPT_INVALID/);
 await assert.rejects(readA03Evidence({bucket:b,receipt:'2026-02-30/'+ID}),/A03_ARCHIVE_RECEIPT_INVALID/);
 const key=[...b.rows.keys()][0];
 const j=JSON.parse(b.rows.get(key));
 j.evidence.sources[2].sourceCount=99;
 b.rows.set(key,JSON.stringify(j));
 await assert.rejects(readA03Evidence({bucket:b,receipt:original.receipt}),/A03_ARCHIVE_UNVERIFIED/);
 await assert.rejects(saveA03Evidence({bucket:null,report:trial()}),/A03_ARCHIVE_UNAVAILABLE/);
});
test('A03 archive fails closed for invented qualification, source provenance or authorization',async()=>{
 for(const change of [
  {qualificationStatus:'PASS'},
  {businessSourceAuthorityVerified:true},
  {independentBusinessFactsCertified:true},
  {sourceCompletenessVerified:true},
  {productionWriteAuthorized:true},
  {actionAuthorized:true},
  {agentDispatchAuthorized:true},
  {businessWritesExecuted:1},
  {modelCalls:1},
  {externalReadInvocations:6},
  {status:'QUALIFIED'},
  {sources:trial().sources.map((s,i)=>i===1?{...s,sourceCount:-1}:s)},
  {sources:trial().sources.map((s,i)=>i===1?{...s,verifiedContentDigest:'falsified'}:s)}
 ]){
  const b=bucket();await assert.rejects(
   saveA03Evidence({bucket:b,report:{...trial(),...change},now:NOW,uuid:()=>ID}),
   /A03_ARCHIVE_REPORT_INVALID/);
  assert.equal(b.writes,0);
 }
});
test('A03 archive can record a failed bounded read as HOLD but never promote it to success',async()=>{
 const r=trial();
 r.status='HOLD';r.externalReadInvocations=1;
 r.sources=r.sources.map((s,i)=>i===0?
  {...s,status:'HOLD',sourceCount:null,verifiedContentDigest:null,asOf:undefined}:
  {...s,status:'NOT_ATTEMPTED',sourceCount:null,verifiedContentDigest:null,asOf:undefined});
 const b=bucket();
 const receipt=await saveA03Evidence({bucket:b,report:r,now:NOW,uuid:()=>ID});
 assert.equal(receipt.stored,true);
 assert.equal(receipt.boundedReadCompleted,false);
 const read=await readA03Evidence({bucket:b,receipt:receipt.receipt});
 assert.equal(read.evidence.status,'HOLD');
 assert.deepEqual(read.evidence.sources.map(s=>s.sourceCount),[null,null,null]);
});
