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

test('command router creates explicit approval-gated Risk qualification evidence intent', () => {
  assert.deepEqual(resolveCommand('qualification risk RSK-014'), {
    kind: 'intent',
    targetView: 'risk',
    agentId: 'risk',
    actionType: 'PROJECT.ESCALATE_RISK',
    risk: 'medium',
    payload: { riskId: 'RSK-014', qualificationMode: true },
  });
});

test('command router creates explicit Risk recovery qualification drill intent', () => {
  assert.deepEqual(resolveCommand('qualification risk recovery RSK-015'), {
    kind: 'intent',
    targetView: 'risk',
    agentId: 'risk',
    actionType: 'PROJECT.ESCALATE_RISK',
    risk: 'medium',
    payload: {
      riskId: 'RSK-015',
      qualificationMode: true,
      qualificationRecoveryDrill: true,
    },
  });
});

test('command router can bind the Risk recovery drill to an explicit engineering baseline trace target', () => {
  assert.deepEqual(resolveCommand('qualification risk recovery RSK-015 link baseline 5.3.9'), {
    kind: 'intent',
    targetView: 'risk',
    agentId: 'risk',
    actionType: 'PROJECT.ESCALATE_RISK',
    risk: 'medium',
    payload: {
      riskId: 'RSK-015',
      qualificationMode: true,
      qualificationRecoveryDrill: true,
      qualificationTrace: {
        targetDomain: 'ENGINEERING_BASELINE',
        targetResourceId: '5.3.9',
        relationType: 'MITIGATES_RISK',
      },
    },
  });
});

test('command router supports Security Q4 qualification observations', () => {
  assert.deepEqual(resolveCommand('qualification security SEC-Q4-001'), {
    kind: 'intent',
    targetView: 'governance',
    agentId: 'security',
    actionType: 'SECURITY.OBSERVE_IDENTITY',
    risk: 'high',
    payload: { observationId: 'SEC-Q4-001', qualificationMode: true },
  });
});

test('command router supports final Security Q4 recovery and cross-domain trace drill', () => {
  assert.deepEqual(resolveCommand('qualification security recovery SEC-Q4-003 link risk RSK-015 baseline 5.3.9'), {
    kind: 'intent',
    targetView: 'governance',
    agentId: 'security',
    actionType: 'SECURITY.OBSERVE_IDENTITY',
    risk: 'high',
    payload: {
      observationId: 'SEC-Q4-003',
      qualificationMode: true,
      qualificationRecoveryDrill: true,
      qualificationTrace: {
        sourceRiskId: 'RSK-015',
        targetBaseline: '5.3.9',
        relationType: 'RELATED_TO',
      },
    },
  });
});

test('command router exposes ordinary Security observation so training fail-closed behavior can be proven', () => {
  assert.deepEqual(resolveCommand('observe identity SEC-DENY-001'), {
    kind: 'intent',
    targetView: 'governance',
    agentId: 'security',
    actionType: 'SECURITY.OBSERVE_IDENTITY',
    risk: 'high',
    payload: { observationId: 'SEC-DENY-001' },
  });
});

