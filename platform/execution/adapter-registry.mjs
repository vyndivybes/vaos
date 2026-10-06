function requiredText(payload, key) {
  const value = payload?.[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`ADAPTER_PAYLOAD_INVALID:${key}`);
  return value.trim();
}

function adapter(id, execute) {
  return Object.freeze({ id, execute });
}

const ADAPTERS = new Map([
  ['QA.OPEN_CAPA', adapter('internal-ledger.qa-capa.v1', async (job) => {
    const resourceId = requiredText(job.payload, 'capaId');
    return {
      adapterId: 'internal-ledger.qa-capa.v1',
      effect: {
        effectType: 'QUALITY.CAPA_OPENED',
        resourceType: 'CAPA',
        resourceId,
        state: 'OPEN',
      },
      verification: {
        verified: true,
        resourceType: 'CAPA',
        resourceId,
        expectedState: 'OPEN',
      },
    };
  })],
  ['ENGINEERING.BASELINE_CHANGE', adapter('internal-ledger.engineering-baseline.v1', async (job) => {
    const resourceId = requiredText(job.payload, 'baseline');
    return {
      adapterId: 'internal-ledger.engineering-baseline.v1',
      effect: {
        effectType: 'ENGINEERING.BASELINE_CHANGE_APPLIED',
        resourceType: 'ENGINEERING_BASELINE',
        resourceId,
        state: 'CHANGE_RECORDED',
      },
      verification: {
        verified: true,
        resourceType: 'ENGINEERING_BASELINE',
        resourceId,
        expectedState: 'CHANGE_RECORDED',
      },
    };
  })],
  ['PROJECT.ESCALATE_RISK', adapter('internal-ledger.project-risk.v1', async (job) => {
    const resourceId = requiredText(job.payload, 'riskId');
    return {
      adapterId: 'internal-ledger.project-risk.v1',
      effect: {
        effectType: 'PROJECT.RISK_ESCALATED',
        resourceType: 'RISK',
        resourceId,
        state: 'ESCALATED',
      },
      verification: {
        verified: true,
        resourceType: 'RISK',
        resourceId,
        expectedState: 'ESCALATED',
      },
    };
  })],
]);

export function createExecutionAdapterRegistry() {
  return Object.freeze({
    has(actionType) { return ADAPTERS.has(actionType); },
    get(actionType) { return ADAPTERS.get(actionType) || null; },
    list() { return [...ADAPTERS.entries()].map(([actionType, item]) => ({ actionType, adapterId: item.id })); },
  });
}
