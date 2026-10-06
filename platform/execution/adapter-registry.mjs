function requiredText(payload, key) {
  const value = payload?.[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`ADAPTER_PAYLOAD_INVALID:${key}`);
  return value.trim();
}

function adapter(id, execute) {
  return Object.freeze({ id, execute });
}

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

    return {
      adapterId: 'supabase.project-risk.v1',
      effect: {
        effectType: 'PROJECT.RISK_ESCALATED',
        resourceType: 'RISK',
        resourceId: riskId,
        state: record.status,
        domainOutcome: escalated.outcome,
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

export function createExecutionAdapterRegistry({ qaCapa, engineeringChange, projectRisk } = {}) {
  const adapters = new Map([
    ['QA.OPEN_CAPA', qaCapaAdapter(qaCapa)],
    ['ENGINEERING.BASELINE_CHANGE', engineeringBaselineAdapter(engineeringChange)],
    ['PROJECT.ESCALATE_RISK', projectRiskAdapter(projectRisk)],
  ]);

  return Object.freeze({
    has(actionType) { return adapters.has(actionType); },
    get(actionType) { return adapters.get(actionType) || null; },
    list() { return [...adapters.entries()].map(([actionType, item]) => ({ actionType, adapterId: item.id })); },
  });
}
