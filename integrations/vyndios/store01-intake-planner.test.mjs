import test from 'node:test';
import assert from 'node:assert/strict';
import { planStore01SupplierIntake } from './store01-intake-planner.mjs';

const base = {
  eventId: 'dock-1001',
  storeId: 'STORE01',
  supplierId: 'SUP-01',
  purchaseOrderId: 'PO-101',
  poState: 'issued',
  deliveryReference: 'DC-2026-01',
  invoiceEvidenceReference: 'INVOICE-PDF-SHA256',
  observedQuantity: 10,
  qualityDisposition: 'unknown',
  coldChainRequired: false,
};

test('valid supplier arrival produces deterministic non-actuating proposals', () => {
  const plan = planStore01SupplierIntake(base);
  assert.equal(plan.disposition, 'PROPOSE_ONLY');
  assert.equal(plan.idempotencyKey, 'store01:intake:dock-1001');
  assert.deepEqual(plan.alerts, []);
  assert.deepEqual(plan.permittedSideEffects, []);
  assert.ok(plan.proposals.every(p => p.authorization !== 'AUTONOMOUS_EXECUTION'));
  assert.equal(plan.physicalMotionAuthorized, false);
  assert.equal(plan.invoiceApprovalAuthorized, false);
  assert.equal(plan.paymentAuthorized, false);
  assert.equal(plan.qualityReleaseAuthorized, false);
});

test('missing document and non-issued PO force review', () => {
  const plan = planStore01SupplierIntake({
    ...base, invoiceEvidenceReference: '', poState: 'draft', observedQuantity: 0,
  });
  assert.equal(plan.disposition, 'MANUAL_REVIEW');
  assert.ok(plan.alerts.includes('INVOICE_EVIDENCE_REQUIRED'));
  assert.ok(plan.alerts.includes('PO_NOT_ISSUED'));
  assert.ok(plan.alerts.includes('PHYSICAL_COUNT_REQUIRED'));
});

test('cold-chain materials without temperature evidence cannot be cleared', () => {
  const plan = planStore01SupplierIntake({ ...base, coldChainRequired: true });
  assert.ok(plan.alerts.includes('COLD_CHAIN_EVIDENCE_REQUIRED'));
});

test('other warehouses and fictional quality release are blocked', () => {
  const plan = planStore01SupplierIntake({ ...base, storeId: 'STORE02', qualityDisposition: 'released' });
  assert.ok(plan.alerts.includes('WRONG_STORE'));
  assert.ok(plan.alerts.includes('UNVERIFIED_QUALITY_RELEASE'));
  assert.equal(plan.physicalMotionAuthorized, false);
});

test('identity and source references must be present', () => {
  assert.throws(() => planStore01SupplierIntake({ ...base, purchaseOrderId: '' }), /STORE01_INVALID:purchaseOrderId/);
  assert.throws(() => planStore01SupplierIntake({ ...base, deliveryReference: '' }), /STORE01_INVALID:deliveryReference/);
});

test('replayed event preserves the same deterministic idempotency key', () => {
  assert.equal(planStore01SupplierIntake(base).idempotencyKey, planStore01SupplierIntake(base).idempotencyKey);
});
