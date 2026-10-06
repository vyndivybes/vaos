export const AUTHORITY = Object.freeze({
  OBSERVE: 0,
  ANALYSE: 1,
  RECOMMEND: 2,
  PREPARE: 3,
  APPROVED_EXECUTION: 4,
  AUTONOMOUS_EXECUTION: 5,
});

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

export function validateAgentDefinition(input) {
  const errors = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['AGENT_DEFINITION_REQUIRED'] };
  }

  if (typeof input.id !== 'string' || !ID_PATTERN.test(input.id)) {
    errors.push('INVALID_AGENT_ID');
  }
  if (typeof input.name !== 'string' || input.name.trim().length < 2) {
    errors.push('INVALID_AGENT_NAME');
  }
  if (typeof input.domain !== 'string' || input.domain.trim().length < 2) {
    errors.push('INVALID_AGENT_DOMAIN');
  }

  const capabilities = input.capabilities;
  if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
    errors.push('CAPABILITIES_REQUIRED');
  } else {
    const entries = Object.entries(capabilities);
    if (!entries.length) errors.push('CAPABILITIES_REQUIRED');

    for (const [capability, authority] of entries) {
      if (capability === '*' || !/^[A-Z][A-Z0-9_]*(\.[A-Z][A-Z0-9_]*)+$/.test(capability)) {
        errors.push('INVALID_CAPABILITY');
      }
      if (!Number.isInteger(authority) || authority < AUTHORITY.OBSERVE || authority > AUTHORITY.AUTONOMOUS_EXECUTION) {
        errors.push('INVALID_AUTHORITY_LEVEL');
      }
    }
  }

  if (input.confidence !== undefined && (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 100)) {
    errors.push('INVALID_CONFIDENCE');
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function createAgentDefinition(input) {
  const validation = validateAgentDefinition(input);
  if (!validation.ok) {
    throw new Error(`AGENT_DEFINITION_INVALID:${validation.errors.join(',')}`);
  }

  return Object.freeze({
    id: input.id,
    name: input.name.trim(),
    domain: input.domain.trim(),
    capabilities: Object.freeze({ ...input.capabilities }),
    status: input.status || 'active',
    confidence: input.confidence ?? 100,
    task: input.task || 'Awaiting work',
    version: input.version || '1.0.0',
  });
}
