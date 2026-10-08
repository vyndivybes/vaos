import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGovernedHandoff,
  transitionGovernedHandoff,
  HANDOFF_OUTCOME,
} from './vaos-eight-operating-model.mjs';

function acceptedHandoff(actionType = 'ENGINEERING.ASSESS_REQUIREMENT', recipient = 'vibpe') {
  const draft = createGovernedHandoff({
    id: 'hnd-verification-001',
    missionId: 'mission-verification-001',
    workPackageId: 'wp-verification-001',
    fromAgentId: 'orchestrator',
    toAgentId: recipient,
    requestedJob: actionType,
    reason: 'Independent verification required',
    requiredOutcome: 'Verified evidence-backed assessment',
    acceptanceCriteria: ['source trace', 'independent review'],
  });
  return transitionGovernedHandoff(draft, {
    outcome: HANDOFF_OUTCOME.ACCEPT,
    byAgentId: recipient,
  });
}

test('recipient can submit outcome evidence but cannot self-complete its handoff', () => {
  const accepted = acceptedHandoff();
  assert.throws(
    () => transitionGovernedHandoff(accepted, {
      outcome: HANDOFF_OUTCOME.COMPLETE,
      byAgentId: 'vibpe',
      evidenceRefs: ['SELF-ASSERTED'],
    }),
    /HANDOFF_TRANSITION_INVALID/,
  );
  assert.throws(
    () => transitionGovernedHandoff(accepted, {
      outcome: HANDOFF_OUTCOME.SUBMIT,
      byAgentId: 'vibpe',
    }),
    /HANDOFF_SUBMISSION_EVIDENCE_REQUIRED/,
  );
  const submitted = transitionGovernedHandoff(accepted, {
    outcome: HANDOFF_OUTCOME.SUBMIT,
    byAgentId: 'vibpe',
    evidenceRefs: ['ENG-ASSESS-001'],
  });
  assert.equal(submitted.status, 'SUBMITTED');
  assert.deepEqual(submitted.evidenceRefs, ['ENG-ASSESS-001']);
});

test('independent qualified verifier must issue an evidence-backed VERIFY decision', () => {
  const submitted = transitionGovernedHandoff(acceptedHandoff(), {
    outcome: HANDOFF_OUTCOME.SUBMIT,
    byAgentId: 'vibpe',
    evidenceRefs: ['ENG-ASSESS-001'],
  });
  assert.throws(() => transitionGovernedHandoff(submitted, {
    outcome: HANDOFF_OUTCOME.VERIFY, byAgentId: 'vibpe', evidenceRefs: ['SELF-CHECK'],
  }), /HANDOFF_VERIFIER_NOT_AUTHORIZED/);
  assert.throws(() => transitionGovernedHandoff(submitted, {
    outcome: HANDOFF_OUTCOME.VERIFY, byAgentId: 'qa',
  }), /HANDOFF_VERIFICATION_EVIDENCE_REQUIRED/);

  const verified = transitionGovernedHandoff(submitted, {
    outcome: HANDOFF_OUTCOME.VERIFY,
    byAgentId: 'qa',
    evidenceRefs: ['QA-VERIFY-001'],
  });
  assert.equal(verified.status, 'COMPLETED');
  assert.equal(verified.verifiedByAgentId, 'qa');
  assert.deepEqual(verified.evidenceRefs, ['ENG-ASSESS-001', 'QA-VERIFY-001']);
  assert.throws(() => transitionGovernedHandoff(verified, {
    outcome: HANDOFF_OUTCOME.VERIFY, byAgentId: 'qa', evidenceRefs: ['RETRY'],
  }), /HANDOFF_TRANSITION_INVALID/);
});

test('verifier can reject submitted evidence and return for correction', () => {
  const submitted = transitionGovernedHandoff(acceptedHandoff(), {
    outcome: HANDOFF_OUTCOME.SUBMIT,
    byAgentId: 'vibpe',
    evidenceRefs: ['ENG-ASSESS-001'],
  });
  const returned = transitionGovernedHandoff(submitted, {
    outcome: HANDOFF_OUTCOME.REJECT_VERIFICATION,
    byAgentId: 'qa',
    reason: 'Impact evidence incomplete',
  });
  assert.equal(returned.status, 'RETURNED');
  assert.equal(returned.history.at(-1).byAgentId, 'qa');
});

test('Release recommendations must also receive independent verification', () => {
  const accepted = acceptedHandoff('RELEASE.ASSESS_GATE', 'release');
  const submitted = transitionGovernedHandoff(accepted, {
    outcome: HANDOFF_OUTCOME.SUBMIT,
    byAgentId: 'release',
    evidenceRefs: ['REL-RECOMMEND-001'],
  });
  assert.throws(() => transitionGovernedHandoff(submitted, {
    outcome: HANDOFF_OUTCOME.VERIFY, byAgentId: 'release', evidenceRefs: ['SELF-VERIFY'],
  }), /HANDOFF_VERIFIER_NOT_AUTHORIZED/);
  assert.equal(transitionGovernedHandoff(submitted, {
    outcome: HANDOFF_OUTCOME.VERIFY,
    byAgentId: 'knowledge',
    evidenceRefs: ['REL-REVIEW-001'],
  }).status, 'COMPLETED');
});
