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


test('A05 stores only allowlisted heldout aggregate in existing consented receipt and rejects forged status',async()=>{
 const {assessJarvisA05ShadowHoldout}=await import('./jarvis-a05-shadow-holdout.mjs');
 const full={mode:'DECLARED_REVIEW_RESULTS',pairs:Array.from({length:100},(_,i)=>({
  sampleId:'PRIVATE-RAW-SAMPLE-'+i,reviewerId:'reviewer-qa',
  baseline:{subjectId:'base',confidence:.05,correct:false,unsupportedClaims:0,latencyMs:100},
  candidate:{subjectId:'candidate',confidence:.95,correct:true,unsupportedClaims:0,latencyMs:100}
 }))};
 const a05=await assessJarvisA05ShadowHoldout(full);
 const b=bucket();
 const existing={...summary,a05ShadowReview:a05};
 const saved=await saveLearningReview({bucket:b,batch:full,summary:existing,now,
  uuid:()=> '11111111-1111-4111-8111-111111111111'});
 assert.equal(b.store.size,1);
 const raw=[...b.store.values()][0];
 assert.doesNotMatch(raw,/PRIVATE-RAW-SAMPLE|reviewer-qa|subjectId|sampleId/);
 const verified=await readLearningReview({bucket:b,receipt:saved.receipt});
 assert.equal(verified.summary.a05ShadowReview.status,'HOLD');
 assert.equal(verified.summary.a05ShadowReview.reversionDecision,'CONTINUE_SHADOW_ONLY');
 assert.equal(verified.summary.a05ShadowReview.liveRollbackExecuted,false);
 assert.equal(verified.summary.a05ShadowReview.productionModelChanged,false);
 const key=[...b.store.keys()][0],tampered=JSON.parse(b.store.get(key));
 tampered.summary.a05ShadowReview.status='PRODUCTION_QUALIFIED';
 b.store.set(key,JSON.stringify(tampered));
 await assert.rejects(readLearningReview({bucket:b,receipt:saved.receipt}),/LEARNING_RECEIPT_UNVERIFIED/);
});
