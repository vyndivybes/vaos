import test from 'node:test';
import assert from 'node:assert/strict';
import {saveLearningReview,readLearningReview} from './jarvis-learning-ledger.mjs';
const now=new Date('2026-11-18T04:00:00.000Z');
const summary={schemaVersion:'JARVIS_PAIRED_EVALUATION_V1',status:'DESCRIPTIVE_METRICS_ONLY',holds:['LIVE_ACCEPTANCE_REQUIRED'],autoPromotionAuthorized:false};
const batch={mode:'DECLARED_REVIEW_RESULTS',pairs:[{sampleId:'s1',reviewerId:'reviewer',baseline:{subjectId:'b'},candidate:{subjectId:'c'}}]};
function bucket(){const store=new Map();return {store,async put(k,v){store.set(k,v);},async get(k){const v=store.get(k);return v?{text:async()=>v}:null;}}}
test('opt-in evaluation archives only aggregate findings and SHA, never sample or reviewer IDs',async()=>{
 const b=bucket();const save=await saveLearningReview({bucket:b,batch,summary,now,uuid:()=> '11111111-1111-4111-8111-111111111111'});
 assert.equal(save.stored,true);
 assert.match(save.receipt,/2026-11-18\/11111111-1111-4111-8111-111111111111/);
 assert.equal(b.store.size,1);
 assert.doesNotMatch([...b.store.values()][0],/reviewer|sampleId|subjectId|s1/);
 const read=await readLearningReview({bucket:b,receipt:save.receipt});
 assert.equal(read.summary.status,'DESCRIPTIVE_METRICS_ONLY');
 assert.equal(read.summary.autoPromotionAuthorized,false);
 assert.equal(read.sha256,save.sha256);
});
test('unavailable storage fails closed, no synthetic persistence',async()=>{
 await assert.rejects(saveLearningReview({bucket:null,batch,summary,now}),/LEARNING_ARCHIVE_UNAVAILABLE/);
 await assert.rejects(readLearningReview({bucket:null,receipt:'2026-11-18/11111111-1111-4111-8111-111111111111'}),/LEARNING_ARCHIVE_UNAVAILABLE/);
});
test('path traversal and malformed receipts fail before storage read',async()=>{
 const b=bucket();let calls=0;b.get=async()=>{calls++;return null;};
 for(const receipt of ['../../secrets','2026-11-18/../../admin','2026-11-18/123','2026-11-18/11111111-1111-4111-8111-111111111111?x=1'])
  await assert.rejects(readLearningReview({bucket:b,receipt}),/LEARNING_RECEIPT_INVALID/);
 assert.equal(calls,0);
});
test('missing or malformed stored records fail closed',async()=>{
 const b=bucket(),receipt='2026-11-18/11111111-1111-4111-8111-111111111111';
 await assert.rejects(readLearningReview({bucket:b,receipt}),/LEARNING_RECEIPT_NOT_FOUND/);
 b.store.set('jarvis/founder/learning-review/v1/'+receipt+'.json','{"unsafe":"x"}');
 await assert.rejects(readLearningReview({bucket:b,receipt}),/LEARNING_RECEIPT_UNVERIFIED/);
});
