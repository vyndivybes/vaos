import {
  DIGITAL_EMPLOYEE_STATUS,
  QUALIFICATION_LEVEL,
  createDigitalEmployeeDefinition,
} from '../../packages/contracts/digital-employee.mjs';
import { createEventBus } from './event-bus.mjs';

const RETIREABLE = new Set([
  DIGITAL_EMPLOYEE_STATUS.PROPOSED,
  DIGITAL_EMPLOYEE_STATUS.TRAINING,
  DIGITAL_EMPLOYEE_STATUS.QUALIFIED,
  DIGITAL_EMPLOYEE_STATUS.ACTIVE,
  DIGITAL_EMPLOYEE_STATUS.RESTRICTED,
  DIGITAL_EMPLOYEE_STATUS.RETRAINING,
]);

function cloneEmployee(employee) {
  if (!employee) return null;
  return {
    ...employee,
    responsibilities: [...employee.responsibilities],
    skills: [...employee.skills],
    tools: [...employee.tools],
    kpis: [...employee.kpis],
    escalationPaths: [...employee.escalationPaths],
    capabilities: { ...employee.capabilities },
    qualificationRecord: employee.qualificationRecord
      ? { ...employee.qualificationRecord }
      : undefined,
  };
}

function freezeEmployee(employee) {
  return Object.freeze({
    ...employee,
    responsibilities: Object.freeze([...employee.responsibilities]),
    skills: Object.freeze([...employee.skills]),
    tools: Object.freeze([...employee.tools]),
    kpis: Object.freeze([...employee.kpis]),
    escalationPaths: Object.freeze([...employee.escalationPaths]),
    capabilities: Object.freeze({ ...employee.capabilities }),
    qualificationRecord: employee.qualificationRecord
      ? Object.freeze({ ...employee.qualificationRecord })
      : undefined,
  });
}

export function createDigitalWorkforceRegistry({
  eventBus,
  now = () => new Date().toISOString(),
} = {}) {
  const events = eventBus || createEventBus({ now });
  const employees = new Map();

  function requireEmployee(employeeId) {
    const employee = employees.get(employeeId);
    if (!employee) throw new Error('DIGITAL_EMPLOYEE_NOT_FOUND');
    return employee;
  }

  function setEmployee(employee) {
    const frozen = freezeEmployee(employee);
    employees.set(frozen.id, frozen);
    return cloneEmployee(frozen);
  }

  function assertTransition(employee, target, allowedFrom) {
    if (!allowedFrom.has(employee.status)) {
      throw new Error(`INVALID_DIGITAL_EMPLOYEE_TRANSITION:${employee.status}->${target}`);
    }
  }

  function emit(type, employee, payload = {}) {
    events.publish({
      type,
      source: 'vaos-digital-workforce',
      payload: {
        employeeId: employee.id,
        role: employee.role,
        department: employee.department,
        ...payload,
      },
    });
  }

  function propose(input) {
    const normalized = createDigitalEmployeeDefinition({
      ...input,
      status: DIGITAL_EMPLOYEE_STATUS.PROPOSED,
      qualificationLevel: input.qualificationLevel ?? QUALIFICATION_LEVEL.Q0_EXPERIMENTAL,
    });

    if (employees.has(normalized.id)) throw new Error('DIGITAL_EMPLOYEE_REGISTRATION_CONFLICT');

    const employee = setEmployee(normalized);
    emit('WORKFORCE.DIGITAL_EMPLOYEE.PROPOSED', employee);
    return employee;
  }

  function startTraining(employeeId) {
    const employee = requireEmployee(employeeId);
    assertTransition(
      employee,
      DIGITAL_EMPLOYEE_STATUS.TRAINING,
      new Set([DIGITAL_EMPLOYEE_STATUS.PROPOSED]),
    );

    const updated = setEmployee({
      ...employee,
      status: DIGITAL_EMPLOYEE_STATUS.TRAINING,
    });
    emit('WORKFORCE.DIGITAL_EMPLOYEE.TRAINING_STARTED', updated);
    return updated;
  }

  function qualify(employeeId, { level, qualifiedBy } = {}) {
    const employee = requireEmployee(employeeId);
    assertTransition(
      employee,
      DIGITAL_EMPLOYEE_STATUS.QUALIFIED,
      new Set([DIGITAL_EMPLOYEE_STATUS.TRAINING, DIGITAL_EMPLOYEE_STATUS.RETRAINING]),
    );

    if (
      !Number.isInteger(level)
      || level < QUALIFICATION_LEVEL.Q1_GENERAL
      || level > QUALIFICATION_LEVEL.Q4_HIGH_ASSURANCE
    ) {
      throw new Error('INVALID_QUALIFICATION_LEVEL');
    }
    if (typeof qualifiedBy !== 'string' || !qualifiedBy.trim()) {
      throw new Error('QUALIFICATION_AUTHORITY_REQUIRED');
    }

    const updated = setEmployee({
      ...employee,
      status: DIGITAL_EMPLOYEE_STATUS.QUALIFIED,
      qualificationLevel: level,
      qualificationRecord: {
        qualifiedBy: qualifiedBy.trim(),
        qualifiedAt: now(),
        level,
      },
    });

    emit('WORKFORCE.DIGITAL_EMPLOYEE.QUALIFIED', updated, {
      qualificationLevel: level,
      qualifiedBy: qualifiedBy.trim(),
    });
    return updated;
  }

  function activate(employeeId) {
    const employee = requireEmployee(employeeId);
    assertTransition(
      employee,
      DIGITAL_EMPLOYEE_STATUS.ACTIVE,
      new Set([DIGITAL_EMPLOYEE_STATUS.QUALIFIED]),
    );

    if (employee.qualificationLevel < QUALIFICATION_LEVEL.Q1_GENERAL) {
      throw new Error('DIGITAL_EMPLOYEE_NOT_QUALIFIED');
    }

    const updated = setEmployee({
      ...employee,
      status: DIGITAL_EMPLOYEE_STATUS.ACTIVE,
    });
    emit('WORKFORCE.DIGITAL_EMPLOYEE.ACTIVATED', updated, {
      qualificationLevel: updated.qualificationLevel,
    });
    return updated;
  }

  function restrict(employeeId, { reason } = {}) {
    const employee = requireEmployee(employeeId);
    assertTransition(
      employee,
      DIGITAL_EMPLOYEE_STATUS.RESTRICTED,
      new Set([DIGITAL_EMPLOYEE_STATUS.ACTIVE]),
    );

    if (typeof reason !== 'string' || !reason.trim()) throw new Error('RESTRICTION_REASON_REQUIRED');

    const updated = setEmployee({
      ...employee,
      status: DIGITAL_EMPLOYEE_STATUS.RESTRICTED,
    });
    emit('WORKFORCE.DIGITAL_EMPLOYEE.RESTRICTED', updated, { reason: reason.trim() });
    return updated;
  }

  function startRetraining(employeeId, { reason } = {}) {
    const employee = requireEmployee(employeeId);
    assertTransition(
      employee,
      DIGITAL_EMPLOYEE_STATUS.RETRAINING,
      new Set([DIGITAL_EMPLOYEE_STATUS.RESTRICTED]),
    );

    if (typeof reason !== 'string' || !reason.trim()) throw new Error('RETRAINING_REASON_REQUIRED');

    const updated = setEmployee({
      ...employee,
      status: DIGITAL_EMPLOYEE_STATUS.RETRAINING,
    });
    emit('WORKFORCE.DIGITAL_EMPLOYEE.RETRAINING_STARTED', updated, { reason: reason.trim() });
    return updated;
  }

  function retire(employeeId, { reason } = {}) {
    const employee = requireEmployee(employeeId);
    assertTransition(employee, DIGITAL_EMPLOYEE_STATUS.RETIRED, RETIREABLE);

    if (typeof reason !== 'string' || !reason.trim()) throw new Error('RETIREMENT_REASON_REQUIRED');

    const updated = setEmployee({
      ...employee,
      status: DIGITAL_EMPLOYEE_STATUS.RETIRED,
    });
    emit('WORKFORCE.DIGITAL_EMPLOYEE.RETIRED', updated, { reason: reason.trim() });
    return updated;
  }

  function get(employeeId) {
    return cloneEmployee(requireEmployee(employeeId));
  }

  function list() {
    return [...employees.values()].map(cloneEmployee);
  }

  function snapshot() {
    const workforce = list();
    return {
      digitalEmployees: workforce,
      metrics: {
        totalDigitalEmployees: workforce.length,
        activeDigitalEmployees: workforce.filter((employee) => employee.status === DIGITAL_EMPLOYEE_STATUS.ACTIVE).length,
        restrictedDigitalEmployees: workforce.filter((employee) => employee.status === DIGITAL_EMPLOYEE_STATUS.RESTRICTED).length,
        retrainingDigitalEmployees: workforce.filter((employee) => employee.status === DIGITAL_EMPLOYEE_STATUS.RETRAINING).length,
        retiredDigitalEmployees: workforce.filter((employee) => employee.status === DIGITAL_EMPLOYEE_STATUS.RETIRED).length,
      },
    };
  }

  return Object.freeze({
    propose,
    startTraining,
    qualify,
    activate,
    restrict,
    startRetraining,
    retire,
    get,
    list,
    snapshot,
    events,
  });
}
