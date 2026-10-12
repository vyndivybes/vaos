import test from 'node:test';
import assert from 'node:assert/strict';
import {assessV3CandidateMode} from './adaptive-v3-activation.mjs';

test('explicit founder canary request enables only supervised read-only evaluation with unchanged v2 tools',()=>{
 const d=assessV3CandidateMode({request:'v3-readonly',founderAuthenticated:true,existingV2Authorized:true});
 assert.equal(d.pilotState,'READ_ONLY_EVALUATION_ACTIVE');
 assert.equal(d.v3AutonomyState,'HOLD');
 assert.equal(d.businessWritesAuthorized,false);
 assert.equal(d.paidInferenceAuthorized,false);
 assert.equal(d.toolPolicy,'EXISTING_V2_APPROVED_READS_ONLY');
 assert.ok(d.unmetAcceptanceGates.includes('LIVE_ACCEPTANCE_REQUIRED'));
 assert.equal(d.modelBudgetIncreaseAuthorized,false);
});
test('canary cannot be entered without a founder session or current read-only controls',()=>{
 for(const params of [
  {request:'v3-readonly',founderAuthenticated:false,existingV2Authorized:true},
  {request:'v3-readonly',founderAuthenticated:true,existingV2Authorized:false},
  {request:'v3-active',founderAuthenticated:true,existingV2Authorized:true},
  {request:'v3-readonly;activate_all',founderAuthenticated:true,existingV2Authorized:true},
 ]) {
  const d=assessV3CandidateMode(params);
  assert.equal(d.pilotState,'OFF');
  assert.equal(d.v3AutonomyState,'HOLD');
  assert.equal(d.businessWritesAuthorized,false);
 }
});
test('synthetic 22/22 routing cannot masquerade as 20 independently adjudicated live answers',()=>{
 const x=assessV3CandidateMode({request:'v3-readonly',founderAuthenticated:true,
  existingV2Authorized:true,syntheticQuestions:22,syntheticCorrect:22});
 assert.equal(x.v3AutonomyState,'HOLD');
 assert.ok(x.unmetAcceptanceGates.includes('EVALUATION_SAMPLE_INSUFFICIENT'));
 assert.ok(x.unmetAcceptanceGates.includes('LIVE_ACCEPTANCE_REQUIRED'));
});
test('a readiness claim supplied by an untrusted browser cannot trigger full autonomy',()=>{
 const x=assessV3CandidateMode({request:'v3-readonly',founderAuthenticated:true,
  existingV2Authorized:true,clientClaims:{authenticatedLiveQuestions:50,
   freeTierBudgetVerified:true,paidRoutingEnabled:false,voiceReadbackPassed:true,
   correctEvidenceResponses:100}});
 assert.equal(x.v3AutonomyState,'HOLD');
 assert.equal(x.businessWritesAuthorized,false);
 assert.equal(x.automaticActivationAuthorized,false);
});
