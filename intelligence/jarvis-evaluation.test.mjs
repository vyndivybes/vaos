import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateJarvisPairs} from './jarvis-evaluation.mjs';
const result=(subjectId,confidence,correct,latencyMs=100)=>({subjectId,confidence,correct,unsupportedClaims:0,latencyMs});
const pair=(sampleId,baseline,candidate)=>({sampleId,reviewerId:'reviewer',baseline,candidate});
const batch=pairs=>({mode:'SYNTHETIC_ONLY',pairs});
test('Brier and calibration error agree with independent four-outcome calculation',()=>{
 const r=evaluateJarvisPairs(batch([
  pair('q1',result('base',0.5,true),result('next',0.8,true,400)),
  pair('q2',result('base',0.5,false),result('next',0.8,false,100)),
  pair('q3',result('base',0.5,true),result('next',0.2,true,300)),
  pair('q4',result('base',0.5,false),result('next',0.2,false,200))]));
 assert.ok(Math.abs(r.candidate.brierScore-0.34)<1e-12);
 assert.ok(Math.abs(r.candidate.expectedCalibrationError-0.3)<1e-12);
 assert.equal(r.baseline.brierScore,0.25);assert.equal(r.baseline.expectedCalibrationError,0);
 assert.equal(r.candidate.latencyP95Ms,400);assert.equal(r.candidate.overconfidentErrors,1);
});
test('paired regressions remain visible even when aggregate accuracy is unchanged',()=>{
 const r=evaluateJarvisPairs(batch([
  pair('q1',result('base',1,true),result('next',1,false)),
  pair('q2',result('base',0,false),result('next',1,true))]));
 assert.equal(r.regressions,1);assert.equal(r.improvements,1);
 assert.ok(r.holds.includes('PAIRED_REGRESSION_OBSERVED'));
});
test('twenty perfect declared reviews still cannot certify independence or activate a model',()=>{
 const r=evaluateJarvisPairs({mode:'DECLARED_REVIEW_RESULTS',pairs:Array.from({length:20},(_,i)=>
  pair('private-q'+i,result('private-base',1,true),result('private-next',1,true)))});
 assert.equal(r.candidate.brierScore,0);assert.equal(r.candidate.accuracy,1);
 assert.equal(r.autoPromotionAuthorized,false);assert.equal(r.confidenceCalibrationCertified,false);
 assert.equal(r.reviewerIndependenceVerified,false);assert.equal(r.actionAuthorized,false);
 assert.ok(r.holds.includes('REVIEWER_PROVENANCE_UNVERIFIED'));
 assert.doesNotMatch(JSON.stringify(r),/private-|reviewerId|sampleId|subjectId/);
});
test('empty evaluation does not become zero-error evidence',()=>{
 const r=evaluateJarvisPairs(batch([]));assert.equal(r.candidate.accuracy,null);
 assert.equal(r.candidate.brierScore,null);assert.equal(r.candidate.latencyP95Ms,null);
 assert.ok(r.holds.includes('EVALUATION_SAMPLE_INSUFFICIENT'));
});
test('reject duplicate samples, self-review, unpaired subjects and unsafe fields',()=>{
 const p=pair('q1',result('base',0.5,true),result('next',0.5,true));
 for(const pairs of [[p,p],[{...p,reviewerId:'next'}],[{...p,reviewerId:null}],
  [{...p,sampleId:null}],[{...p,candidate:{...p.candidate,subjectId:null}}],
  [{...p,candidate:{...p.candidate,unsupportedClaims:1}}],[{...p,transcript:'secret'}],
  [{...p,candidate:{...p.candidate,confidence:NaN}}],
  [p,{...p,sampleId:'q2',candidate:{...p.candidate,subjectId:'other'}}]])
  assert.throws(()=>evaluateJarvisPairs(batch(pairs)),/JARVIS_EVALUATION_INVALID/);
 assert.throws(()=>evaluateJarvisPairs({...batch([p]),productionCertified:true}),/INVALID/);
});
test('certainty endpoints, unsupported claims and latency tails are handled explicitly',()=>{
 const r=evaluateJarvisPairs(batch(Array.from({length:20},(_,i)=>pair('q'+i,
  result('base',1,true),{...result('next',i===0?0:1,i!==0,i===19?10000:100),unsupportedClaims:i===0?1:0}))));
 assert.equal(r.candidate.latencyP95Ms,100);assert.equal(r.candidate.unsupportedClaims,1);
 assert.equal(r.safetyRegressions,1);assert.ok(r.holds.includes('UNSUPPORTED_CLAIMS_OBSERVED'));
});
