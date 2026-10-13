import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_DEFINITIONS } from '../runtime/development-runtime.mjs';
import {
  DEPARTMENT_AUDIT_SCOPES,
  assessDepartmentAuditEvidence,
  getDepartmentAuditScope,
} from './department-audit.mjs';

const allIds = AGENT_DEFINITIONS.map(agent => agent.id).sort();
const exampleEvidence = {
  environment: 'authenticated-production-readonly',
  deployedCommit: 'verified-release-sha',
  observedAt: '2026-10-13T00:00:00Z',
  browserEvidenceRef: 'private-evidence:browser-001',
  canonicalSourceRef: 'private-evidence:source-001',
  independentReviewer: 'qualified-reviewer',
  checks: {
    navigation: true, ui: true, responsive: true, permissions: true,
    records: true, displays: true, reconciliation: true, errorStates: true,
    ledger: true,
  },
};

test('audit scopes cover exactly the existing sixteen workforce identities, without duplicates', () => {
  assert.deepEqual(Object.keys(DEPARTMENT_AUDIT_SCOPES).sort(), allIds);
  for (const employeeId of allIds) {
    const scope = getDepartmentAuditScope(employeeId);
    assert.ok(scope);
    assert.equal(scope.employeeId, employeeId);
    assert.ok(scope.pages.length > 0);
    assert.equal(new Set(scope.pages.map(page => page.route)).size, scope.pages.length);
    assert.ok(scope.pages.every(page => page.route.startsWith('/command/') || page.route.startsWith('/agent-') || page.route.startsWith('/mission-')));
  }
});

test('a physical engineering HOLD must not block an unrelated read-only UI/ledger audit', () => {
  const page = getDepartmentAuditScope('inventory').pages[0];
  const result = assessDepartmentAuditEvidence({
    employeeId: 'inventory', route: page.route,
    physicalReleaseHold: 'UNVALIDATED_LAMINATE_AND_TOOLING',
    evidence: { ...exampleEvidence, reviewer: 'different-from-inventory' },
  });
  assert.equal(result.status, 'READY_FOR_INDEPENDENT_REVIEW');
  assert.equal(result.productionWriteAuthorized, false);
  assert.equal(result.releaseHoldPreserved, true);
});

test('source or UI discrepancies generate findings rather than a false qualification PASS', () => {
  const page = getDepartmentAuditScope('finance').pages[0];
  const result = assessDepartmentAuditEvidence({
    employeeId: 'finance', route: page.route,
    evidence: {
      ...exampleEvidence, checks: { ...exampleEvidence.checks, reconciliation: false },
    },
  });
  assert.equal(result.status, 'FINDING');
  assert.match(result.reason, /RECONCILIATION/i);
  assert.equal(result.productionWriteAuthorized, false);
});

test('missing authenticated browser evidence, canonical source, or independent review must HOLD', () => {
  const page = getDepartmentAuditScope('people').pages[0];
  for (const missing of ['browserEvidenceRef', 'canonicalSourceRef', 'independentReviewer', 'deployedCommit']) {
    const evidence = { ...exampleEvidence };
    delete evidence[missing];
    const result = assessDepartmentAuditEvidence({ employeeId: 'people', route: page.route, evidence });
    assert.equal(result.status, 'HOLD', missing);
  }
});

test('missing checks must not be inferred as passing', () => {
  const page = getDepartmentAuditScope('qa').pages[0];
  const evidence = { ...exampleEvidence, checks: { ...exampleEvidence.checks } };
  delete evidence.checks.errorStates;
  const result = assessDepartmentAuditEvidence({ employeeId: 'qa', route: page.route, evidence });
  assert.equal(result.status, 'HOLD');
});

test('employee may audit only assigned pages; invalid scope is denied', () => {
  assert.equal(assessDepartmentAuditEvidence({
    employeeId: 'finance', route: '/command/inventory', evidence: exampleEvidence,
  }).status, 'DENY');
  assert.equal(assessDepartmentAuditEvidence({
    employeeId: 'unknown', route: '/command/finance', evidence: exampleEvidence,
  }).status, 'DENY');
});

test('audit cannot be self-certified, and a readiness result is never a live qualification certificate', () => {
  const page = getDepartmentAuditScope('knowledge').pages[0];
  const denied = assessDepartmentAuditEvidence({
    employeeId: 'knowledge', route: page.route,
    evidence: { ...exampleEvidence, independentReviewer: 'knowledge' },
  });
  assert.equal(denied.status, 'HOLD');
  const candidate = assessDepartmentAuditEvidence({
    employeeId: 'knowledge', route: page.route, evidence: exampleEvidence,
  });
  assert.equal(candidate.status, 'READY_FOR_INDEPENDENT_REVIEW');
  assert.notEqual(candidate.status, 'QUALIFIED');
  assert.equal(candidate.productionWriteAuthorized, false);
});

test('unneeded ledger does not block an informational page, while financial ledger proof is mandatory', () => {
  const info = getDepartmentAuditScope('knowledge').pages.find(page => !page.requiresLedger);
  assert.ok(info);
  const withoutLedger = { ...exampleEvidence, checks: { ...exampleEvidence.checks } };
  delete withoutLedger.checks.ledger;
  assert.equal(assessDepartmentAuditEvidence({ employeeId: 'knowledge', route: info.route, evidence: withoutLedger }).status, 'READY_FOR_INDEPENDENT_REVIEW');
  const financial = getDepartmentAuditScope('finance').pages.find(page => page.requiresLedger);
  assert.ok(financial);
  assert.equal(assessDepartmentAuditEvidence({ employeeId: 'finance', route: financial.route, evidence: withoutLedger }).status, 'HOLD');
});
