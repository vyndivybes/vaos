import { AUTHORITY } from './agent.mjs';

export const DIGITAL_EMPLOYEE_STATUS = Object.freeze({
  PROPOSED: 'PROPOSED',
  TRAINING: 'TRAINING',
  QUALIFIED: 'QUALIFIED',
  ACTIVE: 'ACTIVE',
  RESTRICTED: 'RESTRICTED',
  RETRAINING: 'RETRAINING',
  RETIRED: 'RETIRED',
});

export const QUALIFICATION_LEVEL = Object.freeze({
  Q0_EXPERIMENTAL: 0,
  Q1_GENERAL: 1,
  Q2_BUSINESS: 2,
  Q3_ENGINEERING: 3,
  Q4_HIGH_ASSURANCE: 4,
});

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
const CAPABILITY_PATTERN = /^[A-Z][A-Z0-9_]*(\.[A-Z][A-Z0-9_]*)+$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const VALID_STATUSES = new Set(Object.values(DIGITAL_EMPLOYEE_STATUS));
const VALID_QUALIFICATIONS = new Set(Object.values(QUALIFICATION_LEVEL));
const VALID_RISK_CLASSES = new Set(['low', 'medium', 'high', 'critical']);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validText(value, min = 2) {
  return typeof value === 'string' && value.trim().length >= min;
}

function validateStringArray(value, { required = false } = {}) {
  if (value === undefined && !required) return true;
  return Array.isArray(value)
    && (!required || value.length > 0)
    && value.every((entry) => typeof entry === 'string' && entry.trim().length > 0);
}

function validateCapabilityName(value) {
  return typeof value === 'string' && value !== '*' && CAPABILITY_PATTERN.test(value);
}

function normalizeArray(value = []) {
  return Object.freeze(value.map((entry) => entry.trim()));
}

function normalizeCapabilities(value = {}) {
  return Object.freeze({ ...value });
}

function uniqueErrors(errors) {
  return [...new Set(errors)];
}

export function validateDigitalEmployeeDefinition(input) {
  const errors = [];

  if (!isObject(input)) {
    return { ok: false, errors: ['DIGITAL_EMPLOYEE_DEFINITION_REQUIRED'] };
  }

  if (typeof input.id !== 'string' || !ID_PATTERN.test(input.id)) errors.push('INVALID_DIGITAL_EMPLOYEE_ID');
  if (!validText(input.name)) errors.push('INVALID_DIGITAL_EMPLOYEE_NAME');
  if (!validText(input.role)) errors.push('INVALID_DIGITAL_EMPLOYEE_ROLE');
  if (!validText(input.department)) errors.push('INVALID_DIGITAL_EMPLOYEE_DEPARTMENT');
  if (!validText(input.mission, 5)) errors.push('INVALID_DIGITAL_EMPLOYEE_MISSION');
  if (!validateStringArray(input.responsibilities, { required: true })) errors.push('RESPONSIBILITIES_REQUIRED');

  const status = input.status ?? DIGITAL_EMPLOYEE_STATUS.PROPOSED;
  if (!VALID_STATUSES.has(status)) errors.push('INVALID_DIGITAL_EMPLOYEE_STATUS');

  const qualificationLevel = input.qualificationLevel ?? QUALIFICATION_LEVEL.Q0_EXPERIMENTAL;
  if (!VALID_QUALIFICATIONS.has(qualificationLevel)) errors.push('INVALID_QUALIFICATION_LEVEL');

  if (
    status === DIGITAL_EMPLOYEE_STATUS.ACTIVE
    && qualificationLevel === QUALIFICATION_LEVEL.Q0_EXPERIMENTAL
  ) {
    errors.push('ACTIVE_EMPLOYEE_REQUIRES_QUALIFICATION');
  }

  if (!isObject(input.capabilities)) {
    errors.push('CAPABILITIES_REQUIRED');
  } else {
    for (const [capability, authority] of Object.entries(input.capabilities)) {
      if (!validateCapabilityName(capability)) errors.push('INVALID_CAPABILITY');
      if (
        !Number.isInteger(authority)
        || authority < AUTHORITY.OBSERVE
        || authority > AUTHORITY.AUTONOMOUS_EXECUTION
      ) {
        errors.push('INVALID_AUTHORITY_LEVEL');
      }
    }
  }

  for (const [field, code] of [
    ['skills', 'INVALID_SKILLS'],
    ['tools', 'INVALID_TOOLS'],
    ['kpis', 'INVALID_KPIS'],
    ['escalationPaths', 'INVALID_ESCALATION_PATHS'],
  ]) {
    if (!validateStringArray(input[field])) errors.push(code);
  }

  if (
    input.responsibilityContractId !== undefined
    && (typeof input.responsibilityContractId !== 'string' || !ID_PATTERN.test(input.responsibilityContractId))
  ) {
    errors.push('INVALID_RESPONSIBILITY_CONTRACT_ID');
  }

  return { ok: errors.length === 0, errors: uniqueErrors(errors) };
}

export function createDigitalEmployeeDefinition(input) {
  const validation = validateDigitalEmployeeDefinition(input);
  if (!validation.ok) {
    throw new Error(`DIGITAL_EMPLOYEE_DEFINITION_INVALID:${validation.errors.join(',')}`);
  }

  return Object.freeze({
    id: input.id,
    name: input.name.trim(),
    role: input.role.trim(),
    department: input.department.trim(),
    mission: input.mission.trim(),
    responsibilities: normalizeArray(input.responsibilities),
    responsibilityContractId: input.responsibilityContractId,
    qualificationLevel: input.qualificationLevel ?? QUALIFICATION_LEVEL.Q0_EXPERIMENTAL,
    status: input.status ?? DIGITAL_EMPLOYEE_STATUS.PROPOSED,
    skills: normalizeArray(input.skills),
    tools: normalizeArray(input.tools),
    kpis: normalizeArray(input.kpis),
    escalationPaths: normalizeArray(input.escalationPaths),
    capabilities: normalizeCapabilities(input.capabilities),
    version: input.version || '1.0.0',
  });
}

export function validateResponsibilityContract(input) {
  const errors = [];

  if (!isObject(input)) {
    return { ok: false, errors: ['RESPONSIBILITY_CONTRACT_REQUIRED'] };
  }

  if (typeof input.id !== 'string' || !ID_PATTERN.test(input.id)) errors.push('INVALID_RESPONSIBILITY_CONTRACT_ID');
  if (!validText(input.role)) errors.push('INVALID_RESPONSIBILITY_ROLE');
  if (!validText(input.mission, 5)) errors.push('INVALID_RESPONSIBILITY_MISSION');
  if (!validateStringArray(input.outcomes, { required: true })) errors.push('RESPONSIBILITY_OUTCOMES_REQUIRED');

  const actionFields = ['autonomousActions', 'approvalRequiredActions', 'prohibitedActions'];
  const seen = new Set();
  let hasActionConflict = false;

  for (const field of actionFields) {
    const actions = input[field] ?? [];
    if (!validateStringArray(actions)) {
      errors.push('INVALID_RESPONSIBILITY_ACTIONS');
      continue;
    }

    for (const action of actions) {
      if (!validateCapabilityName(action)) errors.push('INVALID_CAPABILITY');
      if (seen.has(action)) hasActionConflict = true;
      seen.add(action);
    }
  }

  if (hasActionConflict) errors.push('RESPONSIBILITY_ACTION_CONFLICT');
  if (!validateStringArray(input.escalationConditions)) errors.push('INVALID_ESCALATION_CONDITIONS');

  return { ok: errors.length === 0, errors: uniqueErrors(errors) };
}

export function createResponsibilityContract(input) {
  const validation = validateResponsibilityContract(input);
  if (!validation.ok) {
    throw new Error(`RESPONSIBILITY_CONTRACT_INVALID:${validation.errors.join(',')}`);
  }

  return Object.freeze({
    id: input.id,
    role: input.role.trim(),
    mission: input.mission.trim(),
    outcomes: normalizeArray(input.outcomes),
    autonomousActions: normalizeArray(input.autonomousActions),
    approvalRequiredActions: normalizeArray(input.approvalRequiredActions),
    prohibitedActions: normalizeArray(input.prohibitedActions),
    escalationConditions: normalizeArray(input.escalationConditions),
    version: input.version || '1.0.0',
  });
}

export function validateSkillDefinition(input) {
  const errors = [];

  if (!isObject(input)) {
    return { ok: false, errors: ['SKILL_DEFINITION_REQUIRED'] };
  }

  if (typeof input.id !== 'string' || !ID_PATTERN.test(input.id)) errors.push('INVALID_SKILL_ID');
  if (!validText(input.name)) errors.push('INVALID_SKILL_NAME');
  if (typeof input.version !== 'string' || !SEMVER_PATTERN.test(input.version)) errors.push('INVALID_SKILL_VERSION');
  if (!VALID_RISK_CLASSES.has(input.riskClass)) errors.push('INVALID_SKILL_RISK_CLASS');
  if (!VALID_QUALIFICATIONS.has(input.minimumQualification)) errors.push('INVALID_SKILL_QUALIFICATION');

  if (!validateStringArray(input.capabilities, { required: true })) {
    errors.push('SKILL_CAPABILITIES_REQUIRED');
  } else if (input.capabilities.some((capability) => !validateCapabilityName(capability))) {
    errors.push('INVALID_CAPABILITY');
  }

  if (!validateStringArray(input.evidenceRequirements)) errors.push('INVALID_EVIDENCE_REQUIREMENTS');

  return { ok: errors.length === 0, errors: uniqueErrors(errors) };
}

export function createSkillDefinition(input) {
  const validation = validateSkillDefinition(input);
  if (!validation.ok) {
    throw new Error(`SKILL_DEFINITION_INVALID:${validation.errors.join(',')}`);
  }

  return Object.freeze({
    id: input.id,
    name: input.name.trim(),
    version: input.version,
    riskClass: input.riskClass,
    minimumQualification: input.minimumQualification,
    capabilities: normalizeArray(input.capabilities),
    evidenceRequirements: normalizeArray(input.evidenceRequirements),
  });
}
