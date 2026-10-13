/** Existing 16 employees: governed read-only department audit admission.
 *
 * A physical material/tooling/engineering release HOLD never prevents
 * qualification exercises for an independent read-only audit. This module
 * validates evidence envelopes; it neither accesses production nor certifies
 * that an audit actually ran. Independent review and live commissioning remain
 * separate governance transitions.
 */
const assignments = [
  ['orchestrator', [
    ['/agent-supervision.html', false], ['/mission-status.html', false],
    ['/command/control-tower', false], ['/command/governance', false],
    ['/command/decision-inbox', false],
  ]],
  ['vibpe', [
    ['/command/engineering', false], ['/command/technical', false],
    ['/command/ibpe-operating-workspace', false],
  ]],
  ['qa', [
    ['/command/quality', true], ['/command/qa-verification', false],
    ['/command/epr-live', true],
  ]],
  ['risk', [
    ['/command/risk', false], ['/command/scenarios', false],
    ['/command/management-intelligence', false],
  ]],
  ['security', [
    ['/command/users', false], ['/command/governance', false],
    ['/command/recovery', false], ['/agent-supervision.html', false],
  ]],
  ['release', [
    ['/command/deployment-readiness', false],
    ['/command/uat-certification', false],
    ['/command/governance', false],
  ]],
  ['project', [
    ['/command/planning', false], ['/command/actuals', false],
    ['/command/operations', false], ['/command/control-tower', false],
  ]],
  ['knowledge', [
    ['/command/knowledge', false], ['/command/ai-knowledge', false],
    ['/command/technical', false],
  ]],
  ['commercial', [
    ['/command/sales', true], ['/command/sales-ledger', true],
    ['/command/receivables', true], ['/command/gtm', false],
  ]],
  ['procurement', [
    ['/command/procurement', false], ['/command/procurement-planning', false],
    ['/command/purchase-execution', true], ['/command/receiving', true],
  ]],
  ['inventory', [
    ['/command/inventory', true], ['/command/inventory-ledgers', true],
    ['/command/inventory-stocktake', true], ['/command/inventory-control-audit', true],
  ]],
  ['production', [
    ['/command/production', false], ['/command/production-jobcards', true],
    ['/command/epr-live', true], ['/command/manufacturing', false],
  ]],
  ['maintenance', [
    ['/command/manufacturing', true], ['/command/production', false],
  ]],
  ['finance', [
    ['/command/accounting', true], ['/command/accounting-statements', true],
    ['/command/ca-audit', true], ['/command/balance-sheet', true],
    ['/command/payables', true], ['/command/receivables', true],
    ['/command/finance-control', true], ['/command/cash', true],
  ]],
  ['people', [
    ['/command/people-office', true],
    ['/command/accounting/people-office-payments', true],
    ['/command/users', false],
  ]],
  ['engineering-configuration', [
    ['/command/bom-control', true], ['/command/bom', true],
    ['/command/bom-inventory-mapping', true], ['/command/engineering', false],
  ]],
];

export const DEPARTMENT_AUDIT_SCOPES = Object.freeze(Object.fromEntries(
  assignments.map(([employeeId, entries]) => [employeeId, Object.freeze({
    employeeId,
    scope: 'AUTHENTICATED_READ_ONLY_OR_ISOLATED_FIXTURE',
    pages: Object.freeze(entries.map(([route, requiresLedger]) =>
      Object.freeze({ route, requiresLedger }))),
  })]),
));

const baseChecks = Object.freeze([
  'navigation', 'ui', 'responsive', 'permissions',
  'records', 'displays', 'reconciliation', 'errorStates',
]);

const result = (status, reason, { releaseHoldPreserved = false, route = null } = {}) =>
  Object.freeze({
    status, reason, route,
    productionWriteAuthorized: false,
    releaseHoldPreserved,
    qualificationCertified: false,
  });

export function getDepartmentAuditScope(employeeId) {
  return DEPARTMENT_AUDIT_SCOPES[employeeId] ?? null;
}

/** Validate a proposed evidence packet. Not a browser probe or qualification. */
export function assessDepartmentAuditEvidence({
  employeeId, route, evidence, physicalReleaseHold,
} = {}) {
  const releaseHoldPreserved = Boolean(physicalReleaseHold);
  const context = { route: typeof route === 'string' ? route : null, releaseHoldPreserved };
  const scope = getDepartmentAuditScope(employeeId);
  const page = scope?.pages.find(item => item.route === route);
  if (!page) return result('DENY', 'EMPLOYEE_OR_PAGE_OUT_OF_SCOPE', context);

  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)
    || !evidence.checks || typeof evidence.checks !== 'object'
    || Array.isArray(evidence.checks)) {
    return result('HOLD', 'EVIDENCE_REQUIRED', context);
  }

  const requiredChecks = page.requiresLedger ? [...baseChecks, 'ledger'] : baseChecks;
  const discrepancies = requiredChecks.filter(check => evidence.checks[check] === false);
  if (discrepancies.length) {
    return result('FINDING', 'VERIFIED_CHECK_FAILED:' + discrepancies.join(',').toUpperCase(), context);
  }
  if (requiredChecks.some(check => evidence.checks[check] !== true)) {
    return result('HOLD', 'CHECKS_INCOMPLETE', context);
  }

  const requiredFields = [
    'environment', 'deployedCommit', 'observedAt', 'browserEvidenceRef',
    'canonicalSourceRef', 'independentReviewer',
  ];
  if (requiredFields.some(field => typeof evidence[field] !== 'string'
    || evidence[field].trim().length < 3)) {
    return result('HOLD', 'SOURCE_BROWSER_OR_REVIEW_EVIDENCE_MISSING', context);
  }
  if (!Number.isFinite(Date.parse(evidence.observedAt))) {
    return result('HOLD', 'INVALID_EVIDENCE_TIMESTAMP', context);
  }
  if (evidence.independentReviewer.trim() === employeeId) {
    return result('HOLD', 'INDEPENDENT_REVIEW_REQUIRED', context);
  }
  if (!/^authenticated-/.test(evidence.environment)) {
    return result('HOLD', 'AUTHENTICATED_ENVIRONMENT_REQUIRED', context);
  }

  return result('READY_FOR_INDEPENDENT_REVIEW', 'EVIDENCE_ENVELOPE_COMPLETE_NOT_CERTIFIED', context);
}
