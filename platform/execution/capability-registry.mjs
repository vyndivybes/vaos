const PROVIDER_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const CAPABILITY = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;
const QUALIFICATION_STATES = new Set(['candidate', 'evaluation', 'qualified', 'restricted', 'rejected']);
const DEPLOYMENT_MODES = new Set(['self-hosted', 'managed-saas', 'desktop', 'edge']);
const DATA_EGRESS = new Set(['none', 'controlled', 'external']);

function invalid(field) {
  const error = new Error(`CAPABILITY_PROVIDER_INVALID:${field}`);
  error.code = 'CAPABILITY_PROVIDER_INVALID';
  error.retryable = false;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function uniqueStrings(values) {
  return Array.isArray(values)
    && values.length > 0
    && values.every((value) => typeof value === 'string')
    && new Set(values).size === values.length;
}

function validateManifest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('manifest');
  if (input.schemaVersion !== 'vaos.provider.v1') throw invalid('schemaVersion');
  if (typeof input.providerId !== 'string' || !PROVIDER_ID.test(input.providerId)) throw invalid('providerId');
  if (typeof input.displayName !== 'string' || !input.displayName.trim()) throw invalid('displayName');
  if (!uniqueStrings(input.capabilities) || !input.capabilities.every((item) => CAPABILITY.test(item))) {
    throw invalid('capabilities');
  }
  if (!uniqueStrings(input.deploymentModes) || !input.deploymentModes.every((item) => DEPLOYMENT_MODES.has(item))) {
    throw invalid('deploymentModes');
  }

  const qualification = input.qualification;
  if (!qualification || typeof qualification !== 'object' || !QUALIFICATION_STATES.has(qualification.state)) {
    throw invalid('qualification');
  }
  if (qualification.qualifiedCapabilities !== undefined) {
    if (!Array.isArray(qualification.qualifiedCapabilities)
        || new Set(qualification.qualifiedCapabilities).size !== qualification.qualifiedCapabilities.length
        || !qualification.qualifiedCapabilities.every((item) => typeof item === 'string' && CAPABILITY.test(item))) {
      throw invalid('qualification.qualifiedCapabilities');
    }
    if (!qualification.qualifiedCapabilities.every((item) => input.capabilities.includes(item))) {
      throw invalid('qualification.qualifiedCapabilities');
    }
  }

  const security = input.security;
  if (!security || typeof security !== 'object' || !DATA_EGRESS.has(security.dataEgress)) throw invalid('security');

  const execution = input.execution;
  if (!execution || typeof execution !== 'object') throw invalid('execution');

  return deepFreeze(clone(input));
}

function isQualifiedFor(manifest, capability) {
  if (manifest.qualification.state !== 'qualified') return false;
  const qualified = manifest.qualification.qualifiedCapabilities;
  return Array.isArray(qualified) && qualified.includes(capability);
}

function allowedByConstraints(manifest, constraints = {}) {
  if (constraints.deploymentMode && !manifest.deploymentModes.includes(constraints.deploymentMode)) return false;
  if (constraints.allowExternalDataEgress === false && manifest.security.dataEgress === 'external') return false;
  if (Array.isArray(constraints.allowedProviderIds) && !constraints.allowedProviderIds.includes(manifest.providerId)) return false;
  if (Array.isArray(constraints.deniedProviderIds) && constraints.deniedProviderIds.includes(manifest.providerId)) return false;
  return true;
}

export function createCapabilityRegistry({ providers = [] } = {}) {
  if (!Array.isArray(providers)) throw invalid('providers');

  const manifests = new Map();
  for (const input of providers) {
    const manifest = validateManifest(input);
    if (manifests.has(manifest.providerId)) {
      const error = new Error(`CAPABILITY_PROVIDER_DUPLICATE:${manifest.providerId}`);
      error.code = 'CAPABILITY_PROVIDER_DUPLICATE';
      error.retryable = false;
      throw error;
    }
    manifests.set(manifest.providerId, manifest);
  }

  function eligible(capability, constraints = {}) {
    if (typeof capability !== 'string' || !CAPABILITY.test(capability)) return [];
    return [...manifests.values()]
      .filter((manifest) => manifest.capabilities.includes(capability))
      .filter((manifest) => isQualifiedFor(manifest, capability))
      .filter((manifest) => allowedByConstraints(manifest, constraints))
      .sort((left, right) => left.providerId.localeCompare(right.providerId));
  }

  function resolve(capability, constraints = {}) {
    return eligible(capability, constraints)[0] || null;
  }

  function requireProvider(capability, constraints = {}) {
    const manifest = resolve(capability, constraints);
    if (manifest) return manifest;
    const error = new Error(`CAPABILITY_PROVIDER_NOT_AVAILABLE:${capability}`);
    error.code = 'CAPABILITY_PROVIDER_NOT_AVAILABLE';
    error.retryable = false;
    throw error;
  }

  return Object.freeze({
    has(providerId) { return manifests.has(providerId); },
    get(providerId) { return manifests.get(providerId) || null; },
    list() { return [...manifests.values()].sort((a, b) => a.providerId.localeCompare(b.providerId)); },
    eligible,
    resolve,
    require: requireProvider,
    supports(capability, constraints = {}) { return resolve(capability, constraints) !== null; },
  });
}
