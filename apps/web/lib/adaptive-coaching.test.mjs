import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCoachingInstructions,buildCoachingAssessment} from './adaptive-coaching.mjs';

test('review guidance trains the planning discipline to select only real read-only evidence without invented capabilities',()=>{
 const text=buildCoachingInstructions('plan');
 assert.match(text,/compare|identify/i);
 assert.match(text,/read-only/i);
 assert.match(text,/unsupported|unavailable/i);
 assert.match(text,/question/i);
 assert.doesNotMatch(text,/execute payment|approve procurement|train weights/i);
});
test('review guidance trains the analyst on facts, hypotheses, limitations and best bounded action',()=>{
 const text=buildCoachingInstructions('analyze');
 assert.match(text,/observed|evidence/i);
 assert.match(text,/assumption|hypothes/i);
 assert.match(text,/recommend|next step/i);
 assert.match(text,/qualif|hold|uncertain/i);
 assert.doesNotMatch(text,/always claim|never disclose uncertainty/i);
});
test('unknown training stages cannot inject executable instructions into the model',()=>{
 assert.throws(()=>buildCoachingInstructions('execute'),/INVALID/);
 assert.throws(()=>buildCoachingInstructions('../secrets'),/INVALID/);
});
test('mentor-quality assessment refuses to certify answers from tests, fabricated scores or absent live reviews',()=>{
 const r=buildCoachingAssessment({syntheticPasses:22,syntheticCases:22,
  independentlyReviewedQuestions:0,evidenceCorrectQuestions:0,liveSamples:0});
 assert.equal(r.status,'TRAINING_REVIEW_OPEN');
 assert.equal(r.modelFineTuned,false);
 assert.equal(r.liveAccuracyQualified,false);
 assert.equal(r.evaluationPass,false);
});
test('coach does not claim real-world qualification even after strong review unless live data, zero invented facts and human signoff exist',()=>{
 const r=buildCoachingAssessment({syntheticPasses:22,syntheticCases:22,
  independentlyReviewedQuestions:20,evidenceCorrectQuestions:19,
  liveSamples:10,sourceLinkedLiveAnswers:10,unsupportedClaims:0,
  humanSignoff:false});
 assert.equal(r.status,'TRAINING_REVIEW_OPEN');
 assert.equal(r.evaluationPass,false);
 assert.ok(r.holds.includes('HUMAN_SIGNOFF_REQUIRED'));
});
test('all required independently reviewed evidence can qualify coaching without authorizing any actions',()=>{
 const r=buildCoachingAssessment({independentlyReviewedQuestions:20,
  evidenceCorrectQuestions:18,liveSamples:10,sourceLinkedLiveAnswers:9,
  unsupportedClaims:0,humanSignoff:true});
 assert.equal(r.status,'COACHING_EVALUATION_QUALIFIED');
 assert.equal(r.evaluationPass,true);
 assert.equal(r.actionAuthorized,false);
 assert.equal(r.modelFineTuned,false);
});
