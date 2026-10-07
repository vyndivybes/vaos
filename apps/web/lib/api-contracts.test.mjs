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
