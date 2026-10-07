import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCommand } from './command-router.mjs';

test('command router navigates to enterprise modules using natural phrases', () => {
  assert.deepEqual(resolveCommand('open engineering'), { kind: 'navigate', view: 'engineering' });
  assert.deepEqual(resolveCommand('show approvals'), { kind: 'navigate', view: 'approvals' });
  assert.deepEqual(resolveCommand('go to evidence'), { kind: 'navigate', view: 'evidence' });
  assert.deepEqual(resolveCommand('agent control'), { kind: 'navigate', view: 'agents' });
});

test('command router creates governed QA CAPA intent', () => {
  assert.deepEqual(resolveCommand('open capa CAPA-025'), {
    kind: 'intent',
    targetView: 'qa-capa',
    agentId: 'qa',
    actionType: 'QA.OPEN_CAPA',
    risk: 'medium',
    payload: { capaId: 'CAPA-025' },
  });
});

test('command router creates governed engineering baseline intent', () => {
  assert.deepEqual(resolveCommand('change baseline 5.4'), {
    kind: 'intent',
    targetView: 'engineering',
    agentId: 'vibpe',
    actionType: 'ENGINEERING.BASELINE_CHANGE',
    risk: 'high',
    payload: { baseline: '5.4' },
  });
});

test('command router creates governed project risk escalation intent', () => {
  assert.deepEqual(resolveCommand('escalate risk RSK-014'), {
    kind: 'intent',
    targetView: 'risk',
    agentId: 'risk',
    actionType: 'PROJECT.ESCALATE_RISK',
    risk: 'medium',
    payload: { riskId: 'RSK-014' },
  });
});

test('command router does not guess unsupported commands', () => {
  assert.deepEqual(resolveCommand('delete all evidence'), {
    kind: 'unknown',
    query: 'delete all evidence',
  });
  assert.deepEqual(resolveCommand(''), {
    kind: 'unknown',
    query: '',
  });
});
