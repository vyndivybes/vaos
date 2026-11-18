/**
 * Dependency-free model portability foundation for the AI Independence Programme.
 * This module cannot approve actions, enable billing, create provider credentials or
 * certify live qualification. Integrators must supply authenticated invoke adapters,
 * DLP-validated data classification, policy authorization and evidence recording.
 */
const CLASSIFICATIONS = new Set(['PUBLIC', 'SYNTHETIC', 'CONFIDENTIAL']);
const CAPABILITIES = new Set(['text', 'vision', 'audio', 'document']);
const MODES = new Set(['development', 'independence']);
const COUNT = value => Number.isSafeInteger(value) && value >= 0;
const PROVIDER_KINDS = new Set(['local', 'external']);
const HOLD = reason => Object.freeze({ status: 'HOLD', reason });

/**
 * Dispatches one inference request only through an explicitly permitted provider.
 * No automatic retries or paid escalation; provider faults HOLD rather than fall back.
 * The returned result is advisory data, never authorization to mutate business state.
 */
export async function routeInference({ task, providers = [], mode = 'development', allowExternal = false } = {}) {
  if (!task || typeof task !== 'object' || Array.isArray(task) ||
      !CLASSIFICATIONS.has(task.classification) ||
      !CAPABILITIES.has(task.capability) ||
      typeof task.input !== 'string' || !task.input.trim() || !MODES.has(mode) ||
      !Array.isArray(providers)) return HOLD('INVALID_REQUEST');

  const eligible = providers.filter(provider => {
    if (!provider || typeof provider !== 'object' || !PROVIDER_KINDS.has(provider.kind) ||
        typeof provider.id !== 'string' || !provider.id || provider.costTier !== 'free' ||
        provider.available !== true || !Array.isArray(provider.capabilities) ||
        !provider.capabilities.includes(task.capability) || typeof provider.invoke !== 'function') return false;
    if (provider.kind === 'external') {
      return mode === 'development' && allowExternal === true &&
        (task.classification === 'PUBLIC' || task.classification === 'SYNTHETIC');
    }
    return true;
  });
  // Local-first. An explicitly opted-in free external adapter may be used only if
  // no local provider supports the capability. Do not rely on listing order.
  const selected = eligible.find(provider => provider.kind === 'local') || eligible[0];
  if (!selected) return HOLD('NO_PERMITTED_PROVIDER');
  try {
    const output = await selected.invoke(task);
    if (output === undefined || output === null) return Object.freeze({status:'HOLD', reason:'EMPTY_PROVIDER_RESPONSE', providerId:selected.id});
    return Object.freeze({ status: 'OK', providerId: selected.id, output });
  } catch {
    // Never return provider errors: they can include prompt contents or API tokens.
    return Object.freeze({ status: 'HOLD', reason: 'PROVIDER_ERROR', providerId: selected.id });
  }
}

/**
 * Evidence-based candidate qualification, not an automatic disconnection switch.
 * Caller-supplied evidence must be independently audited before acceptance.
 */
export function assessIndependence(x = {}) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) x = {};
  const holds = [];
  if (typeof x.evidenceRef !== 'string' || !x.evidenceRef.trim())
    holds.push('EVIDENCE_REFERENCE_REQUIRED');
  if (!Number.isFinite(x.hoursDisconnected) || x.hoursDisconnected < 72 ||
      x.offlineRuntimeVerified !== true)
    holds.push('DISCONNECTION_TRIAL_UNVERIFIED');
  if (x.externalInferenceCalls !== 0 || x.paidInferenceCalls !== 0)
    holds.push('EXTERNAL_DEPENDENCY_DETECTED');
  if (!COUNT(x.evaluatedMissions) || x.evaluatedMissions < 20 ||
      !COUNT(x.successfulMissions) || x.successfulMissions > x.evaluatedMissions ||
      x.successfulMissions * 100 < x.evaluatedMissions * 95)
    holds.push('MISSION_SUCCESS_GATE_FAILED');
  if (x.criticalPolicyViolations !== 0)
    holds.push('POLICY_VIOLATION_DETECTED');
  if (x.multimodalBenchmarksPassed !== true)
    holds.push('MULTIMODAL_QUALIFICATION_MISSING');
  if (x.memoryBenchmarksPassed !== true)
    holds.push('MEMORY_QUALIFICATION_MISSING');
  if (!COUNT(x.learningHeldoutSamples) || x.learningHeldoutSamples < 30 ||
      !COUNT(x.learningBaselineCorrect) || !COUNT(x.learningCandidateCorrect) ||
      x.learningBaselineCorrect > x.learningHeldoutSamples ||
      x.learningCandidateCorrect > x.learningHeldoutSamples ||
      x.learningCandidateCorrect <= x.learningBaselineCorrect)
    holds.push('LEARNING_IMPROVEMENT_UNVERIFIED');
  return Object.freeze({
    state: holds.length ? 'HOLD' : 'READY_FOR_HUMAN_REVIEW',
    holds: Object.freeze(holds),
    autoDisconnectAuthorized: false,
    productionWriteAuthorized: false,
    paidInferenceAuthorized: false,
    explanation: 'Review raw evidence, approved authority and production recovery before retiring any provider',
  });
}
