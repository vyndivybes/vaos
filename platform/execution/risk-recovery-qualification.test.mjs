import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecutionAdapterRegistry } from './adapter-registry.mjs';

test('qualification recovery mode requests one retry on first execution attempt', async () => {
  let touched = false;
  const projectRisk = {
    async escalateRisk() { touched = true; },
    async getRiskEscalation() { touched = true; },
  };
  const adapter = createExecutionAdapterRegistry({ projectRisk }).get('PROJECT.ESCALATE_RISK');

  await assert.rejects(
    () => adapter.execute({
      id: 'job-1',
      intentId: 'intent-1',
      actionType: 'PROJECT.ESCALATE_RISK',
      attemptCount: 1,
      payload: { riskId: 'RSK-015', qualificationMode: true, qualificationRecoveryDrill: true },
    }),
    (error) => error?.code === 'QUALIFICATION_RECOVERY_DRILL_RETRY' && error?.retryable === true,
  );
  assert.equal(touched, false);
});

test('qualification recovery mode executes normally after the retry', async () => {
  const projectRisk = {
    async escalateRisk(job, input) {
      return { outcome: 'CREATED', record: { riskId: input.riskId, status: 'ESCALATED', executionJobId: job.id, intentId: job.intentId } };
    },
    async getRiskEscalation(job, riskId) {
      return { riskId, status: 'ESCALATED', executionJobId: job.id, intentId: job.intentId };
    },
  };
  const adapter = createExecutionAdapterRegistry({ projectRisk }).get('PROJECT.ESCALATE_RISK');
  const result = await adapter.execute({
    id: 'job-2',
    intentId: 'intent-2',
    actionType: 'PROJECT.ESCALATE_RISK',
    attemptCount: 2,
    payload: { riskId: 'RSK-015', qualificationMode: true, qualificationRecoveryDrill: true },
  });
  assert.equal(result.verification.verified, true);
  assert.equal(result.verification.resourceId, 'RSK-015');
});
