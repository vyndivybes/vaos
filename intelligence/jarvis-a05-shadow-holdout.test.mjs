import test from 'node:test';
import assert from 'node:assert/strict';
import {assessJarvisA05ShadowHoldout} from './jarvis-a05-shadow-holdout.mjs';

const outcome=(subjectId,correct,extra={})=>({
 subjectId,confidence:correct?0.95:0.05,correct,
 unsupportedClaims:0,latencyMs:120,...extra
});
const pair=(i,b=false,c=true)=>({
 sampleId:'heldout-sample-'+String(i).padStart(4,'0'),
 reviewerId:'declared-qa-not-authenticated',
 baseline:outcome('baseline-v1',b),
 candidate:outcome('candidate-v2',c)
});
const batch=(n=100,b=false,c=true,mode='DECLARED_REVIEW_RESULTS')=>({
 mode,pairs:Array.from({length:n},(_,i)=>pair(i,b,c))
});
test('A05 shadow holdout is stable across input ordering and outcome changes without exporting sample IDs',async()=>{
 const b=batch(),before=await assessJarvisA05ShadowHoldout(b);
 const reversed=await assessJarvisA05ShadowHoldout({...b,pairs:[...b.pairs].reverse()});
 const altered=await assessJarvisA05ShadowHoldout(batch(100,true,false));
 assert.equal(before.schemaVersion,'VAOS_JARVIS_A05_SHADOW_HOLDOUT_V1');
 assert.equal(before.stage,'A05');
 assert.equal(before.status,'HOLD');
 assert.equal(before.partitionAlgorithm,'FIXED_SHA256_SAMPLE_ID_MOD5_V1');
 assert.equal(before.holdoutIndependentlyLocked,false);
 assert.equal(before.holdoutSampleCount+before.developmentSampleCount,100);
 assert.ok(before.holdoutSampleCount>=10);
 assert.ok(before.developmentSampleCount>=30);
 assert.equal(before.holdoutSampleCount,reversed.holdoutSampleCount);
 assert.equal(before.holdoutSampleCount,altered.holdoutSampleCount);
 assert.deepEqual(before.holdout,reversed.holdout);
 assert.deepEqual(before.development,reversed.development);
 for(const secret of ['heldout-sample-','declared-qa','baseline-v1','candidate-v2'])
  assert.ok(!JSON.stringify(before).includes(secret),secret);
 assert.equal(before.independentReviewerVerified,false);
 assert.equal(before.productionLearningCertified,false);
 assert.equal(before.paidModelRoutingAuthorized,false);
 assert.equal(before.businessActionAuthorized,false);
 assert.equal(before.productionModelChanged,false);
 assert.equal(before.liveRollbackExecuted,false);
});
test('A05 sustained held-out improvement can only recommend further SHADOW evaluation',async()=>{
 const r=await assessJarvisA05ShadowHoldout(batch());
 assert.equal(r.holdout.candidate.accuracy,1);
 assert.equal(r.holdout.baseline.accuracy,0);
 assert.equal(r.holdout.regressions,0);
 assert.ok(r.holdout.improvements>=10);
 assert.equal(r.reversionDecision,'CONTINUE_SHADOW_ONLY');
 assert.equal(r.reason,'DESCRIPTIVE_HOLDOUT_IMPROVEMENT_UNVERIFIED');
 assert.equal(r.holdout.candidate.unsupportedClaims,0);
 assert.equal(r.holdout.candidate.overconfidentErrors,0);
 assert.equal(r.productionModelChanged,false);
 assert.equal(r.autoPromotionAuthorized,false);
 assert.equal(r.autoRollbackAuthorized,false);
 assert.equal(r.liveRollbackExecuted,false);
 assert.ok(r.holds.includes('INDEPENDENT_HELDOUT_SOURCE_PROOF_REQUIRED'));
});
test('A05 regressions cause automatic fail-closed recommendation to retain baseline, NOT a production rollback',async()=>{
 const r=await assessJarvisA05ShadowHoldout(batch(100,true,false));
 assert.equal(r.reversionDecision,'RETAIN_BASELINE_REVERT_CANDIDATE_IF_ALREADY_TESTING');
 assert.ok(r.holdout.regressions>0);
 assert.equal(r.holdout.improvements,0);
 assert.equal(r.status,'HOLD');
 assert.equal(r.liveRollbackExecuted,false);
 assert.equal(r.productionModelChanged,false);
 assert.equal(r.productionWriteAuthorized,false);
 assert.ok(r.holds.includes('HELDOUT_PAIRED_REGRESSIONS'));
});
test('A05 individual harmful regressions cannot hide behind aggregate gains',async()=>{
 const b=batch(100,false,true);
 // Any baseline-correct candidate-wrong outcome is a paired regression.
 // Setting all baseline outcomes true guarantees regression on heldout sample(s).
 b.pairs[5].baseline.correct=true;
 b.pairs[5].baseline.confidence=0.95;
 const a=await assessJarvisA05ShadowHoldout(b);
 // If sample 5 isn't held out, aggregate training evidence alone must not
 // falsely claim an independently locked holdout or production acceptance.
 assert.equal(a.holdoutIndependentlyLocked,false);
 assert.equal(a.productionLearningCertified,false);
 const full=await assessJarvisA05ShadowHoldout(batch(100,true,false));
 assert.equal(full.reversionDecision,'RETAIN_BASELINE_REVERT_CANDIDATE_IF_ALREADY_TESTING');
});
test('A05 empty or undersized heldout cannot recommend promotion despite perfect candidate metrics',async()=>{
 for(const n of [0,4,19,20,35]){
  const r=await assessJarvisA05ShadowHoldout(batch(n));
  assert.equal(r.status,'HOLD');
  assert.equal(r.reversionDecision,'RETAIN_BASELINE');
  assert.ok(r.holds.includes('MINIMUM_DEVELOPMENT_AND_HELDOUT_SAMPLES_REQUIRED'));
  assert.equal(r.autoPromotionAuthorized,false);
 }
});
test('A05 safety regressions, unsupported claims and overconfidence force baseline retention',async()=>{
 const b=batch(100,false,true);
 b.pairs=b.pairs.map(x=>({...x,candidate:{...x.candidate,correct:false,confidence:.99,unsupportedClaims:1}}));
 const r=await assessJarvisA05ShadowHoldout(b);
 assert.equal(r.reversionDecision,'RETAIN_BASELINE_REVERT_CANDIDATE_IF_ALREADY_TESTING');
 assert.ok(r.holdout.safetyRegressions>0);
 assert.ok(r.holds.includes('HELDOUT_SAFETY_REGRESSION'));
 assert.equal(r.businessActionAuthorized,false);
});
test('A05 cannot certify synthetic, client-declared or malformed reviews as production learning',async()=>{
 const r=await assessJarvisA05ShadowHoldout(batch(100,false,true,'SYNTHETIC_ONLY'));
 assert.equal(r.status,'HOLD');
 assert.ok(r.holds.includes('SYNTHETIC_RESULTS_NOT_PRODUCTION_EVIDENCE'));
 assert.equal(r.productionLearningCertified,false);
 await assert.rejects(()=>assessJarvisA05ShadowHoldout({...batch(),adminOverride:true}),
  /JARVIS_EVALUATION_INVALID/);
 await assert.rejects(()=>assessJarvisA05ShadowHoldout({...batch(),pairs:[
  {...pair(0),rawTranscript:'PRIVATE_PASSWORD'}]}),/JARVIS_EVALUATION_INVALID/);
 await assert.rejects(()=>assessJarvisA05ShadowHoldout({...batch(),pairs:[pair(0),pair(0)]}),
  /JARVIS_EVALUATION_INVALID/);
});
