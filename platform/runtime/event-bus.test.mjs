import test from 'node:test';
import assert from 'node:assert/strict';

import { createEventBus } from './event-bus.mjs';

test('event bus publishes normalized immutable events with monotonic sequence', () => {
  let id = 0;
  const bus = createEventBus({
    now: () => '2026-10-07T00:00:00.000Z',
    idFactory: () => `evt-${++id}`,
  });

  const first = bus.publish({ type: 'QA.NCR_OPENED', source: 'qa-agent', payload: { ncrId: 'NCR-1' } });
  const second = bus.publish({ type: 'QA.CAPA_PROPOSED', source: 'qa-agent', payload: { capaId: 'CAPA-1' } });

  assert.equal(first.id, 'evt-1');
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(bus.history().length, 2);
});

test('event bus supports exact and namespace subscriptions', () => {
  const bus = createEventBus();
  const exact = [];
  const qa = [];

  bus.subscribe('QA.NCR_OPENED', (event) => exact.push(event.type));
  bus.subscribe('QA.*', (event) => qa.push(event.type));

  bus.publish({ type: 'QA.NCR_OPENED', source: 'qa-agent', payload: {} });
  bus.publish({ type: 'QA.CAPA_PROPOSED', source: 'qa-agent', payload: {} });
  bus.publish({ type: 'PROJECT.MILESTONE_SLIPPED', source: 'project-agent', payload: {} });

  assert.deepEqual(exact, ['QA.NCR_OPENED']);
  assert.deepEqual(qa, ['QA.NCR_OPENED', 'QA.CAPA_PROPOSED']);
});
