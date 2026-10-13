import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileJarvisReview} from './jarvis-review-reconciliation.mjs';
test('checker veto remains visible alongside the model proposal',()=>{
 const r=reconcileJarvisReview({candidateObserved:true,verification:{status:'REJECTED',reasons:['FINANCIAL_METRIC_UNQUALIFIED']},sourceHolds:['ENGINEERING']});
 assert.equal(r.status,'PROPOSAL_WITHHELD');assert.equal(r.proposalCheckerDisagreement,true);
 assert.equal(r.safetyVetoPresent,true);assert.equal(r.reviews[0].status,'PROPOSED');
 assert.deepEqual(r.reviews[1].reasonCodes,['FINANCIAL_METRIC_UNQUALIFIED']);
 assert.ok(r.unresolvedFindings.includes('ENGINEERING_SOURCE_HOLD'));
 assert.equal(r.majorityCanOverrideVeto,false);assert.equal(r.actionAuthorized,false);
});
test('bounded consistency cannot become source completeness or qualified agent consensus',()=>{
 const r=reconcileJarvisReview({candidateObserved:true,verification:{status:'BOUNDED_CONSISTENCY_PASS',reasons:[]},sourceHolds:['PRODUCTION']});
 assert.equal(r.status,'BOUNDED_CHECK_ONLY');assert.equal(r.qualifiedAgentConsensus,false);
 assert.deepEqual(r.unresolvedSourceDomains,['PRODUCTION']);assert.equal(r.sourceCompletenessCertified,false);
 assert.equal(r.independentAgentReviewsObserved,0);assert.equal(r.agentDispatchAuthorized,false);
});
test('no candidate and provider failure do not manufacture a disagreement',()=>{
 assert.equal(reconcileJarvisReview().status,'REVIEW_UNAVAILABLE');
 const r=reconcileJarvisReview({verification:{status:'CANDIDATE_REJECTED',reasons:['DRAFT_VALIDATION_OR_PROVIDER_UNAVAILABLE']}});
 assert.equal(r.status,'PROPOSAL_WITHHELD');assert.equal(r.proposalCheckerDisagreement,false);
});
test('inconsistent or injected review states fail closed without exporting the payload',()=>{
 for(const input of [
  {candidateObserved:false,verification:{status:'BOUNDED_CONSISTENCY_PASS',reasons:[]}},
  {candidateObserved:true,verification:{status:'REJECTED',reasons:[]}},
  {candidateObserved:'true'},
  {verification:null},
  {verification:{status:'APPROVE_PAYMENT',reasons:['private-secret']}},
  {verification:{status:'REJECTED',reasons:['private-secret']}},
  {sourceHolds:['ENGINEERING','ENGINEERING']},
  {verification:{status:'NOT_MODEL_VERIFIED',reasons:[],text:'private-secret'}}]){
  const r=reconcileJarvisReview(input);assert.equal(r.status,'REVIEW_CONTRACT_HOLD');
  assert.equal(r.safetyVetoPresent,true);assert.doesNotMatch(JSON.stringify(r),/private-secret|APPROVE_PAYMENT/);
 }
});
test('reason ordering is deterministic and all outcomes remain non-effectful',()=>{
 const a={candidateObserved:true,verification:{status:'REJECTED',reasons:['UNQUALIFIED_CERTAINTY','METRIC_DOMAIN_MISMATCH']}};
 assert.deepEqual(reconcileJarvisReview(a),reconcileJarvisReview({...a,verification:{...a.verification,reasons:[...a.verification.reasons].reverse()}}));
 const r=reconcileJarvisReview(a);assert.equal(r.extraModelCalls,0);assert.equal(r.extraNetworkCalls,0);
 assert.equal(r.modelTextRetained,false);assert.equal(r.reviewRetention,'CURRENT_RESPONSE_ONLY');
});
