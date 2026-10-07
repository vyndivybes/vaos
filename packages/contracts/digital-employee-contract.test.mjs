import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DIGITAL_EMPLOYEE_STATUS,
  QUALIFICATION_LEVEL,
  createDigitalEmployeeDefinition,
  createResponsibilityContract,
  createSkillDefinition,
  validateDigitalEmployeeDefinition,
  validateResponsibilityContract,
  validateSkillDefinition,
} from './digital-employee.mjs';
import { AUTHORITY } from './agent.mjs';

test('digital employee contract exposes governed lifecycle and qualification levels', () => {
  assert.deepEqual(DIGITAL_EMPLOYEE_STATUS, {
    PROPOSED: 'PROPOSED',
    TRAINING: 'TRAINING',
    QUALIFIED: 'QUALIFIED',
    ACTIVE: 'ACTIVE',
    RESTRICTED: 'RESTRICTED',
    RETRAINING: 'RETRAINING',
    RETIRED: 'RETIRED',
  });

  assert.deepEqual(QUALIFICATION_LEVEL, {
    Q0_EXPERIMENTAL: 0,
    Q1_GENERAL: 1,
    Q2_BUSINESS: 2,
    Q3_ENGINEERING: 3,
    Q4_HIGH_ASSURANCE: 4,
  });
});

test('digital employee passport is domain-neutral and capability-governed', () => {
  const employee = createDigitalEmployeeDefinition({
    id: 'supplier-continuity-manager',
    name: 'Supplier Continuity Manager',
    role: 'Supply Continuity Manager',
    department: 'supply-network',
    mission: 'Prevent unapproved operational disruption from supply failure.',
    responsibilities: [
      'Monitor supply continuity',
      'Prepare approved mitigations',
    ],
    qualificationLevel: QUALIFICATION_LEVEL.Q2_BUSINESS,
    skills: ['supplier-risk-analysis'],
    tools: ['supplier-portal', 'erp'],
    kpis: ['disruption-prevention-rate'],
    capabilities: {
      'SUPPLY.REQUEST_QUOTE': AUTHORITY.AUTONOMOUS_EXECUTION,
      'SUPPLY.CHANGE_SUPPLIER': AUTHORITY.APPROVED_EXECUTION,
    },
  });

  assert.equal(employee.status, DIGITAL_EMPLOYEE_STATUS.PROPOSED);
  assert.equal(employee.role, 'Supply Continuity Manager');
  assert.equal(employee.qualificationLevel, 2);
  assert.equal(employee.capabilities['SUPPLY.CHANGE_SUPPLIER'], 4);
  assert.equal(validateDigitalEmployeeDefinition(employee).ok, true);
  assert.equal(Object.isFrozen(employee), true);
});

test('digital employee passport rejects blanket authority and unqualified active state', () => {
  const wildcard = validateDigitalEmployeeDefinition({
    id: 'bad-employee',
    name: 'Bad Employee',
    role: 'Bad Role',
    department: 'test',
    mission: 'Test invalid authority.',
    responsibilities: ['Test'],
    capabilities: { '*': AUTHORITY.AUTONOMOUS_EXECUTION },
  });
  assert.equal(wildcard.ok, false);
  assert.ok(wildcard.errors.includes('INVALID_CAPABILITY'));

  const unqualified = validateDigitalEmployeeDefinition({
    id: 'active-but-unqualified',
    name: 'Active But Unqualified',
    role: 'Test Role',
    department: 'test',
    mission: 'Test invalid lifecycle state.',
    responsibilities: ['Test'],
    capabilities: { 'TEST.READ_STATE': AUTHORITY.OBSERVE },
    status: DIGITAL_EMPLOYEE_STATUS.ACTIVE,
    qualificationLevel: QUALIFICATION_LEVEL.Q0_EXPERIMENTAL,
  });
  assert.equal(unqualified.ok, false);
  assert.ok(unqualified.errors.includes('ACTIVE_EMPLOYEE_REQUIRES_QUALIFICATION'));
});

test('responsibility contracts separate autonomous, approval and prohibited actions', () => {
  const contract = createResponsibilityContract({
    id: 'supply-continuity-v1',
    role: 'Supply Continuity Manager',
    mission: 'Maintain approved supply continuity.',
    outcomes: ['No unapproved supply-caused stoppage'],
    autonomousActions: ['SUPPLY.REQUEST_QUOTE'],
    approvalRequiredActions: ['SUPPLY.CHANGE_SUPPLIER'],
    prohibitedActions: ['QUALITY.OVERRIDE_HOLD'],
    escalationConditions: ['SAFETY_IMPACT', 'COST_THRESHOLD_EXCEEDED'],
  });

  assert.equal(validateResponsibilityContract(contract).ok, true);
  assert.equal(Object.isFrozen(contract), true);

  const conflicting = validateResponsibilityContract({
    ...contract,
    approvalRequiredActions: ['SUPPLY.REQUEST_QUOTE'],
  });
  assert.equal(conflicting.ok, false);
  assert.ok(conflicting.errors.includes('RESPONSIBILITY_ACTION_CONFLICT'));
});

test('skill definitions are versioned, qualified and evidence-aware', () => {
  const skill = createSkillDefinition({
    id: 'supplier-risk-analysis',
    name: 'Supplier Risk Analysis',
    version: '1.0.0',
    riskClass: 'medium',
    minimumQualification: QUALIFICATION_LEVEL.Q2_BUSINESS,
    capabilities: ['SUPPLY.READ_PERFORMANCE', 'SUPPLY.ANALYSE_RISK'],
    evidenceRequirements: ['SOURCE_REFERENCES', 'RISK_SCORE'],
  });

  assert.equal(skill.minimumQualification, 2);
  assert.deepEqual(skill.evidenceRequirements, ['SOURCE_REFERENCES', 'RISK_SCORE']);
  assert.equal(validateSkillDefinition(skill).ok, true);

  assert.equal(validateSkillDefinition({
    ...skill,
    version: 'latest',
  }).ok, false);
});


test('digital employee passport preserves operational governance metadata without granting qualification', () => {
  const employee = createDigitalEmployeeDefinition({
    id: 'finance-controller',
    name: 'Finance Controller',
    role: 'Finance Controller',
    department: 'finance',
    mission: 'Maintain governed financial visibility and escalation.',
    responsibilities: ['Monitor financial exposure'],
    capabilities: { 'FINANCE.ANALYSE_VARIANCE': AUTHORITY.ANALYSE },
    owner: 'Enterprise',
    supervisor: 'Human governance',
    autonomyLevel: AUTHORITY.ANALYSE,
    modelRequirements: { minimumQualification: 'Q2_BUSINESS' },
    costBudget: { mode: 'governed', limitConfigured: false },
    sla: { class: 'standard' },
    memoryPolicy: { scope: 'role' },
    contextPolicy: { sourceAuthority: 'required' },
    currentAssignment: 'Monitor variance',
    priority: 'HIGH',
    confidence: 88,
    heartbeatAt: null,
    evidenceRefs: ['qualification-plan:finance-controller'],
  });

  assert.equal(employee.status, DIGITAL_EMPLOYEE_STATUS.PROPOSED);
  assert.equal(employee.qualificationLevel, QUALIFICATION_LEVEL.Q0_EXPERIMENTAL);
  assert.equal(employee.autonomyLevel, AUTHORITY.ANALYSE);
  assert.equal(employee.priority, 'HIGH');
  assert.equal(employee.confidence, 88);
  assert.equal(employee.memoryPolicy.scope, 'role');
  assert.deepEqual(employee.evidenceRefs, ['qualification-plan:finance-controller']);
  assert.equal(validateDigitalEmployeeDefinition(employee).ok, true);
});

test('digital employee operational metadata rejects invalid autonomy, priority and governance objects', () => {
  const result = validateDigitalEmployeeDefinition({
    id: 'invalid-controller',
    name: 'Invalid Controller',
    role: 'Invalid Controller',
    department: 'test',
    mission: 'Exercise contract validation.',
    responsibilities: ['Validate'],
    capabilities: { 'TEST.READ_STATE': AUTHORITY.OBSERVE },
    autonomyLevel: 9,
    priority: 'IMMEDIATE',
    memoryPolicy: [],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('INVALID_AUTONOMY_LEVEL'));
  assert.ok(result.errors.includes('INVALID_PRIORITY'));
  assert.ok(result.errors.includes('INVALID_MEMORY_POLICY'));
});

test('responsibility contract carries approval thresholds and evidence requirements', () => {
  const contract = createResponsibilityContract({
    id: 'finance-controller-v1',
    role: 'Finance Controller',
    mission: 'Maintain governed financial visibility.',
    outcomes: ['Financial variance is surfaced'],
    autonomousActions: ['FINANCE.ANALYSE_VARIANCE'],
    approvalRequiredActions: ['FINANCE.RELEASE_PAYMENT'],
    prohibitedActions: [],
    escalationConditions: ['LIMIT_EXCEEDED'],
    approvalThresholds: { paymentRelease: 'human-approval' },
    evidenceRequirements: ['SOURCE_REFERENCE', 'DECISION_EVENT'],
  });

  assert.equal(contract.approvalThresholds.paymentRelease, 'human-approval');
  assert.deepEqual(contract.evidenceRequirements, ['SOURCE_REFERENCE', 'DECISION_EVENT']);
  assert.equal(validateResponsibilityContract(contract).ok, true);
});
