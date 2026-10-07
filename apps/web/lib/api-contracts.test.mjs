import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIntentRequest, validateApprovalDecision } from './api-contracts.mjs';

test('intent API requires client-stable idempotency key and valid intent body', () => {
  assert.equal(validateIntentRequest({
    idempotencyKey: '',
    body: { agentId: 'qa', actionType: 'QA.OPEN_CAPA', risk: 'medium', reason: 'x', payload: {} },
  }).ok, false);

  assert.equal(validateIntentRequest({
    idempotencyKey: 'qa:capa:024',
    body: { agentId: 'qa', actionType: 'QA.OPEN_CAPA', risk: 'medium', reason: 'Recurring NCR', payload: {} },
  }).ok, true);
});

test('approval API accepts only APPROVED or REJECTED', () => {
  assert.equal(validateApprovalDecision({ approvalId: 'apr-1', decision: 'APPROVED' }).ok, true);
  assert.equal(validateApprovalDecision({ approvalId: 'apr-1', decision: 'maybe' }).ok, false);
});


test('intent API validates governed digital-thread link payloads at the boundary', () => {
  const valid = validateIntentRequest({
    idempotencyKey: 'digital-thread:intent:1',
    body: {
      agentId: 'knowledge',
      actionType: 'DIGITAL_THREAD.CREATE_LINK',
      risk: 'medium',
      reason: 'CAPA requires engineering baseline change',
      payload: {
        sourceDomain: 'QA_CAPA',
        sourceRecordId: '6ee7b7d0-8694-47fb-a00c-b3540bb380db',
        relationType: 'DRIVES_CHANGE',
        targetDomain: 'ENGINEERING_BASELINE',
        targetRecordId: 'b51465ef-2777-4e48-90f8-92ad7943317e',
      },
    },
  });
  assert.equal(valid.ok, true);

  const invalidRelation = validateIntentRequest({
    idempotencyKey: 'digital-thread:intent:2',
    body: {
      agentId: 'knowledge',
      actionType: 'DIGITAL_THREAD.CREATE_LINK',
      risk: 'medium',
      reason: 'invalid relation',
      payload: {
        sourceDomain: 'QA_CAPA',
        sourceRecordId: '6ee7b7d0-8694-47fb-a00c-b3540bb380db',
        relationType: 'INVENTED_LINK',
        targetDomain: 'ENGINEERING_BASELINE',
        targetRecordId: 'b51465ef-2777-4e48-90f8-92ad7943317e',
      },
    },
  });
  assert.equal(invalidRelation.ok, false);
  assert.ok(invalidRelation.errors.includes('INVALID_DIGITAL_THREAD_RELATION'));

  const selfLink = validateIntentRequest({
    idempotencyKey: 'digital-thread:intent:3',
    body: {
      agentId: 'knowledge',
      actionType: 'DIGITAL_THREAD.CREATE_LINK',
      risk: 'medium',
      reason: 'self link',
      payload: {
        sourceDomain: 'QA_CAPA',
        sourceRecordId: '6ee7b7d0-8694-47fb-a00c-b3540bb380db',
        relationType: 'RELATED_TO',
        targetDomain: 'QA_CAPA',
        targetRecordId: '6ee7b7d0-8694-47fb-a00c-b3540bb380db',
      },
    },
  });
  assert.equal(selfLink.ok, false);
  assert.ok(selfLink.errors.includes('DIGITAL_THREAD_SELF_LINK_DENIED'));
});


test('Digital Workforce qualification payload requires employee, Q-level and explicit evidence references', () => {
  const valid = validateIntentRequest({
    idempotencyKey: 'workforce:vibpe:qualify:1',
    body: {
      agentId: 'orchestrator',
      actionType: 'WORKFORCE.QUALIFY',
      risk: 'high',
      reason: 'Qualification evidence reviewed',
      payload: {
        employeeId: 'vibpe',
        qualificationLevel: 3,
        evidenceRefs: ['evidence:benchmark:vibpe:1'],
      },
    },
  });
  assert.equal(valid.ok, true);

  const noEvidence = validateIntentRequest({
    idempotencyKey: 'workforce:vibpe:qualify:2',
    body: {
      agentId: 'orchestrator',
      actionType: 'WORKFORCE.QUALIFY',
      risk: 'high',
      reason: 'Qualification without evidence',
      payload: { employeeId: 'vibpe', qualificationLevel: 3, evidenceRefs: [] },
    },
  });
  assert.equal(noEvidence.ok, false);
  assert.ok(noEvidence.errors.includes('QUALIFICATION_EVIDENCE_REQUIRED'));
});

test('unknown WORKFORCE actions fail closed at the API boundary', () => {
  const result = validateIntentRequest({
    idempotencyKey: 'workforce:invented:1',
    body: {
      agentId: 'orchestrator',
      actionType: 'WORKFORCE.INVENTED',
      risk: 'medium',
      reason: 'Should fail closed',
      payload: { employeeId: 'vibpe' },
    },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('INVALID_WORKFORCE_ACTION'));
});


test('Digital Workforce assessment payload requires a bounded Q-level and named profile', () => {
  const valid = validateIntentRequest({
    idempotencyKey: 'workforce:vibpe:assessment:1',
    body: {
      agentId: 'orchestrator',
      actionType: 'WORKFORCE.ASSESS_QUALIFICATION',
      risk: 'high',
      reason: 'Run VIBPE Q3 assessment',
      payload: {
        employeeId: 'vibpe',
        targetLevel: 3,
        profileId: 'VIBPE_Q3_ENGINEERING_BASELINE_GOVERNANCE_V1',
      },
    },
  });
  assert.equal(valid.ok, true);

  const invalid = validateIntentRequest({
    idempotencyKey: 'workforce:vibpe:assessment:2',
    body: {
      agentId: 'orchestrator',
      actionType: 'WORKFORCE.ASSESS_QUALIFICATION',
      risk: 'high',
      reason: 'Invalid assessment',
      payload: { employeeId: 'vibpe', targetLevel: 5, profileId: 'bad profile' },
    },
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.includes('INVALID_QUALIFICATION_LEVEL'));
  assert.ok(invalid.errors.includes('INVALID_QUALIFICATION_PROFILE'));
});
