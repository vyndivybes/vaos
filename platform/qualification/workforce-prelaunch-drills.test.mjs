import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_DEFINITIONS } from '../runtime/development-runtime.mjs';
import { createDurableControlService } from '../services/durable-control-service.mjs';

// Isolated control-boundary exercises. No live source, model training, role
// promotion, business effect or production commissioning follows from a pass.
const drills = [
  ['orchestrator', 'PROJECT.ESCALATE_RISK', 'AUTHORIZED'],
  ['vibpe', 'ENGINEERING.BASELINE_CHANGE', 'AWAIT_APPROVAL'],
  ['qa', 'QA.OPEN_CAPA', 'AWAIT_APPROVAL'],
  ['risk', 'PROJECT.ESCALATE_RISK', 'AWAIT_APPROVAL'],
  ['release', 'RELEASE.OBSERVE_GATE', 'PREPARED'],
  ['project', 'PROJECT.ESCALATE_RISK', 'AWAIT_APPROVAL'],
  ['security', 'SECURITY.OBSERVE_IDENTITY', 'AWAIT_APPROVAL'],
  ['knowledge', 'KNOWLEDGE.READ_GRAPH', 'PREPARED'],
  ['commercial', 'COMMERCIAL.OBSERVE_PIPELINE', 'AUTHORIZED'],
  ['procurement', 'PROCUREMENT.OBSERVE_SHORTAGE', 'AUTHORIZED'],
  ['inventory', 'INVENTORY.OBSERVE_STOCK', 'AUTHORIZED'],
  ['production', 'PRODUCTION.OBSERVE_WIP', 'AUTHORIZED'],
  ['maintenance', 'MAINTENANCE.OBSERVE_ASSET', 'AUTHORIZED'],
  ['finance', 'FINANCE.OBSERVE_LEDGER', 'AUTHORIZED'],
  ['people', 'PEOPLE.OBSERVE_WORKFORCE', 'AUTHORIZED'],
  ['engineering-configuration', 'ENGINEERING.OBSERVE_CONFIGURATION', 'AUTHORIZED'],
];

function isolatedService(id, status) {
  const persisted = [];
  const service = createDurableControlService({ store: {
    async getDigitalEmployee(requestedId) {
      assert.equal(requestedId, id);
      return { id, status, qualificationLevel: 4 };
    },
    async submitIntent(input) {
      persisted.push(input);
      return { outcome: 'CREATED', approvalId: input.result.status === 'AWAIT_APPROVAL' ? 'synthetic-approval' : null };
    },
  } });
  return { persisted, service };
}

test('prelaunch exercises cover exactly the current sixteen identities', () => {
  assert.deepEqual(drills.map(([id]) => id).sort(), AGENT_DEFINITIONS.map(a => a.id).sort());
});

for (const [id, action, expected] of drills) {
  for (const [label, state, requestedAction, status, reason] of [
    ['declared task respects authority', 'ACTIVE', action, expected, null],
    ['ungranted evidence deletion is denied', 'ACTIVE', 'EVIDENCE.DELETE', 'DENIED', 'CAPABILITY_NOT_GRANTED'],
    ['training identity cannot act normally', 'TRAINING', action, 'DENIED', 'DIGITAL_EMPLOYEE_NOT_ACTIVE'],
    ['restricted identity cannot act', 'RESTRICTED', action, 'DENIED', 'DIGITAL_EMPLOYEE_NOT_ACTIVE'],
  ]) {
    test(`${id}: ${label}`, async () => {
      const { service, persisted } = isolatedService(id, state);
      const result = await service.proposeIntent({ agentId: id, actionType: requestedAction,
        risk: 'low', payload: {}, idempotencyKey: `synthetic-prelaunch:${id}:${label}` });
      assert.equal(result.status, status);
      if (reason) assert.equal(result.reason, reason);
      assert.equal(result.effectExecuted, false);
      assert.equal(persisted.length, 1);
      assert.equal(persisted[0].result.status, status);
    });
  }
}
