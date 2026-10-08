import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecutionAdapterRegistry } from './adapter-registry.mjs';

test('registry resolves only explicitly supported governed effects', () => {
  const registry = createExecutionAdapterRegistry();
  assert.equal(registry.has('QA.OPEN_CAPA'), true);
  assert.equal(registry.has('ENGINEERING.BASELINE_CHANGE'), true);
  assert.equal(registry.has('PROJECT.ESCALATE_RISK'), true);
  assert.equal(registry.has('DIGITAL_THREAD.CREATE_LINK'), true);
  assert.equal(registry.has('WORKFORCE.START_TRAINING'), true);
  assert.equal(registry.has('WORKFORCE.ASSESS_QUALIFICATION'), true);
  assert.equal(registry.has('WORKFORCE.QUALIFY'), true);
  assert.equal(registry.has('WORKFORCE.ACTIVATE'), true);
  assert.equal(registry.has('FINANCE.PAY_INVOICE'), false);
});

test('QA adapter persists a durable CAPA record and verifies it from the domain store', async () => {
  const calls = [];
  const qaCapa = {
    async openCapa(job, input) {
      calls.push({ operation: 'open', job, input });
      return {
        outcome: 'CREATED',
        record: {
          capaId: input.capaId,
          status: 'OPEN',
          executionJobId: job.id,
          intentId: job.intentId,
        },
      };
    },
    async getCapa(job, capaId) {
      calls.push({ operation: 'read', job, capaId });
      return {
        capaId,
        status: 'OPEN',
        executionJobId: job.id,
        intentId: job.intentId,
      };
    },
  };

  const registry = createExecutionAdapterRegistry({ qaCapa });
  const adapter = registry.get('QA.OPEN_CAPA');
  const result = await adapter.execute({
    id: 'job-1',
    intentId: 'intent-1',
    actionType: 'QA.OPEN_CAPA',
    payload: { capaId: 'CAPA-024' },
  });

  assert.equal(result.adapterId, 'supabase.qa-capa.v1');
  assert.deepEqual(result.effect, {
    effectType: 'QUALITY.CAPA_OPENED',
    resourceType: 'CAPA',
    resourceId: 'CAPA-024',
    state: 'OPEN',
    domainOutcome: 'CREATED',
  });
  assert.deepEqual(result.verification, {
    verified: true,
    resourceType: 'CAPA',
    resourceId: 'CAPA-024',
    expectedState: 'OPEN',
    evidenceSource: 'vaos_private.capa_records',
  });
  assert.deepEqual(calls.map((call) => call.operation), ['open', 'read']);
});

test('QA adapter treats a replayed domain write as the same verified CAPA effect', async () => {
  const qaCapa = {
    async openCapa(job, input) {
      return {
        outcome: 'REPLAY',
        record: { capaId: input.capaId, status: 'OPEN', executionJobId: job.id, intentId: job.intentId },
      };
    },
    async getCapa(job, capaId) {
      return { capaId, status: 'OPEN', executionJobId: job.id, intentId: job.intentId };
    },
  };

  const result = await createExecutionAdapterRegistry({ qaCapa }).get('QA.OPEN_CAPA').execute({
    id: 'job-2',
    intentId: 'intent-2',
    actionType: 'QA.OPEN_CAPA',
    payload: { capaId: 'CAPA-025' },
  });

  assert.equal(result.effect.domainOutcome, 'REPLAY');
  assert.equal(result.verification.verified, true);
});

test('QA adapter fails closed when no durable QA/CAPA domain port is configured', async () => {
  const adapter = createExecutionAdapterRegistry().get('QA.OPEN_CAPA');
  await assert.rejects(
    () => adapter.execute({
      id: 'job-1',
      intentId: 'intent-1',
      actionType: 'QA.OPEN_CAPA',
      payload: { capaId: 'CAPA-024' },
    }),
    /DOMAIN_PORT_REQUIRED:qaCapa/,
  );
});

test('QA adapter rejects a mismatched durable readback instead of fabricating verification', async () => {
  const qaCapa = {
    async openCapa(job, input) {
      return {
        outcome: 'CREATED',
        record: { capaId: input.capaId, status: 'OPEN', executionJobId: job.id, intentId: job.intentId },
      };
    },
    async getCapa(job, capaId) {
      return { capaId, status: 'CLOSED', executionJobId: job.id, intentId: job.intentId };
    },
  };

  const adapter = createExecutionAdapterRegistry({ qaCapa }).get('QA.OPEN_CAPA');
  await assert.rejects(
    () => adapter.execute({
      id: 'job-3',
      intentId: 'intent-3',
      actionType: 'QA.OPEN_CAPA',
      payload: { capaId: 'CAPA-026' },
    }),
    /CAPA_VERIFICATION_MISMATCH/,
  );
});

test('QA adapter refuses malformed payload before touching the domain store', async () => {
  let touched = false;
  const qaCapa = {
    async openCapa() { touched = true; },
    async getCapa() { touched = true; },
  };
  const adapter = createExecutionAdapterRegistry({ qaCapa }).get('QA.OPEN_CAPA');
  await assert.rejects(
    () => adapter.execute({ id: 'job-1', intentId: 'intent-1', actionType: 'QA.OPEN_CAPA', payload: {} }),
    /ADAPTER_PAYLOAD_INVALID:capaId/,
  );
  assert.equal(touched, false);
});


test('Engineering adapter persists a durable baseline-change record and verifies it from the domain store', async () => {
  const calls = [];
  const engineeringChange = {
    async recordBaselineChange(job, input) {
      calls.push({ operation: 'record', job, input });
      return {
        outcome: 'CREATED',
        record: {
          baseline: input.baseline,
          status: 'CHANGE_RECORDED',
          executionJobId: job.id,
          intentId: job.intentId,
        },
      };
    },
    async getBaselineChange(job, baseline) {
      calls.push({ operation: 'read', job, baseline });
      return {
        baseline,
        status: 'CHANGE_RECORDED',
        executionJobId: job.id,
        intentId: job.intentId,
      };
    },
  };

  const registry = createExecutionAdapterRegistry({ engineeringChange });
  const adapter = registry.get('ENGINEERING.BASELINE_CHANGE');
  const result = await adapter.execute({
    id: 'job-eng-1',
    intentId: 'intent-eng-1',
    actionType: 'ENGINEERING.BASELINE_CHANGE',
    payload: { baseline: '5.3.9' },
  });

  assert.equal(result.adapterId, 'supabase.engineering-baseline.v1');
  assert.deepEqual(result.effect, {
    effectType: 'ENGINEERING.BASELINE_CHANGE_APPLIED',
    resourceType: 'ENGINEERING_BASELINE',
    resourceId: '5.3.9',
    state: 'CHANGE_RECORDED',
    domainOutcome: 'CREATED',
  });
  assert.deepEqual(result.verification, {
    verified: true,
    resourceType: 'ENGINEERING_BASELINE',
    resourceId: '5.3.9',
    expectedState: 'CHANGE_RECORDED',
    evidenceSource: 'vaos_private.engineering_baseline_changes',
  });
  assert.deepEqual(calls.map((call) => call.operation), ['record', 'read']);
});

test('Engineering adapter treats a replayed domain write as the same verified baseline change', async () => {
  const engineeringChange = {
    async recordBaselineChange(job, input) {
      return {
        outcome: 'REPLAY',
        record: { baseline: input.baseline, status: 'CHANGE_RECORDED', executionJobId: job.id, intentId: job.intentId },
      };
    },
    async getBaselineChange(job, baseline) {
      return { baseline, status: 'CHANGE_RECORDED', executionJobId: job.id, intentId: job.intentId };
    },
  };

  const result = await createExecutionAdapterRegistry({ engineeringChange }).get('ENGINEERING.BASELINE_CHANGE').execute({
    id: 'job-eng-2',
    intentId: 'intent-eng-2',
    actionType: 'ENGINEERING.BASELINE_CHANGE',
    payload: { baseline: '5.4-FK75' },
  });

  assert.equal(result.effect.domainOutcome, 'REPLAY');
  assert.equal(result.verification.verified, true);
});

test('Engineering adapter fails closed when no durable engineering domain port is configured', async () => {
  const adapter = createExecutionAdapterRegistry().get('ENGINEERING.BASELINE_CHANGE');
  await assert.rejects(
    () => adapter.execute({
      id: 'job-eng-3',
      intentId: 'intent-eng-3',
      actionType: 'ENGINEERING.BASELINE_CHANGE',
      payload: { baseline: '5.3.9' },
    }),
    /DOMAIN_PORT_REQUIRED:engineeringChange/,
  );
});

test('Engineering adapter rejects mismatched durable readback', async () => {
  const engineeringChange = {
    async recordBaselineChange(job, input) {
      return {
        outcome: 'CREATED',
        record: { baseline: input.baseline, status: 'CHANGE_RECORDED', executionJobId: job.id, intentId: job.intentId },
      };
    },
    async getBaselineChange(job, baseline) {
      return { baseline, status: 'RELEASED', executionJobId: job.id, intentId: job.intentId };
    },
  };

  const adapter = createExecutionAdapterRegistry({ engineeringChange }).get('ENGINEERING.BASELINE_CHANGE');
  await assert.rejects(
    () => adapter.execute({
      id: 'job-eng-4',
      intentId: 'intent-eng-4',
      actionType: 'ENGINEERING.BASELINE_CHANGE',
      payload: { baseline: '5.3.9' },
    }),
    /ENGINEERING_BASELINE_VERIFICATION_MISMATCH/,
  );
});

test('Engineering adapter refuses malformed baseline before touching the domain store', async () => {
  let touched = false;
  const engineeringChange = {
    async recordBaselineChange() { touched = true; },
    async getBaselineChange() { touched = true; },
  };
  const adapter = createExecutionAdapterRegistry({ engineeringChange }).get('ENGINEERING.BASELINE_CHANGE');
  await assert.rejects(
    () => adapter.execute({
      id: 'job-eng-5',
      intentId: 'intent-eng-5',
      actionType: 'ENGINEERING.BASELINE_CHANGE',
      payload: {},
    }),
    /ADAPTER_PAYLOAD_INVALID:baseline/,
  );
  assert.equal(touched, false);
});


test('Project/Risk adapter persists a durable escalation record and verifies it from the domain store', async () => {
  const calls = [];
  const projectRisk = {
    async escalateRisk(job, input) {
      calls.push({ operation: 'escalate', job, input });
      return {
        outcome: 'CREATED',
        record: {
          riskId: input.riskId,
          status: 'ESCALATED',
          executionJobId: job.id,
          intentId: job.intentId,
        },
      };
    },
    async getRiskEscalation(job, riskId) {
      calls.push({ operation: 'read', job, riskId });
      return {
        riskId,
        status: 'ESCALATED',
        executionJobId: job.id,
        intentId: job.intentId,
      };
    },
  };

  const result = await createExecutionAdapterRegistry({ projectRisk }).get('PROJECT.ESCALATE_RISK').execute({
    id: 'job-risk-1',
    intentId: 'intent-risk-1',
    actionType: 'PROJECT.ESCALATE_RISK',
    payload: { riskId: 'RSK-013' },
  });

  assert.equal(result.adapterId, 'supabase.project-risk.v1');
  assert.deepEqual(result.effect, {
    effectType: 'PROJECT.RISK_ESCALATED',
    resourceType: 'RISK',
    resourceId: 'RSK-013',
    state: 'ESCALATED',
    domainOutcome: 'CREATED',
  });
  assert.deepEqual(result.verification, {
    verified: true,
    resourceType: 'RISK',
    resourceId: 'RSK-013',
    expectedState: 'ESCALATED',
    evidenceSource: 'vaos_private.project_risk_escalations',
  });
  assert.deepEqual(calls.map((call) => call.operation), ['escalate', 'read']);
});

test('Project/Risk adapter treats a replayed escalation as the same verified domain effect', async () => {
  const projectRisk = {
    async escalateRisk(job, input) {
      return {
        outcome: 'REPLAY',
        record: { riskId: input.riskId, status: 'ESCALATED', executionJobId: job.id, intentId: job.intentId },
      };
    },
    async getRiskEscalation(job, riskId) {
      return { riskId, status: 'ESCALATED', executionJobId: job.id, intentId: job.intentId };
    },
  };

  const result = await createExecutionAdapterRegistry({ projectRisk }).get('PROJECT.ESCALATE_RISK').execute({
    id: 'job-risk-2',
    intentId: 'intent-risk-2',
    actionType: 'PROJECT.ESCALATE_RISK',
    payload: { riskId: 'RSK-014' },
  });

  assert.equal(result.effect.domainOutcome, 'REPLAY');
  assert.equal(result.verification.verified, true);
});

test('Project/Risk adapter fails closed when no durable project-risk port is configured', async () => {
  const adapter = createExecutionAdapterRegistry().get('PROJECT.ESCALATE_RISK');
  await assert.rejects(
    () => adapter.execute({
      id: 'job-risk-3',
      intentId: 'intent-risk-3',
      actionType: 'PROJECT.ESCALATE_RISK',
      payload: { riskId: 'RSK-015' },
    }),
    /DOMAIN_PORT_REQUIRED:projectRisk/,
  );
});

test('Project/Risk adapter rejects a mismatched durable readback', async () => {
  const projectRisk = {
    async escalateRisk(job, input) {
      return {
        outcome: 'CREATED',
        record: { riskId: input.riskId, status: 'ESCALATED', executionJobId: job.id, intentId: job.intentId },
      };
    },
    async getRiskEscalation(job, riskId) {
      return { riskId, status: 'MONITORED', executionJobId: job.id, intentId: job.intentId };
    },
  };

  const adapter = createExecutionAdapterRegistry({ projectRisk }).get('PROJECT.ESCALATE_RISK');
  await assert.rejects(
    () => adapter.execute({
      id: 'job-risk-4',
      intentId: 'intent-risk-4',
      actionType: 'PROJECT.ESCALATE_RISK',
      payload: { riskId: 'RSK-016' },
    }),
    /PROJECT_RISK_VERIFICATION_MISMATCH/,
  );
});

test('Project/Risk adapter refuses malformed risk ID before touching the domain store', async () => {
  let touched = false;
  const projectRisk = {
    async escalateRisk() { touched = true; },
    async getRiskEscalation() { touched = true; },
  };
  const adapter = createExecutionAdapterRegistry({ projectRisk }).get('PROJECT.ESCALATE_RISK');
  await assert.rejects(
    () => adapter.execute({
      id: 'job-risk-5',
      intentId: 'intent-risk-5',
      actionType: 'PROJECT.ESCALATE_RISK',
      payload: {},
    }),
    /ADAPTER_PAYLOAD_INVALID:riskId/,
  );
  assert.equal(touched, false);
});


test('Digital Thread adapter creates an explicit durable link and verifies lease-bound provenance', async () => {
  const calls = [];
  const digitalThread = {
    async linkDomainRecords(job, input) {
      calls.push({ operation: 'link', job, input });
      return {
        outcome: 'CREATED',
        link: {
          id: 'link-1',
          ...input,
          executionJobId: job.id,
          intentId: job.intentId,
        },
      };
    },
    async getDomainLink(job, input) {
      calls.push({ operation: 'read', job, input });
      return {
        id: 'link-1',
        sourceDomain: input.sourceDomain,
        sourceRecordId: input.sourceRecordId,
        relationType: input.relationType,
        targetDomain: input.targetDomain,
        targetRecordId: input.targetRecordId,
        createdBy: input.createdBy,
        executionJobId: job.id,
        intentId: job.intentId,
      };
    },
  };

  const registry = createExecutionAdapterRegistry({ digitalThread });
  const result = await registry.get('DIGITAL_THREAD.CREATE_LINK').execute({
    id: 'job-link-1',
    intentId: 'intent-link-1',
    actionType: 'DIGITAL_THREAD.CREATE_LINK',
    payload: {
      sourceDomain: 'QA_CAPA',
      sourceRecordId: '6ee7b7d0-8694-47fb-a00c-b3540bb380db',
      relationType: 'DRIVES_CHANGE',
      targetDomain: 'ENGINEERING_BASELINE',
      targetRecordId: 'b51465ef-2777-4e48-90f8-92ad7943317e',
      proposedBy: 'founder@example.com',
      context: { reason: 'CAPA requires engineering change' },
    },
  });

  assert.equal(result.adapterId, 'supabase.digital-thread-link.v1');
  assert.equal(result.effect.effectType, 'DIGITAL_THREAD.LINK_CREATED');
  assert.equal(result.effect.resourceType, 'DIGITAL_THREAD_LINK');
  assert.equal(result.effect.resourceId, 'link-1');
  assert.equal(result.effect.state, 'LINKED');
  assert.equal(result.verification.verified, true);
  assert.equal(result.verification.evidenceSource, 'vaos_private.digital_thread_links');
  assert.deepEqual(calls.map((call) => call.operation), ['link', 'read']);
});

test('Digital Thread adapter fails closed without a durable link port', async () => {
  const adapter = createExecutionAdapterRegistry().get('DIGITAL_THREAD.CREATE_LINK');
  await assert.rejects(
    () => adapter.execute({
      id: 'job-link-2',
      intentId: 'intent-link-2',
      actionType: 'DIGITAL_THREAD.CREATE_LINK',
      payload: {
        sourceDomain: 'QA_CAPA',
        sourceRecordId: '6ee7b7d0-8694-47fb-a00c-b3540bb380db',
        relationType: 'DRIVES_CHANGE',
        targetDomain: 'ENGINEERING_BASELINE',
        targetRecordId: 'b51465ef-2777-4e48-90f8-92ad7943317e',
        proposedBy: 'founder@example.com',
      },
    }),
    /DOMAIN_PORT_REQUIRED:digitalThread/,
  );
});


test('Digital Workforce qualification adapter persists, reads back and verifies qualification evidence', async () => {
  const calls = [];
  const digitalWorkforce = {
    async transitionDigitalEmployee(job, input) {
      calls.push({ operation: 'transition', job, input });
      return { outcome: 'CREATED', employee: { id: input.employeeId, status: 'QUALIFIED', qualificationLevel: input.qualificationLevel } };
    },
    async getDigitalEmployee(employeeId) {
      calls.push({ operation: 'read', employeeId });
      return { id: employeeId, status: 'QUALIFIED', qualificationLevel: 3, evidenceRefs: ['evidence:benchmark:1'] };
    },
  };

  const result = await createExecutionAdapterRegistry({ digitalWorkforce }).get('WORKFORCE.QUALIFY').execute({
    id: 'job-wf-1',
    intentId: 'intent-wf-1',
    actionType: 'WORKFORCE.QUALIFY',
    payload: { employeeId: 'vibpe', qualificationLevel: 3, evidenceRefs: ['evidence:benchmark:1'] },
  });

  assert.equal(result.adapterId, 'supabase.digital-workforce-lifecycle.v2');
  assert.equal(result.effect.state, 'QUALIFIED');
  assert.equal(result.verification.verified, true);
  assert.equal(result.verification.evidenceSource, 'vaos_private.digital_employee_lifecycle_events');
  assert.deepEqual(calls.map((call) => call.operation), ['transition','read']);
});

test('Digital Workforce qualification adapter fails terminally without evidence', async () => {
  const digitalWorkforce = {
    async transitionDigitalEmployee() { throw new Error('should not execute'); },
    async getDigitalEmployee() { return null; },
  };
  const adapter = createExecutionAdapterRegistry({ digitalWorkforce }).get('WORKFORCE.QUALIFY');

  await assert.rejects(
    async () => {
      try {
        await adapter.execute({
          id: 'job-wf-2', intentId: 'intent-wf-2', actionType: 'WORKFORCE.QUALIFY',
          payload: { employeeId: 'vibpe', qualificationLevel: 3, evidenceRefs: [] },
        });
      } catch (error) {
        assert.equal(error.retryable, false);
        assert.equal(error.code, 'WORKFORCE_QUALIFICATION_EVIDENCE_REQUIRED');
        throw error;
      }
    },
    /WORKFORCE_QUALIFICATION_EVIDENCE_REQUIRED/,
  );
});


test('Digital Workforce assessment adapter records and verifies PASS or FAIL as an assessment outcome', async () => {
  const digitalWorkforce = {
    async assessDigitalEmployeeQualification(job, input) {
      return {
        outcome: 'CREATED',
        assessment: { id: 'assessment-1', employeeId: input.employeeId, targetLevel: input.targetLevel, profileId: input.profileId, status: 'PASS' },
      };
    },
    async getQualificationAssessment(job, employeeId) {
      return {
        id: 'assessment-1',
        employeeId,
        targetLevel: 3,
        profileId: 'VIBPE_Q3_ENGINEERING_BASELINE_GOVERNANCE_V1',
        status: 'PASS',
      };
    },
  };

  const result = await createExecutionAdapterRegistry({ digitalWorkforce })
    .get('WORKFORCE.ASSESS_QUALIFICATION')
    .execute({
      id: 'job-assessment-1',
      intentId: 'intent-assessment-1',
      actionType: 'WORKFORCE.ASSESS_QUALIFICATION',
      payload: {
        employeeId: 'vibpe',
        targetLevel: 3,
        profileId: 'VIBPE_Q3_ENGINEERING_BASELINE_GOVERNANCE_V1',
      },
    });

  assert.equal(result.effect.state, 'PASS');
  assert.equal(result.verification.verified, true);
  assert.equal(result.verification.evidenceSource, 'vaos_private.digital_employee_qualification_assessments');
});

test('registry exposes governed Security identity observation execution', () => {
  assert.equal(createExecutionAdapterRegistry().has('SECURITY.OBSERVE_IDENTITY'), true);
});

test('Security adapter persists and verifies an identity observation', async () => {
  const security = {
    async observeIdentity(job, input) {
      return {
        outcome: 'CREATED',
        record: {
          observationId: input.observationId,
          status: 'OBSERVED',
          executionJobId: job.id,
          intentId: job.intentId,
        },
      };
    },
    async getIdentityObservation(job, observationId) {
      return { observationId, status: 'OBSERVED', executionJobId: job.id, intentId: job.intentId };
    },
  };

  const result = await createExecutionAdapterRegistry({ security }).get('SECURITY.OBSERVE_IDENTITY').execute({
    id: 'job-sec-1',
    intentId: 'intent-sec-1',
    actionType: 'SECURITY.OBSERVE_IDENTITY',
    attemptCount: 1,
    payload: { observationId: 'SEC-Q4-001' },
  });

  assert.equal(result.adapterId, 'supabase.security-identity.v1');
  assert.equal(result.effect.resourceId, 'SEC-Q4-001');
  assert.equal(result.verification.verified, true);
  assert.equal(result.verification.expectedState, 'OBSERVED');
});

test('Security qualification recovery drill forces exactly one retry before any identity write', async () => {
  let touched = false;
  const security = {
    async observeIdentity() { touched = true; },
    async getIdentityObservation() { touched = true; },
  };
  const adapter = createExecutionAdapterRegistry({ security }).get('SECURITY.OBSERVE_IDENTITY');

  await assert.rejects(
    () => adapter.execute({
      id: 'job-sec-recovery-1',
      intentId: 'intent-sec-recovery-1',
      actionType: 'SECURITY.OBSERVE_IDENTITY',
      attemptCount: 1,
      payload: {
        observationId: 'SEC-Q4-003',
        qualificationMode: true,
        qualificationRecoveryDrill: true,
      },
    }),
    (error) => error?.code === 'QUALIFICATION_RECOVERY_DRILL_RETRY' && error?.retryable === true,
  );
  assert.equal(touched, false);
});

test('Security qualification recovery second attempt verifies observation and writes governed trace', async () => {
  const calls = [];
  const security = {
    async observeIdentity(job, input) {
      calls.push('observe');
      return {
        outcome: 'CREATED',
        record: {
          observationId: input.observationId,
          status: 'OBSERVED',
          executionJobId: job.id,
          intentId: job.intentId,
        },
      };
    },
    async getIdentityObservation(job, observationId) {
      calls.push('read');
      return {
        observationId,
        status: 'OBSERVED',
        executionJobId: job.id,
        intentId: job.intentId,
      };
    },
    async linkQualificationTrace(job, input) {
      calls.push('link');
      return {
        outcome: 'CREATED',
        link: {
          id: 'security-link-1',
          sourceDomain: 'PROJECT_RISK',
          targetDomain: 'ENGINEERING_BASELINE',
          relationType: input.relationType,
          executionJobId: job.id,
          intentId: job.intentId,
        },
      };
    },
  };

  const result = await createExecutionAdapterRegistry({ security }).get('SECURITY.OBSERVE_IDENTITY').execute({
    id: 'job-sec-recovery-2',
    intentId: 'intent-sec-recovery-2',
    actionType: 'SECURITY.OBSERVE_IDENTITY',
    attemptCount: 2,
    payload: {
      observationId: 'SEC-Q4-003',
      qualificationMode: true,
      qualificationRecoveryDrill: true,
      qualificationTrace: {
        sourceRiskId: 'RSK-015',
        targetBaseline: '5.3.9',
        relationType: 'RELATED_TO',
      },
    },
  });

  assert.deepEqual(calls, ['observe', 'read', 'link']);
  assert.equal(result.verification.verified, true);
  assert.equal(result.effect.qualificationTraceLinkId, 'security-link-1');
});

test('Knowledge Q2 link resolves business resource IDs through the dedicated governed port', async () => {
  const digitalThread = {
    async linkDomainRecords() { throw new Error('generic path must not be used'); },
    async getDomainLink() { throw new Error('generic path must not be used'); },
    async linkKnowledgeQualification(job, input) {
      return {
        outcome: 'CREATED',
        link: {
          id: 'knowledge-link-1',
          sourceRiskId: input.sourceRiskId,
          targetBaseline: input.targetBaseline,
          relationType: input.relationType,
          executionJobId: job.id,
          intentId: job.intentId,
        },
      };
    },
    async getKnowledgeQualificationLink(job, input) {
      return {
        id: 'knowledge-link-1',
        sourceRiskId: input.sourceRiskId,
        targetBaseline: input.targetBaseline,
        relationType: input.relationType,
        executionJobId: job.id,
        intentId: job.intentId,
      };
    },
  };

  const result = await createExecutionAdapterRegistry({ digitalThread })
    .get('DIGITAL_THREAD.CREATE_LINK')
    .execute({
      id: 'job-knowledge-1',
      intentId: 'intent-knowledge-1',
      actionType: 'DIGITAL_THREAD.CREATE_LINK',
      payload: {
        sourceRiskId: 'PC-Q2-001',
        targetBaseline: '5.3.9',
        relationType: 'RELATED_TO',
        qualificationKnowledgeLink: true,
        qualificationMode: true,
      },
    });

  assert.equal(result.adapterId, 'supabase.knowledge-trace.v1');
  assert.equal(result.effect.resourceId, 'knowledge-link-1');
  assert.equal(result.verification.verified, true);
  assert.equal(result.verification.evidenceSource, 'vaos_private.digital_thread_links');
});



test('Knowledge Q2 duplicate link is accepted as immutable replay evidence instead of dead lettering', async () => {
  let readbackCalled = false;
  const digitalThread = {
    async linkDomainRecords() { throw new Error('generic path must not be used'); },
    async getDomainLink() { throw new Error('generic path must not be used'); },
    async linkKnowledgeQualification(job, input) {
      return {
        outcome: 'REPLAY',
        link: {
          id: 'knowledge-link-existing',
          sourceRiskId: input.sourceRiskId,
          targetBaseline: input.targetBaseline,
          relationType: input.relationType,
          executionJobId: 'job-original',
          intentId: 'intent-original',
        },
      };
    },
    async getKnowledgeQualificationLink() {
      readbackCalled = true;
      throw new Error('cross-intent replay must use immutable returned link evidence');
    },
  };

  const result = await createExecutionAdapterRegistry({ digitalThread })
    .get('DIGITAL_THREAD.CREATE_LINK')
    .execute({
      id: 'job-duplicate',
      intentId: 'intent-duplicate',
      actionType: 'DIGITAL_THREAD.CREATE_LINK',
      payload: {
        sourceRiskId: 'PC-Q2-002',
        targetBaseline: '5.3.9',
        relationType: 'RELATED_TO',
        qualificationKnowledgeLink: true,
        qualificationMode: true,
      },
    });

  assert.equal(readbackCalled, false);
  assert.equal(result.effect.domainOutcome, 'REPLAY');
  assert.equal(result.effect.resourceId, 'knowledge-link-existing');
  assert.equal(result.effect.replayedFromExecutionJobId, 'job-original');
  assert.equal(result.effect.replayedFromIntentId, 'intent-original');
  assert.equal(result.verification.verified, true);
  assert.equal(result.verification.replayedFromExecutionJobId, 'job-original');
  assert.equal(result.verification.replayedFromIntentId, 'intent-original');
});

test('commercial write-qualification adapter is registered but fails closed without its dedicated port', async () => {
  const registry=createExecutionAdapterRegistry();
  assert.equal(registry.has('COMMERCIAL.COMMIT_ORDER'),true);
  assert.equal(registry.get('COMMERCIAL.COMMIT_ORDER').id,'vyndi.write-qualification.v1');
  await assert.rejects(
    ()=>registry.get('COMMERCIAL.COMMIT_ORDER').execute({
      id:'job-stage3-1',intentId:'intent-stage3-1',actionType:'COMMERCIAL.COMMIT_ORDER',
      payload:{writeQualification:true,qualificationProfile:'COMMERCIAL_WRITE_CANARY_V1'},
    }),
    /DOMAIN_PORT_REQUIRED:vyndiWriteQualification/,
  );
});
