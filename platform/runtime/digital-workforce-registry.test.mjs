import test from 'node:test';
import assert from 'node:assert/strict';

import { AUTHORITY } from '../../packages/contracts/agent.mjs';
import {
  DIGITAL_EMPLOYEE_STATUS,
  QUALIFICATION_LEVEL,
} from '../../packages/contracts/digital-employee.mjs';
import { createDigitalWorkforceRegistry } from './digital-workforce-registry.mjs';

function candidate() {
  return {
    id: 'operations-controller',
    name: 'Operations Controller',
    role: 'Operations Controller',
    department: 'operations',
    mission: 'Maintain operational readiness within delegated authority.',
    responsibilities: ['Monitor readiness', 'Escalate material exceptions'],
    capabilities: {
      'PROJECT.ESCALATE_RISK': AUTHORITY.APPROVED_EXECUTION,
    },
  };
}

test('digital workforce registry enforces propose -> train -> qualify -> activate lifecycle', () => {
  const registry = createDigitalWorkforceRegistry();

  const proposed = registry.propose(candidate());
  assert.equal(proposed.status, DIGITAL_EMPLOYEE_STATUS.PROPOSED);

  const training = registry.startTraining('operations-controller');
  assert.equal(training.status, DIGITAL_EMPLOYEE_STATUS.TRAINING);

  const qualified = registry.qualify('operations-controller', {
    level: QUALIFICATION_LEVEL.Q2_BUSINESS,
    qualifiedBy: 'human:operations-director',
  });
  assert.equal(qualified.status, DIGITAL_EMPLOYEE_STATUS.QUALIFIED);
  assert.equal(qualified.qualificationLevel, QUALIFICATION_LEVEL.Q2_BUSINESS);

  const active = registry.activate('operations-controller');
  assert.equal(active.status, DIGITAL_EMPLOYEE_STATUS.ACTIVE);

  assert.deepEqual(
    registry.events.history({ type: 'WORKFORCE.DIGITAL_EMPLOYEE.*' }).map((event) => event.type),
    [
      'WORKFORCE.DIGITAL_EMPLOYEE.PROPOSED',
      'WORKFORCE.DIGITAL_EMPLOYEE.TRAINING_STARTED',
      'WORKFORCE.DIGITAL_EMPLOYEE.QUALIFIED',
      'WORKFORCE.DIGITAL_EMPLOYEE.ACTIVATED',
    ],
  );
});

test('digital workforce registry refuses activation before qualification', () => {
  const registry = createDigitalWorkforceRegistry();
  registry.propose(candidate());

  assert.throws(
    () => registry.activate('operations-controller'),
    /INVALID_DIGITAL_EMPLOYEE_TRANSITION:PROPOSED->ACTIVE/,
  );
});

test('restricted employee can be retrained, requalified and reactivated', () => {
  const registry = createDigitalWorkforceRegistry();
  registry.propose(candidate());
  registry.startTraining('operations-controller');
  registry.qualify('operations-controller', {
    level: QUALIFICATION_LEVEL.Q2_BUSINESS,
    qualifiedBy: 'human:operations-director',
  });
  registry.activate('operations-controller');

  const restricted = registry.restrict('operations-controller', { reason: 'benchmark regression' });
  assert.equal(restricted.status, DIGITAL_EMPLOYEE_STATUS.RESTRICTED);

  const retraining = registry.startRetraining('operations-controller', { reason: 'benchmark regression' });
  assert.equal(retraining.status, DIGITAL_EMPLOYEE_STATUS.RETRAINING);

  const requalified = registry.qualify('operations-controller', {
    level: QUALIFICATION_LEVEL.Q3_ENGINEERING,
    qualifiedBy: 'human:qualification-authority',
  });
  assert.equal(requalified.status, DIGITAL_EMPLOYEE_STATUS.QUALIFIED);
  assert.equal(requalified.qualificationLevel, QUALIFICATION_LEVEL.Q3_ENGINEERING);

  assert.equal(registry.activate('operations-controller').status, DIGITAL_EMPLOYEE_STATUS.ACTIVE);
});

test('retired employee cannot return to service and snapshot exposes workforce state', () => {
  const registry = createDigitalWorkforceRegistry();
  registry.propose(candidate());
  registry.startTraining('operations-controller');
  registry.qualify('operations-controller', {
    level: QUALIFICATION_LEVEL.Q2_BUSINESS,
    qualifiedBy: 'human:operations-director',
  });
  registry.activate('operations-controller');
  registry.retire('operations-controller', { reason: 'role superseded' });

  assert.throws(
    () => registry.startTraining('operations-controller'),
    /INVALID_DIGITAL_EMPLOYEE_TRANSITION:RETIRED->TRAINING/,
  );

  const snapshot = registry.snapshot();
  assert.equal(snapshot.metrics.totalDigitalEmployees, 1);
  assert.equal(snapshot.metrics.retiredDigitalEmployees, 1);
  assert.equal(snapshot.metrics.activeDigitalEmployees, 0);
});
