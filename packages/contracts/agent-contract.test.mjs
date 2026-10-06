import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTHORITY,
  createAgentDefinition,
  validateAgentDefinition,
} from './agent.mjs';

test('authority contract exposes only L0 through L5', () => {
  assert.deepEqual(AUTHORITY, {
    OBSERVE: 0,
    ANALYSE: 1,
    RECOMMEND: 2,
    PREPARE: 3,
    APPROVED_EXECUTION: 4,
    AUTONOMOUS_EXECUTION: 5,
  });
});

test('agent definitions require identity and capability-scoped authority', () => {
  const agent = createAgentDefinition({
    id: 'qa-agent',
    name: 'QA / CAPA Agent',
    domain: 'quality',
    capabilities: {
      'QA.OPEN_CAPA': AUTHORITY.APPROVED_EXECUTION,
      'QA.READ_NCR': AUTHORITY.AUTONOMOUS_EXECUTION,
    },
  });

  assert.equal(agent.id, 'qa-agent');
  assert.equal(agent.capabilities['QA.OPEN_CAPA'], 4);
  assert.equal(validateAgentDefinition(agent).ok, true);
});

test('agent definitions reject blanket or out-of-range authority', () => {
  assert.equal(validateAgentDefinition({
    id: 'bad',
    name: 'Bad Agent',
    domain: 'test',
    capabilities: { '*': 5 },
  }).ok, false);

  assert.equal(validateAgentDefinition({
    id: 'bad',
    name: 'Bad Agent',
    domain: 'test',
    capabilities: { 'QA.OPEN_CAPA': 6 },
  }).ok, false);
});
