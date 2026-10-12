import test from 'node:test';
import assert from 'node:assert/strict';
import {assessUpgradeReadiness,summarizeAdaptiveDiagnostics} from './adaptive-upgrade-readiness.mjs';

const sufficient={
 verifiedDeployment:true,readOnlyControlsPassed:true,
 evaluatedQuestions:20,correctEvidenceResponses:18,unsupportedClaims:0,
 authenticatedLiveQuestions:10,sourceLinkedAnswers:9,
 latencyP95Ms:7500,freeTierBudgetVerified:true,paidRoutingEnabled:false,
 voiceReadbackPassed:true,
};
test('v3 upgrade can be prepared but never self-activate without explicit final commissioning evidence',()=>{
 const result=assessUpgradeReadiness(sufficient);
 assert.equal(result.state,'READY_FOR_HUMAN_APPROVAL');
 assert.equal(result.autoActivationAuthorized,false);
 assert.equal(result.paidProvidersAuthorized,false);
 assert.equal(result.eligibleForAutomaticWrites,false);
 assert.deepEqual(result.holds,[]);
});
test('v3 upgrade remains HOLD if performance, live evidence or free-only policy is unknown',()=>{
 const report=assessUpgradeReadiness({verifiedDeployment:true,evaluatedQuestions:20,correctEvidenceResponses:20});
 assert.equal(report.state,'HOLD');
 for(const code of ['LIVE_ACCEPTANCE_REQUIRED','LATENCY_UNQUALIFIED','INFERENCE_BUDGET_UNVERIFIED','READ_ONLY_POLICY_UNVERIFIED'])
  assert.ok(report.holds.includes(code));
});
test('v3 upgrade fails accuracy and source citation gates using integer numerators, no percentages asserted from thin air',()=>{
 const report=assessUpgradeReadiness({...sufficient,correctEvidenceResponses:14,sourceLinkedAnswers:6});
 assert.equal(report.state,'HOLD');
 assert.ok(report.holds.includes('EVIDENCE_ACCURACY_BELOW_GATE'));
 assert.ok(report.holds.includes('SOURCE_COVERAGE_BELOW_GATE'));
});
test('v3 upgrade is held on unsafe model claims, enabling billing or future business writes',()=>{
 const report=assessUpgradeReadiness({...sufficient,unsupportedClaims:1,paidRoutingEnabled:true});
 assert.equal(report.state,'HOLD');
 assert.ok(report.holds.includes('UNSUPPORTED_CLAIM_DETECTED'));
 assert.ok(report.holds.includes('PAID_ROUTING_NOT_AUTHORIZED'));
});
test('v3 upgrade requires observations on at least 20 novel questions, with minimum 10 authenticated responses',()=>{
 const report=assessUpgradeReadiness({...sufficient,evaluatedQuestions:8,authenticatedLiveQuestions:3});
 assert.equal(report.state,'HOLD');
 assert.ok(report.holds.includes('EVALUATION_SAMPLE_INSUFFICIENT'));
 assert.ok(report.holds.includes('LIVE_ACCEPTANCE_REQUIRED'));
});
test('v3 diagnostics sanitize runtime values and report transparent deterministic fallback',()=>{
 const diagnostics=summarizeAdaptiveDiagnostics({
  elapsedMs:8200,planningMode:'RULE_FALLBACK',reasoningMode:'DETERMINISTIC_EVIDENCE',
  modelCalls:0,observed:1,requested:3,
  fallbackReason:'BUDGET_EXHAUSTED',verificationStatus:'NOT_MODEL_VERIFIED',
 });
 assert.equal(diagnostics.elapsedMs,8200);
 assert.equal(diagnostics.modelAvailability,'BUDGET_EXHAUSTED');
 assert.equal(diagnostics.evidenceCoverage,'PARTIAL');
 assert.equal(diagnostics.requiresQualification,true);
 assert.equal(diagnostics.freeOnly,true);
 assert.equal(diagnostics.actionAuthorized,false);
 assert.ok(!JSON.stringify(diagnostics).includes('secret'));
});
test('v3 diagnostic cannot expose unknown diagnostic strings or claim unaudited model result',()=>{
 const result=summarizeAdaptiveDiagnostics({elapsedMs:-40,
  planningMode:'mischief',reasoningMode:'MODEL_VERIFIED',
  modelCalls:999,fallbackReason:'api_key_live_abc',observed:8,requested:2,
  verificationStatus:'BOUNDED_CONSISTENCY_PASS'});
 assert.equal(result.elapsedMs,null);
 assert.equal(result.modelAvailability,'UNVERIFIED');
 assert.equal(result.reasoningMode,'UNVERIFIED');
 assert.equal(result.evidenceCoverage,'UNVERIFIED');
 assert.equal(result.modelCalls,null);
});
