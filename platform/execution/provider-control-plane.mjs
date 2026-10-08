const PROVIDER_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const CAPABILITY = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;
const QUALIFICATION_STATES = new Set(['candidate','evaluation','qualified','restricted','rejected']);
const DATA_CLASSES = new Set(['public','internal','confidential','restricted']);
const RISK_CLASSES = new Set(['low','medium','high','critical']);
const HEALTH_STATES = new Set(['healthy','degraded','unhealthy','unknown']);
const TRANSITIONS = Object.freeze({
  candidate: new Set(['evaluation','rejected']),
  evaluation: new Set(['qualified','rejected']),
  qualified: new Set(['qualified','restricted','rejected']),
  restricted: new Set(['qualified','restricted','rejected']),
  rejected: new Set([]),
});

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  error.retryable = false;
  return error;
}
function clone(value) { return structuredClone(value); }
function text(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw fail(code);
  return value.trim();
}
function stringArray(value, code, allowed) {
  if (!Array.isArray(value) || !value.length || value.some(v => typeof v !== 'string' || !v.trim())) throw fail(code);
  const items = value.map(v => v.trim());
  if (new Set(items).size !== items.length) throw fail(code);
  if (allowed && items.some(v => !allowed.has(v))) throw fail(code);
  return items;
}
function validDateOrNull(value, code) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) throw fail(code);
  return new Date(value).toISOString();
}
function validateManifest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('PROVIDER_MANIFEST_INVALID:manifest');
  if (input.schemaVersion !== 'vaos.provider.v2') throw fail('PROVIDER_MANIFEST_INVALID:schemaVersion');
  if (typeof input.providerId !== 'string' || !PROVIDER_ID.test(input.providerId)) throw fail('PROVIDER_MANIFEST_INVALID:providerId');
  text(input.displayName, 'PROVIDER_MANIFEST_INVALID:displayName');
  text(input.adapterVersion, 'PROVIDER_MANIFEST_INVALID:adapterVersion');
  const capabilities = stringArray(input.capabilities, 'PROVIDER_MANIFEST_INVALID:capabilities');
  if (capabilities.some(v => !CAPABILITY.test(v))) throw fail('PROVIDER_MANIFEST_INVALID:capabilities');
  stringArray(input.deploymentModes, 'PROVIDER_MANIFEST_INVALID:deploymentModes');

  if (typeof input.enabled !== 'boolean') throw fail('PROVIDER_MANIFEST_INVALID:enabled');

  const q = input.qualification;
  if (!q || typeof q !== 'object' || !QUALIFICATION_STATES.has(q.state)) throw fail('PROVIDER_MANIFEST_INVALID:qualification');
  const qualifiedCapabilities = Array.isArray(q.qualifiedCapabilities) ? q.qualifiedCapabilities.slice() : [];
  if (qualifiedCapabilities.some(v => typeof v !== 'string' || !capabilities.includes(v))) throw fail('PROVIDER_MANIFEST_INVALID:qualification.qualifiedCapabilities');
  const evidenceRefs = Array.isArray(q.evidenceRefs) ? q.evidenceRefs.slice() : [];
  if (evidenceRefs.some(v => typeof v !== 'string' || !v.trim())) throw fail('PROVIDER_MANIFEST_INVALID:qualification.evidenceRefs');
  const validUntil = validDateOrNull(q.validUntil, 'PROVIDER_MANIFEST_INVALID:qualification.validUntil');

  const routing = input.routing;
  if (!routing || typeof routing !== 'object') throw fail('PROVIDER_MANIFEST_INVALID:routing');
  const dataClassifications = stringArray(routing.dataClassifications, 'PROVIDER_MANIFEST_INVALID:routing.dataClassifications', DATA_CLASSES);
  const riskClasses = stringArray(routing.riskClasses, 'PROVIDER_MANIFEST_INVALID:routing.riskClasses', RISK_CLASSES);
  if (typeof routing.licensingAllowed !== 'boolean') throw fail('PROVIDER_MANIFEST_INVALID:routing.licensingAllowed');

  const security = input.security;
  if (!security || typeof security !== 'object') throw fail('PROVIDER_MANIFEST_INVALID:security');

  const execution = input.execution;
  if (!execution || typeof execution !== 'object') throw fail('PROVIDER_MANIFEST_INVALID:execution');
  if (!['required','optional','not-applicable'].includes(execution.healthProbe)) throw fail('PROVIDER_MANIFEST_INVALID:execution.healthProbe');
  text(execution.rollbackMethod, 'PROVIDER_MANIFEST_INVALID:execution.rollbackMethod');

  const operations = input.operations;
  if (!operations || typeof operations !== 'object') throw fail('PROVIDER_MANIFEST_INVALID:operations');
  text(operations.retentionClass, 'PROVIDER_MANIFEST_INVALID:operations.retentionClass');
  if (!Array.isArray(operations.dataResidency)) throw fail('PROVIDER_MANIFEST_INVALID:operations.dataResidency');
  text(operations.costControl, 'PROVIDER_MANIFEST_INVALID:operations.costControl');

  return Object.freeze(clone({
    ...input,
    capabilities,
    qualification: { ...q, qualifiedCapabilities, evidenceRefs, validUntil },
    routing: { ...routing, dataClassifications, riskClasses },
  }));
}

export function createProviderControlPlane({
  providers = [],
  recordAudit = async () => {},
  now = () => new Date(),
  healthTtlMs = 300_000,
  healthTtlOverridesMs = {infisical: 1_200_000},
  stateStore = null,
} = {}) {
  if (!Array.isArray(providers)) throw fail('PROVIDER_CONTROL_INVALID:providers');
  if (typeof recordAudit !== 'function') throw fail('PROVIDER_CONTROL_INVALID:recordAudit');
  if (typeof now !== 'function') throw fail('PROVIDER_CONTROL_INVALID:now');
  if (!Number.isInteger(healthTtlMs) || healthTtlMs < 1) throw fail('PROVIDER_CONTROL_INVALID:healthTtlMs');
  if (!healthTtlOverridesMs || typeof healthTtlOverridesMs !== 'object' || Array.isArray(healthTtlOverridesMs)
      || Object.entries(healthTtlOverridesMs).some(([key,value]) =>
        !PROVIDER_ID.test(key) || !Number.isInteger(value) || value < 1 || value > 3_600_000)) {
    throw fail('PROVIDER_CONTROL_INVALID:healthTtlOverridesMs');
  }
  if (stateStore !== null && (typeof stateStore?.load !== 'function' || typeof stateStore?.save !== 'function')) {
    throw fail('PROVIDER_CONTROL_INVALID:stateStore');
  }

  const states = new Map();
  const histories = new Map();

  for (const raw of providers) {
    const manifest = validateManifest(raw);
    if (states.has(manifest.providerId)) throw fail('PROVIDER_DUPLICATE:' + manifest.providerId);
    states.set(manifest.providerId, {
      manifest,
      enabled: manifest.enabled,
      capabilityEnabled: new Map(manifest.capabilities.map(c => [c, true])),
      qualificationState: manifest.qualification.state,
      qualifiedCapabilities: new Set(manifest.qualification.qualifiedCapabilities),
      restrictedCapabilities: new Set(),
      disabledDataClassifications: new Set(),
      disabledRiskClasses: new Set(),
      qualificationEvidenceRefs: manifest.qualification.evidenceRefs.slice(),
      validUntil: manifest.qualification.validUntil,
      health: null,
    });
    histories.set(manifest.providerId, []);
  }

  function getState(providerId) {
    const state = states.get(providerId);
    if (!state) throw fail('PROVIDER_NOT_FOUND:' + providerId);
    return state;
  }
  function timestamp() {
    const value = now();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw fail('PROVIDER_CONTROL_CLOCK_INVALID');
    return value;
  }
  async function audit(providerId, event) {
    const clean = Object.freeze({ ...event, providerId, occurredAt: timestamp().toISOString() });
    histories.get(providerId).push(clean);
    await recordAudit(clean);
    return clean;
  }
  async function persist(providerId) {
    if (!stateStore) return snapshot(providerId);
    const current = snapshot(providerId);
    await stateStore.save(current);
    return current;
  }
  function applyPersisted(providerId, persisted) {
    if (!persisted) return;
    const state = getState(providerId);
    if (!persisted || persisted.providerId !== providerId || typeof persisted.enabled !== 'boolean') throw fail('PROVIDER_PERSISTED_STATE_INVALID');
    const capEnabled = persisted.capabilityEnabled;
    if (!capEnabled || typeof capEnabled !== 'object' || Array.isArray(capEnabled)) throw fail('PROVIDER_PERSISTED_STATE_INVALID');
    for (const [cap,value] of Object.entries(capEnabled)) {
      if (!state.manifest.capabilities.includes(cap) || typeof value !== 'boolean') throw fail('PROVIDER_PERSISTED_STATE_INVALID');
    }
    const q = persisted.qualification;
    if (!q || !QUALIFICATION_STATES.has(q.state)) throw fail('PROVIDER_PERSISTED_STATE_INVALID');
    const qualified = Array.isArray(q.qualifiedCapabilities) ? q.qualifiedCapabilities : [];
    const restricted = Array.isArray(q.restrictedCapabilities) ? q.restrictedCapabilities : [];
    const evidence = Array.isArray(q.evidenceRefs) ? q.evidenceRefs : [];
    if (qualified.some(cap => !state.manifest.capabilities.includes(cap)) || restricted.some(cap => !state.manifest.capabilities.includes(cap))) throw fail('PROVIDER_PERSISTED_STATE_INVALID');
    if (evidence.some(ref => typeof ref !== 'string' || !ref.trim())) throw fail('PROVIDER_PERSISTED_STATE_INVALID');
    const validUntil = validDateOrNull(q.validUntil, 'PROVIDER_PERSISTED_STATE_INVALID');
    const rr = persisted.routingRestrictions || {};
    const disabledData = Array.isArray(rr.disabledDataClassifications) ? rr.disabledDataClassifications : [];
    const disabledRisk = Array.isArray(rr.disabledRiskClasses) ? rr.disabledRiskClasses : [];
    if (disabledData.some(value => !DATA_CLASSES.has(value)) || disabledRisk.some(value => !RISK_CLASSES.has(value))) throw fail('PROVIDER_PERSISTED_STATE_INVALID');
    let health = null;
    if (persisted.health !== null && persisted.health !== undefined) {
      if (!HEALTH_STATES.has(persisted.health.status)) throw fail('PROVIDER_PERSISTED_STATE_INVALID');
      const checkedAt = validDateOrNull(persisted.health.checkedAt, 'PROVIDER_PERSISTED_STATE_INVALID');
      if (!checkedAt) throw fail('PROVIDER_PERSISTED_STATE_INVALID');
      const evidenceRef = persisted.health.evidenceRef;
      if (evidenceRef !== null && evidenceRef !== undefined && (typeof evidenceRef !== 'string' || !evidenceRef.trim())) throw fail('PROVIDER_PERSISTED_STATE_INVALID');
      health = Object.freeze({status:persisted.health.status,checkedAt,evidenceRef:evidenceRef||null});
    }
    state.enabled = persisted.enabled;
    state.capabilityEnabled = new Map(state.manifest.capabilities.map(cap => [cap, capEnabled[cap] !== false]));
    state.qualificationState = q.state;
    state.qualifiedCapabilities = new Set(qualified);
    state.restrictedCapabilities = new Set(restricted);
    state.qualificationEvidenceRefs = [...new Set(evidence)];
    state.validUntil = validUntil;
    state.disabledDataClassifications = new Set(disabledData);
    state.disabledRiskClasses = new Set(disabledRisk);
    state.health = health;
  }
  async function restore() {
    if (!stateStore) return listSnapshots();
    for (const providerId of [...states.keys()].sort()) {
      const persisted = await stateStore.load(providerId);
      applyPersisted(providerId,persisted);
    }
    return listSnapshots();
  }
  function listSnapshots() {
    return [...states.keys()].sort().map(snapshot);
  }
  function qualificationFresh(state) {
    if (!state.validUntil) return true;
    return new Date(state.validUntil).getTime() > timestamp().getTime();
  }
  function healthEligible(state) {
    if (state.manifest.execution.healthProbe !== 'required') return true;
    if (!state.health || state.health.status !== 'healthy') return false;
    const age = timestamp().getTime() - new Date(state.health.checkedAt).getTime();
    // Infisical: 15-minute probe interval + at most 5 minutes jitter. Other providers retain 5 minutes.
    const maxAge = healthTtlOverridesMs[state.manifest.providerId] ?? healthTtlMs;
    return age >= 0 && age <= maxAge;
  }
  function capabilityQualified(state, capability) {
    if (!state.qualifiedCapabilities.has(capability)) return false;
    if (state.qualificationState === 'rejected' || state.qualificationState === 'candidate' || state.qualificationState === 'evaluation') return false;
    if (state.qualificationState === 'restricted' && state.restrictedCapabilities.has(capability)) return false;
    return qualificationFresh(state);
  }
  function eligible(capability, constraints = {}) {
    if (typeof capability !== 'string' || !CAPABILITY.test(capability)) return [];
    const dataClassification = constraints.dataClassification;
    const riskClass = constraints.riskClass;
    if (!DATA_CLASSES.has(dataClassification) || !RISK_CLASSES.has(riskClass)) return [];

    const deploymentMode = typeof constraints.deploymentMode === 'string' && constraints.deploymentMode.trim()
      ? constraints.deploymentMode.trim()
      : null;
    const dataResidency = typeof constraints.dataResidency === 'string' && constraints.dataResidency.trim()
      ? constraints.dataResidency.trim()
      : null;
    const allowed = Array.isArray(constraints.allowedProviderIds) ? new Set(constraints.allowedProviderIds) : null;
    const denied = new Set(Array.isArray(constraints.deniedProviderIds) ? constraints.deniedProviderIds : []);
    const preferred = Array.isArray(constraints.preferredProviderIds) ? constraints.preferredProviderIds : [];

    const matches = [...states.values()].filter(state => {
      const m = state.manifest;
      if (!m.capabilities.includes(capability)) return false;
      if (!state.enabled || state.capabilityEnabled.get(capability) === false) return false;
      if (!capabilityQualified(state, capability)) return false;
      if (!m.routing.dataClassifications.includes(dataClassification)) return false;
      if (!m.routing.riskClasses.includes(riskClass)) return false;
      if (state.disabledDataClassifications.has(dataClassification)) return false;
      if (state.disabledRiskClasses.has(riskClass)) return false;
      if (!m.routing.licensingAllowed) return false;
      if (deploymentMode && !m.deploymentModes.includes(deploymentMode)) return false;
      if (dataResidency && !m.operations.dataResidency.includes(dataResidency)) return false;
      if (!healthEligible(state)) return false;
      if (allowed && !allowed.has(m.providerId)) return false;
      if (denied.has(m.providerId)) return false;
      return true;
    });

    return matches
      .sort((a,b) => {
        const ai = preferred.indexOf(a.manifest.providerId);
        const bi = preferred.indexOf(b.manifest.providerId);
        if (ai !== -1 || bi !== -1) {
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          if (ai !== bi) return ai - bi;
        }
        return a.manifest.providerId.localeCompare(b.manifest.providerId);
      })
      .map(state => state.manifest);
  }

  function resolve(capability, constraints = {}) {
    return eligible(capability, constraints)[0] || null;
  }

  async function transitionQualification({
    providerId,
    to,
    capability,
    restrictedCapabilities = [],
    evidenceRefs = [],
    authorityRef,
    reason,
    validUntil,
  } = {}) {
    const state = getState(providerId);
    text(authorityRef, 'PROVIDER_QUALIFICATION_AUTHORITY_REQUIRED');
    text(reason, 'PROVIDER_QUALIFICATION_REASON_REQUIRED');
    if (!QUALIFICATION_STATES.has(to)) throw fail('PROVIDER_QUALIFICATION_STATE_INVALID');
    if (!TRANSITIONS[state.qualificationState].has(to)) throw fail('PROVIDER_QUALIFICATION_TRANSITION_INVALID');

    if (to === 'qualified') {
      const cap = text(capability, 'PROVIDER_QUALIFICATION_CAPABILITY_REQUIRED');
      if (!state.manifest.capabilities.includes(cap)) throw fail('PROVIDER_QUALIFICATION_CAPABILITY_INVALID');
      if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) throw fail('PROVIDER_QUALIFICATION_EVIDENCE_REQUIRED');
      if (evidenceRefs.some(ref => typeof ref !== 'string' || !ref.trim())) throw fail('PROVIDER_QUALIFICATION_EVIDENCE_INVALID');
      state.qualifiedCapabilities.add(cap);
      state.restrictedCapabilities.delete(cap);
      state.qualificationEvidenceRefs = [...new Set([...state.qualificationEvidenceRefs, ...evidenceRefs])];
      state.validUntil = validDateOrNull(validUntil, 'PROVIDER_QUALIFICATION_VALID_UNTIL_INVALID');
    }

    if (to === 'restricted') {
      if (!Array.isArray(restrictedCapabilities) || restrictedCapabilities.length === 0) throw fail('PROVIDER_RESTRICTION_CAPABILITIES_REQUIRED');
      if (restrictedCapabilities.some(cap => !state.manifest.capabilities.includes(cap))) throw fail('PROVIDER_RESTRICTION_CAPABILITY_INVALID');
      state.restrictedCapabilities = new Set([...state.restrictedCapabilities, ...restrictedCapabilities]);
      if (Array.isArray(evidenceRefs)) state.qualificationEvidenceRefs = [...new Set([...state.qualificationEvidenceRefs, ...evidenceRefs])];
    }

    const from = state.qualificationState;
    state.qualificationState = to;
    await audit(providerId, {
      type:'PROVIDER.QUALIFICATION.TRANSITIONED',
      from,
      to,
      capability: capability || null,
      restrictedCapabilities: [...state.restrictedCapabilities],
      evidenceRefs: Array.isArray(evidenceRefs) ? evidenceRefs.slice() : [],
      authorityRef,
      reason,
      validUntil: state.validUntil,
    });
    return persist(providerId);
  }

  async function setProviderEnabled({ providerId, enabled, authorityRef, reason } = {}) {
    const state = getState(providerId);
    if (typeof enabled !== 'boolean') throw fail('PROVIDER_ENABLED_VALUE_INVALID');
    text(authorityRef, 'PROVIDER_CONTROL_AUTHORITY_REQUIRED');
    text(reason, 'PROVIDER_CONTROL_REASON_REQUIRED');
    state.enabled = enabled;
    await audit(providerId, { type:'PROVIDER.ENABLED.CHANGED', enabled, authorityRef, reason });
    return persist(providerId);
  }

  async function setCapabilityEnabled({ providerId, capability, enabled, authorityRef, reason } = {}) {
    const state = getState(providerId);
    if (!state.manifest.capabilities.includes(capability)) throw fail('PROVIDER_CAPABILITY_NOT_FOUND');
    if (typeof enabled !== 'boolean') throw fail('PROVIDER_CAPABILITY_ENABLED_VALUE_INVALID');
    text(authorityRef, 'PROVIDER_CONTROL_AUTHORITY_REQUIRED');
    text(reason, 'PROVIDER_CONTROL_REASON_REQUIRED');
    state.capabilityEnabled.set(capability, enabled);
    await audit(providerId, { type:'PROVIDER.CAPABILITY.ENABLED.CHANGED', capability, enabled, authorityRef, reason });
    return persist(providerId);
  }

  async function setRoutingRestrictions({
    providerId,
    disabledDataClassifications = [],
    disabledRiskClasses = [],
    authorityRef,
    reason,
  } = {}) {
    const state = getState(providerId);
    text(authorityRef, 'PROVIDER_CONTROL_AUTHORITY_REQUIRED');
    text(reason, 'PROVIDER_CONTROL_REASON_REQUIRED');
    if (!Array.isArray(disabledDataClassifications) || disabledDataClassifications.some(value => !DATA_CLASSES.has(value))) {
      throw fail('PROVIDER_ROUTING_DATA_CLASS_INVALID');
    }
    if (!Array.isArray(disabledRiskClasses) || disabledRiskClasses.some(value => !RISK_CLASSES.has(value))) {
      throw fail('PROVIDER_ROUTING_RISK_CLASS_INVALID');
    }
    state.disabledDataClassifications = new Set(disabledDataClassifications);
    state.disabledRiskClasses = new Set(disabledRiskClasses);
    await audit(providerId, {
      type:'PROVIDER.ROUTING.RESTRICTIONS.CHANGED',
      disabledDataClassifications:[...state.disabledDataClassifications].sort(),
      disabledRiskClasses:[...state.disabledRiskClasses].sort(),
      authorityRef,
      reason,
    });
    return persist(providerId);
  }

  async function recordHealth({ providerId, status, checkedAt, evidenceRef } = {}) {
    const state = getState(providerId);
    if (!HEALTH_STATES.has(status)) throw fail('PROVIDER_HEALTH_STATUS_INVALID');
    const normalizedCheckedAt = validDateOrNull(checkedAt, 'PROVIDER_HEALTH_TIME_INVALID');
    if (!normalizedCheckedAt) throw fail('PROVIDER_HEALTH_TIME_INVALID');
    if (evidenceRef !== undefined && (typeof evidenceRef !== 'string' || !evidenceRef.trim())) throw fail('PROVIDER_HEALTH_EVIDENCE_INVALID');
    state.health = Object.freeze({ status, checkedAt: normalizedCheckedAt, evidenceRef: evidenceRef || null });
    await audit(providerId, { type:'PROVIDER.HEALTH.RECORDED', status, checkedAt: normalizedCheckedAt, evidenceRef: evidenceRef || null });
    await persist(providerId);
    return state.health;
  }

  function snapshot(providerId) {
    const state = getState(providerId);
    return Object.freeze({
      providerId,
      enabled: state.enabled,
      capabilityEnabled: Object.freeze(Object.fromEntries(state.capabilityEnabled)),
      qualification: Object.freeze({
        state: state.qualificationState,
        qualifiedCapabilities: [...state.qualifiedCapabilities].sort(),
        restrictedCapabilities: [...state.restrictedCapabilities].sort(),
        evidenceRefs: state.qualificationEvidenceRefs.slice(),
        validUntil: state.validUntil,
      }),
      routingRestrictions: Object.freeze({
        disabledDataClassifications: [...state.disabledDataClassifications].sort(),
        disabledRiskClasses: [...state.disabledRiskClasses].sort(),
      }),
      health: state.health ? Object.freeze({ ...state.health }) : null,
    });
  }

  return Object.freeze({
    list() { return listSnapshots(); },
    restore,
    snapshot,
    history(providerId) { getState(providerId); return histories.get(providerId).slice(); },
    eligible,
    resolve,
    transitionQualification,
    setProviderEnabled,
    setCapabilityEnabled,
    setRoutingRestrictions,
    recordHealth,
  });
}
