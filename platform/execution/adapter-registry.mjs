import { createRiskQualificationTrace } from './risk-qualification-trace.mjs';
import { createSecurityQualificationTrace } from './security-qualification-trace.mjs';

function requiredText(payload, key) {
  const value = payload?.[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`ADAPTER_PAYLOAD_INVALID:${key}`);
  return value.trim();
}

function adapter(id, execute) {
  return Object.freeze({ id, execute });
}

function terminalError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  error.retryable = false;
  return error;
}

const VYNDI_READ_ACTIONS = Object.freeze([
  'COMMERCIAL.OBSERVE_PIPELINE',
  'PROCUREMENT.OBSERVE_SHORTAGE',
  'INVENTORY.OBSERVE_STOCK',
  'PRODUCTION.OBSERVE_WIP',
  'MAINTENANCE.OBSERVE_ASSET',
  'FINANCE.OBSERVE_LEDGER',
  'PEOPLE.OBSERVE_WORKFORCE',
  'ENGINEERING.OBSERVE_CONFIGURATION',
]);

function vyndiReadAdapter(vyndiBridge, actionType) {
  return adapter('vyndi.read-bridge.v1', async (job) => {
    if (!vyndiBridge || typeof vyndiBridge.execute !== 'function') {
      throw terminalError('DOMAIN_PORT_REQUIRED:vyndiBridge');
    }
    const observed = await vyndiBridge.execute(job);
    if (!observed || observed.actionType !== actionType || !observed.sourceAuthority) {
      throw terminalError('VYNDI_READ_BRIDGE_VERIFICATION_MISMATCH');
    }
    return {
      adapterId: 'vyndi.read-bridge.v1',
      effect: {
        effectType: 'VYNDI.DOMAIN_OBSERVED',
        resourceType: 'VYNDI_READ_SNAPSHOT',
        resourceId: `${actionType}:${job.id}`,
        state: 'OBSERVED',
        employeeId: observed.employeeId,
        sourceAuthority: observed.sourceAuthority,
      },
      verification: {
        verified: true,
        resourceType: 'VYNDI_READ_SNAPSHOT',
        resourceId: `${actionType}:${job.id}`,
        expectedState: 'OBSERVED',
        actionType,
        sourceAuthority: observed.sourceAuthority,
        nonce: observed.nonce,
        bodySha256: observed.bodySha256,
        evidenceSource: 'vyndi:/api/vaos/bridge',
      },
    };
  });
}

function vyndiWriteQualificationAdapter(vyndiWriteQualification) {
  return adapter('vyndi.write-qualification.v1', async (job) => {
    if (!vyndiWriteQualification || typeof vyndiWriteQualification.execute !== 'function') {
      throw terminalError('DOMAIN_PORT_REQUIRED:vyndiWriteQualification');
    }
    if (
      job?.actionType !== 'COMMERCIAL.COMMIT_ORDER'
      || job?.payload?.writeQualification !== true
      || job?.payload?.qualificationProfile !== 'COMMERCIAL_WRITE_CANARY_V1'
    ) {
      throw terminalError('VYNDI_WRITE_QUALIFICATION_SCOPE_DENIED');
    }

    const qualified = await vyndiWriteQualification.execute(job);
    if (
      !qualified
      || qualified.actionType !== job.actionType
      || qualified.sourceAuthority !== 'saveSalesOrder'
      || qualified.qualificationProfile !== 'COMMERCIAL_WRITE_CANARY_V1'
      || qualified.outcome !== 'COMPENSATED'
      || qualified.finalState !== 'cancelled'
    ) {
      throw terminalError('VYNDI_WRITE_QUALIFICATION_VERIFICATION_MISMATCH');
    }

    return {
      adapterId: 'vyndi.write-qualification.v1',
      effect: {
        effectType: 'VYNDI.WRITE_QUALIFICATION_COMPENSATED',
        resourceType: 'VYNDI_WRITE_QUALIFICATION',
        resourceId: qualified.canaryId,
        state: 'COMPENSATED',
        finalState: qualified.finalState,
        sourceAuthority: qualified.sourceAuthority,
      },
      verification: {
        verified: true,
        resourceType: 'VYNDI_WRITE_QUALIFICATION',
        resourceId: qualified.canaryId,
        expectedState: 'cancelled',
        actionType: job.actionType,
        approvalId: qualified.approvalId,
        qualificationProfile: qualified.qualificationProfile,
        sourceAuthority: qualified.sourceAuthority,
        nonce: qualified.nonce,
        bodySha256: qualified.bodySha256,
        initialRevision: qualified.initialRevision,
        finalRevision: qualified.finalRevision,
        evidenceSource: 'vyndi:/api/vaos/bridge',
      },
    };
  });
}

const WORKFORCE_TARGET_STATUS = Object.freeze({
  'WORKFORCE.START_TRAINING': 'TRAINING',
  'WORKFORCE.QUALIFY': 'QUALIFIED',
  'WORKFORCE.ACTIVATE': 'ACTIVE',
  'WORKFORCE.RESTRICT': 'RESTRICTED',
  'WORKFORCE.START_RETRAINING': 'RETRAINING',
  'WORKFORCE.RETIRE': 'RETIRED',
});

function assertQaCapaPort(qaCapa) {
  if (!qaCapa || typeof qaCapa.openCapa !== 'function' || typeof qaCapa.getCapa !== 'function') {
    throw new Error('DOMAIN_PORT_REQUIRED:qaCapa');
  }
  return qaCapa;
}

function assertEngineeringChangePort(engineeringChange) {
  if (!engineeringChange
      || typeof engineeringChange.recordBaselineChange !== 'function'
      || typeof engineeringChange.getBaselineChange !== 'function') {
    throw new Error('DOMAIN_PORT_REQUIRED:engineeringChange');
  }
  return engineeringChange;
}

function qaCapaAdapter(qaCapa) {
  return adapter('supabase.qa-capa.v1', async (job) => {
    const capaId = requiredText(job.payload, 'capaId');
    const port = assertQaCapaPort(qaCapa);

    const opened = await port.openCapa(job, { capaId });
    if (!opened || !['CREATED', 'REPLAY'].includes(opened.outcome)) {
      throw new Error(`CAPA_DOMAIN_WRITE_FAILED:${opened?.outcome || 'UNKNOWN'}`);
    }

    const record = await port.getCapa(job, capaId);
    const verified = Boolean(
      record
      && record.capaId === capaId
      && record.status === 'OPEN'
      && record.executionJobId === job.id
      && record.intentId === job.intentId
    );

    if (!verified) throw new Error('CAPA_VERIFICATION_MISMATCH');

    return {
      adapterId: 'supabase.qa-capa.v1',
      effect: {
        effectType: 'QUALITY.CAPA_OPENED',
        resourceType: 'CAPA',
        resourceId: capaId,
        state: record.status,
        domainOutcome: opened.outcome,
      },
      verification: {
        verified: true,
        resourceType: 'CAPA',
        resourceId: capaId,
        expectedState: 'OPEN',
        evidenceSource: 'vaos_private.capa_records',
      },
    };
  });
}

function engineeringBaselineAdapter(engineeringChange) {
  return adapter('supabase.engineering-baseline.v1', async (job) => {
    const baseline = requiredText(job.payload, 'baseline');
    const port = assertEngineeringChangePort(engineeringChange);

    const recorded = await port.recordBaselineChange(job, { baseline });
    if (!recorded || !['CREATED', 'REPLAY'].includes(recorded.outcome)) {
      throw new Error(`ENGINEERING_BASELINE_DOMAIN_WRITE_FAILED:${recorded?.outcome || 'UNKNOWN'}`);
    }

    const record = await port.getBaselineChange(job, baseline);
    const verified = Boolean(
      record
      && record.baseline === baseline
      && record.status === 'CHANGE_RECORDED'
      && record.executionJobId === job.id
      && record.intentId === job.intentId
    );

    if (!verified) throw new Error('ENGINEERING_BASELINE_VERIFICATION_MISMATCH');

    return {
      adapterId: 'supabase.engineering-baseline.v1',
      effect: {
        effectType: 'ENGINEERING.BASELINE_CHANGE_APPLIED',
        resourceType: 'ENGINEERING_BASELINE',
        resourceId: baseline,
        state: record.status,
        domainOutcome: recorded.outcome,
      },
      verification: {
        verified: true,
        resourceType: 'ENGINEERING_BASELINE',
        resourceId: baseline,
        expectedState: 'CHANGE_RECORDED',
        evidenceSource: 'vaos_private.engineering_baseline_changes',
      },
    };
  });
}

function assertProjectRiskPort(projectRisk) {
  if (!projectRisk
      || typeof projectRisk.escalateRisk !== 'function'
      || typeof projectRisk.getRiskEscalation !== 'function') {
    throw new Error('DOMAIN_PORT_REQUIRED:projectRisk');
  }
  return projectRisk;
}

function projectRiskAdapter(projectRisk) {
  return adapter('supabase.project-risk.v1', async (job) => {
    const riskId = requiredText(job.payload, 'riskId');
    const port = assertProjectRiskPort(projectRisk);

    if (job.payload?.qualificationRecoveryDrill === true) {
      if (job.payload?.qualificationMode !== true) {
        throw terminalError('QUALIFICATION_MODE_REQUIRED');
      }
      if (Number(job.attemptCount) === 1) {
        const error = new Error('QUALIFICATION_RECOVERY_DRILL_RETRY');
        error.code = 'QUALIFICATION_RECOVERY_DRILL_RETRY';
        error.retryable = true;
        throw error;
      }
    }

    const escalated = await port.escalateRisk(job, { riskId });
    if (!escalated || !['CREATED', 'REPLAY'].includes(escalated.outcome)) {
      throw new Error(`PROJECT_RISK_DOMAIN_WRITE_FAILED:${escalated?.outcome || 'UNKNOWN'}`);
    }

    const record = await port.getRiskEscalation(job, riskId);
    const verified = Boolean(
      record
      && record.riskId === riskId
      && record.status === 'ESCALATED'
      && record.executionJobId === job.id
      && record.intentId === job.intentId
    );

    if (!verified) throw new Error('PROJECT_RISK_VERIFICATION_MISMATCH');

    const qualificationTraceLink = await createRiskQualificationTrace({ port, job });

    return {
      adapterId: 'supabase.project-risk.v1',
      effect: {
        effectType: 'PROJECT.RISK_ESCALATED',
        resourceType: 'RISK',
        resourceId: riskId,
        state: record.status,
        domainOutcome: escalated.outcome,
        ...(qualificationTraceLink ? { qualificationTraceLinkId: qualificationTraceLink.id } : {}),
      },
      verification: {
        verified: true,
        resourceType: 'RISK',
        resourceId: riskId,
        expectedState: 'ESCALATED',
        evidenceSource: 'vaos_private.project_risk_escalations',
      },
    };
  });
}

function assertSecurityPort(security) {
  if (!security
      || typeof security.observeIdentity !== 'function'
      || typeof security.getIdentityObservation !== 'function') {
    throw new Error('DOMAIN_PORT_REQUIRED:security');
  }
  return security;
}

function securityIdentityAdapter(security) {
  return adapter('supabase.security-identity.v1', async (job) => {
    const observationId = requiredText(job.payload, 'observationId');
    const port = assertSecurityPort(security);

    if (job.payload?.qualificationRecoveryDrill === true) {
      if (job.payload?.qualificationMode !== true) {
        throw terminalError('QUALIFICATION_MODE_REQUIRED');
      }
      if (Number(job.attemptCount) === 1) {
        const error = new Error('QUALIFICATION_RECOVERY_DRILL_RETRY');
        error.code = 'QUALIFICATION_RECOVERY_DRILL_RETRY';
        error.retryable = true;
        throw error;
      }
    }

    const observed = await port.observeIdentity(job, { observationId });
    if (!observed || !['CREATED', 'REPLAY'].includes(observed.outcome)) {
      throw new Error(`SECURITY_IDENTITY_DOMAIN_WRITE_FAILED:${observed?.outcome || 'UNKNOWN'}`);
    }

    const record = await port.getIdentityObservation(job, observationId);
    const verified = Boolean(
      record
      && record.observationId === observationId
      && record.status === 'OBSERVED'
      && record.executionJobId === job.id
      && record.intentId === job.intentId
    );
    if (!verified) throw new Error('SECURITY_IDENTITY_VERIFICATION_MISMATCH');

    const qualificationTraceLink = await createSecurityQualificationTrace({ port, job });

    return {
      adapterId: 'supabase.security-identity.v1',
      effect: {
        effectType: 'SECURITY.IDENTITY_OBSERVED',
        resourceType: 'SECURITY_IDENTITY_OBSERVATION',
        resourceId: observationId,
        state: record.status,
        domainOutcome: observed.outcome,
        ...(qualificationTraceLink ? { qualificationTraceLinkId: qualificationTraceLink.id } : {}),
      },
      verification: {
        verified: true,
        resourceType: 'SECURITY_IDENTITY_OBSERVATION',
        resourceId: observationId,
        expectedState: 'OBSERVED',
        evidenceSource: 'vaos_private.security_identity_observations',
      },
    };
  });
}

function assertDigitalThreadPort(digitalThread) {
  if (!digitalThread
      || typeof digitalThread.linkDomainRecords !== 'function'
      || typeof digitalThread.getDomainLink !== 'function') {
    throw new Error('DOMAIN_PORT_REQUIRED:digitalThread');
  }
  return digitalThread;
}

function assertKnowledgeThreadPort(digitalThread) {
  if (!digitalThread
      || typeof digitalThread.linkKnowledgeQualification !== 'function'
      || typeof digitalThread.getKnowledgeQualificationLink !== 'function') {
    throw new Error('DOMAIN_PORT_REQUIRED:knowledgeDigitalThread');
  }
  return digitalThread;
}

function digitalThreadLinkAdapter(digitalThread) {
  return adapter('supabase.digital-thread-link.v1', async (job) => {
    if (job.payload?.qualificationKnowledgeLink === true) {
      const sourceRiskId = requiredText(job.payload, 'sourceRiskId');
      const targetBaseline = requiredText(job.payload, 'targetBaseline');
      const relationType = requiredText(job.payload, 'relationType');
      const port = assertKnowledgeThreadPort(digitalThread);
      const input = { sourceRiskId, targetBaseline, relationType };

      const linked = await port.linkKnowledgeQualification(job, input);
      if (!linked || !['CREATED', 'REPLAY'].includes(linked.outcome)) {
        throw new Error(`KNOWLEDGE_LINK_WRITE_FAILED:${linked?.outcome || 'UNKNOWN'}`);
      }

      const replayed = linked.outcome === 'REPLAY';
      const record = replayed && linked.link
        ? linked.link
        : await port.getKnowledgeQualificationLink(job, input);
      const verified = Boolean(
        record
        && record.id
        && record.sourceRiskId === sourceRiskId
        && record.targetBaseline === targetBaseline
        && record.relationType === relationType
        && (replayed || (record.executionJobId === job.id && record.intentId === job.intentId))
      );

      if (!verified) throw new Error('KNOWLEDGE_LINK_VERIFICATION_MISMATCH');

      const replayLineage = replayed
        ? {
            replayedFromExecutionJobId: record.executionJobId,
            replayedFromIntentId: record.intentId,
          }
        : {};

      return {
        adapterId: 'supabase.knowledge-trace.v1',
        effect: {
          effectType: 'DIGITAL_THREAD.LINK_CREATED',
          resourceType: 'DIGITAL_THREAD_LINK',
          resourceId: record.id,
          state: 'LINKED',
          domainOutcome: linked.outcome,
          sourceRiskId,
          targetBaseline,
          relationType,
          ...replayLineage,
        },
        verification: {
          verified: true,
          resourceType: 'DIGITAL_THREAD_LINK',
          resourceId: record.id,
          expectedState: 'LINKED',
          executionJobId: job.id,
          intentId: job.intentId,
          ...replayLineage,
          evidenceSource: 'vaos_private.digital_thread_links',
        },
      };
    }

    const sourceDomain = requiredText(job.payload, 'sourceDomain');
    const sourceRecordId = requiredText(job.payload, 'sourceRecordId');
    const relationType = requiredText(job.payload, 'relationType');
    const targetDomain = requiredText(job.payload, 'targetDomain');
    const targetRecordId = requiredText(job.payload, 'targetRecordId');
    const createdBy = requiredText(job.payload, 'proposedBy');
    const context = job.payload?.context && typeof job.payload.context === 'object' && !Array.isArray(job.payload.context)
      ? { ...job.payload.context }
      : {};
    const port = assertDigitalThreadPort(digitalThread);
    const input = { sourceDomain, sourceRecordId, relationType, targetDomain, targetRecordId, createdBy, context };

    const linked = await port.linkDomainRecords(job, input);
    if (!linked || !['CREATED', 'REPLAY'].includes(linked.outcome)) {
      throw new Error(`DIGITAL_THREAD_LINK_WRITE_FAILED:${linked?.outcome || 'UNKNOWN'}`);
    }

    const record = await port.getDomainLink(job, input);
    const verified = Boolean(
      record
      && record.id
      && record.sourceDomain === sourceDomain
      && record.sourceRecordId === sourceRecordId
      && record.relationType === relationType
      && record.targetDomain === targetDomain
      && record.targetRecordId === targetRecordId
      && record.createdBy === createdBy
      && record.executionJobId === job.id
      && record.intentId === job.intentId
    );

    if (!verified) throw new Error('DIGITAL_THREAD_LINK_VERIFICATION_MISMATCH');

    return {
      adapterId: 'supabase.digital-thread-link.v1',
      effect: {
        effectType: 'DIGITAL_THREAD.LINK_CREATED',
        resourceType: 'DIGITAL_THREAD_LINK',
        resourceId: record.id,
        state: 'LINKED',
        domainOutcome: linked.outcome,
        sourceDomain,
        sourceRecordId,
        relationType,
        targetDomain,
        targetRecordId,
      },
      verification: {
        verified: true,
        resourceType: 'DIGITAL_THREAD_LINK',
        resourceId: record.id,
        expectedState: 'LINKED',
        executionJobId: job.id,
        intentId: job.intentId,
        evidenceSource: 'vaos_private.digital_thread_links',
      },
    };
  });
}

function assertDigitalWorkforcePort(digitalWorkforce) {
  if (!digitalWorkforce
      || typeof digitalWorkforce.transitionDigitalEmployee !== 'function'
      || typeof digitalWorkforce.getDigitalEmployee !== 'function') {
    throw terminalError('DOMAIN_PORT_REQUIRED:digitalWorkforce');
  }
  return digitalWorkforce;
}

function assertDigitalWorkforceAssessmentPort(digitalWorkforce) {
  if (!digitalWorkforce
      || typeof digitalWorkforce.assessDigitalEmployeeQualification !== 'function'
      || typeof digitalWorkforce.getQualificationAssessment !== 'function') {
    throw terminalError('DOMAIN_PORT_REQUIRED:digitalWorkforceAssessment');
  }
  return digitalWorkforce;
}

function digitalWorkforceAssessmentAdapter(digitalWorkforce) {
  return adapter('supabase.digital-workforce-qualification.v1', async (job) => {
    const employeeId = requiredText(job.payload, 'employeeId');
    const profileId = requiredText(job.payload, 'profileId');
    const targetLevel = Number(job.payload?.targetLevel);
    if (!Number.isInteger(targetLevel) || targetLevel < 1 || targetLevel > 4) {
      throw terminalError('WORKFORCE_INVALID_QUALIFICATION_LEVEL');
    }

    const port = assertDigitalWorkforceAssessmentPort(digitalWorkforce);
    const assessed = await port.assessDigitalEmployeeQualification(job, { employeeId, targetLevel, profileId });
    if (!assessed || !['CREATED','REPLAY'].includes(assessed.outcome)) {
      throw terminalError(`WORKFORCE_${assessed?.outcome || 'ASSESSMENT_FAILED'}`);
    }

    const record = await port.getQualificationAssessment(job, employeeId);
    const verified = Boolean(
      record
      && record.id
      && record.employeeId === employeeId
      && Number(record.targetLevel) === targetLevel
      && record.profileId === profileId
      && ['PASS','FAIL'].includes(record.status)
    );
    if (!verified) throw terminalError('WORKFORCE_ASSESSMENT_VERIFICATION_MISMATCH');

    return {
      adapterId: 'supabase.digital-workforce-qualification.v1',
      effect: {
        effectType: 'WORKFORCE.QUALIFICATION_ASSESSED',
        resourceType: 'QUALIFICATION_ASSESSMENT',
        resourceId: record.id,
        state: record.status,
        employeeId,
        targetLevel,
        profileId,
        domainOutcome: assessed.outcome,
      },
      verification: {
        verified: true,
        resourceType: 'QUALIFICATION_ASSESSMENT',
        resourceId: record.id,
        expectedState: record.status,
        employeeId,
        targetLevel,
        evidenceSource: 'vaos_private.digital_employee_qualification_assessments',
      },
    };
  });
}

function digitalWorkforceAdapter(digitalWorkforce, actionType) {
  return adapter('supabase.digital-workforce-lifecycle.v2', async (job) => {
    const employeeId = requiredText(job.payload, 'employeeId');
    const port = assertDigitalWorkforcePort(digitalWorkforce);
    const expectedStatus = WORKFORCE_TARGET_STATUS[actionType];
    const qualificationLevel = actionType === 'WORKFORCE.QUALIFY' ? Number(job.payload?.qualificationLevel) : null;
    const evidenceRefs = Array.isArray(job.payload?.evidenceRefs)
      ? job.payload.evidenceRefs.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
      : [];

    if (actionType === 'WORKFORCE.QUALIFY') {
      if (!Number.isInteger(qualificationLevel) || qualificationLevel < 1 || qualificationLevel > 4) {
        throw terminalError('WORKFORCE_INVALID_QUALIFICATION_LEVEL');
      }
      if (!evidenceRefs.length) throw terminalError('WORKFORCE_QUALIFICATION_EVIDENCE_REQUIRED');
    }

    const transitioned = await port.transitionDigitalEmployee(job, { employeeId, qualificationLevel, evidenceRefs });
    if (!transitioned || !['CREATED','REPLAY'].includes(transitioned.outcome)) {
      throw terminalError(`WORKFORCE_${transitioned?.outcome || 'TRANSITION_FAILED'}`);
    }

    const employee = await port.getDigitalEmployee(employeeId);
    const verified = Boolean(
      employee
      && employee.id === employeeId
      && employee.status === expectedStatus
      && (actionType !== 'WORKFORCE.QUALIFY'
        || (Number(employee.qualificationLevel) === qualificationLevel
          && Array.isArray(employee.evidenceRefs)
          && evidenceRefs.every((ref) => employee.evidenceRefs.includes(ref))))
    );
    if (!verified) throw terminalError('WORKFORCE_VERIFICATION_MISMATCH');

    return {
      adapterId: 'supabase.digital-workforce-lifecycle.v2',
      effect: {
        effectType: 'WORKFORCE.DIGITAL_EMPLOYEE.TRANSITIONED',
        resourceType: 'DIGITAL_EMPLOYEE',
        resourceId: employeeId,
        state: employee.status,
        qualificationLevel: Number(employee.qualificationLevel) || 0,
        domainOutcome: transitioned.outcome,
      },
      verification: {
        verified: true,
        resourceType: 'DIGITAL_EMPLOYEE',
        resourceId: employeeId,
        expectedState: expectedStatus,
        qualificationLevel: Number(employee.qualificationLevel) || 0,
        evidenceSource: 'vaos_private.digital_employee_lifecycle_events',
      },
    };
  });
}

export function createExecutionAdapterRegistry({ qaCapa, engineeringChange, projectRisk, security, digitalThread, digitalWorkforce, vyndiBridge, vyndiWriteQualification, stirlingTransform } = {}) {
  const adapters = new Map([
    ['QA.OPEN_CAPA', qaCapaAdapter(qaCapa)],
    ['ENGINEERING.BASELINE_CHANGE', engineeringBaselineAdapter(engineeringChange)],
    ['PROJECT.ESCALATE_RISK', projectRiskAdapter(projectRisk)],
    ['SECURITY.OBSERVE_IDENTITY', securityIdentityAdapter(security)],
    ['DIGITAL_THREAD.CREATE_LINK', digitalThreadLinkAdapter(digitalThread)],
    ['WORKFORCE.ASSESS_QUALIFICATION', digitalWorkforceAssessmentAdapter(digitalWorkforce)],
    ...Object.keys(WORKFORCE_TARGET_STATUS).map((actionType) => [actionType, digitalWorkforceAdapter(digitalWorkforce, actionType)]),
    ...VYNDI_READ_ACTIONS.map((actionType) => [actionType, vyndiReadAdapter(vyndiBridge, actionType)]),
    ['COMMERCIAL.COMMIT_ORDER', vyndiWriteQualificationAdapter(vyndiWriteQualification)],
    ...(stirlingTransform ? [['DOCUMENT.TRANSFORM', adapter('stirling.transform.v1', async job => stirlingTransform.execute(job))]] : []),
  ]);

  return Object.freeze({
    has(actionType) { return adapters.has(actionType); },
    get(actionType) { return adapters.get(actionType) || null; },
    list() { return [...adapters.entries()].map(([actionType, item]) => ({ actionType, adapterId: item.id })); },
  });
}
