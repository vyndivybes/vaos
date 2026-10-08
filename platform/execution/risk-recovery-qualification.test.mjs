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

test('second recovery attempt creates a governed Risk to Engineering trace when explicitly requested', async () => {
  const calls = [];
  const projectRisk = {
    async escalateRisk(job, input) {
      calls.push({ operation: 'escalate', job, input });
      return { outcome: 'CREATED', record: { riskId: input.riskId, status: 'ESCALATED', executionJobId: job.id, intentId: job.intentId } };
    },
    async getRiskEscalation(job, riskId) {
      calls.push({ operation: 'read', job, riskId });
      return { riskId, status: 'ESCALATED', executionJobId: job.id, intentId: job.intentId };
    },
    async linkQualificationTrace(job, input) {
      calls.push({ operation: 'link', job, input });
      return {
        outcome: 'CREATED',
        link: {
          id: 'link-risk-q3',
          sourceDomain: 'PROJECT_RISK',
          targetDomain: input.targetDomain,
          targetResourceId: input.targetResourceId,
          relationType: input.relationType,
          executionJobId: job.id,
          intentId: job.intentId,
        },
      };
    },
  };

  const result = await createExecutionAdapterRegistry({ projectRisk }).get('PROJECT.ESCALATE_RISK').execute({
    id: 'job-3',
    intentId: 'intent-3',
    actionType: 'PROJECT.ESCALATE_RISK',
    attemptCount: 2,
    payload: {
      riskId: 'RSK-015',
      qualificationMode: true,
      qualificationRecoveryDrill: true,
      qualificationTrace: {
        targetDomain: 'ENGINEERING_BASELINE',
        targetResourceId: '5.3.9',
        relationType: 'MITIGATES_RISK',
      },
    },
  });

  assert.equal(result.effect.qualificationTraceLinkId, 'link-risk-q3');
  assert.deepEqual(calls.map((call) => call.operation), ['escalate', 'read', 'link']);
});

