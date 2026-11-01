/**
 * STORE01-INTAKE-01: non-actuating VAOS proposal adapter for VYNDI supplier intakes.
 * No database calls, finance postings, robot commands, autonomous approvals,
 * network I/O, or production switches. The VYNDI canonical records remain
 * the authority for PO/GRN/invoices/inventory.
 */
const required = (value, field) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) {
    const error = new Error(`STORE01_INVALID:${field}`);
    error.code = 'STORE01_INVALID';
    throw error;
  }
  return value.trim();
};
const validQuantity = value => Number.isFinite(value) && value > 0;

/**
 * Proposed work from a supplier arrival observation. Evidence is not accepted
 * as a transaction, and robot handling is SIMULATION_ONLY, never a command.
 */
export function planStore01SupplierIntake(input = {}) {
  const eventId = required(input.eventId, 'eventId');
  const purchaseOrderId = required(input.purchaseOrderId, 'purchaseOrderId');
  const deliveryReference = required(input.deliveryReference, 'deliveryReference');
  const supplierId = required(input.supplierId, 'supplierId');
  const quantity = Number(input.observedQuantity);
  const alerts = [];

  if (!validQuantity(quantity)) alerts.push('PHYSICAL_COUNT_REQUIRED');
  if (typeof input.invoiceEvidenceReference !== 'string' || !input.invoiceEvidenceReference.trim()) {
    alerts.push('INVOICE_EVIDENCE_REQUIRED');
  }
  if (input.poState !== 'issued' && input.poState !== 'part_received') {
    alerts.push('PO_NOT_ISSUED');
  }
  if (input.coldChainRequired === true &&
      (typeof input.temperatureEvidenceReference !== 'string' || !input.temperatureEvidenceReference.trim())) {
    alerts.push('COLD_CHAIN_EVIDENCE_REQUIRED');
  }
  if (input.storeId !== 'STORE01') alerts.push('WRONG_STORE');
  if (input.qualityDisposition === 'released') alerts.push('UNVERIFIED_QUALITY_RELEASE');

  return Object.freeze({
    contractVersion: 'store01.intake.v1',
    idempotencyKey: `store01:intake:${eventId}`,
    sourceEventId: eventId,
    storeId: 'STORE01',
    supplierId,
    purchaseOrderId,
    deliveryReference,
    invoiceEvidenceReference: typeof input.invoiceEvidenceReference === 'string'
      ? input.invoiceEvidenceReference.trim() : '',
    disposition: alerts.length ? 'MANUAL_REVIEW' : 'PROPOSE_ONLY',
    alerts: Object.freeze(alerts),
    proposals: Object.freeze([
      Object.freeze({
        capability: 'vyndios.receiving-review',
        canonicalRoute: '/command/receiving',
        canonicalEntity: 'vyndi_goods_receipts',
        action: 'PREPARE_QUARANTINED_GRN',
        authorization: 'HUMAN_EDIT_REQUIRED',
      }),
      Object.freeze({
        capability: 'vyndios.payables-review',
        canonicalRoute: '/command/payables',
        canonicalEntity: 'vyndi_supplier_invoices',
        action: 'PREPARE_THREE_WAY_MATCH_REVIEW',
        authorization: 'HUMAN_EDIT_AND_APPROVAL_REQUIRED',
      }),
      Object.freeze({
        capability: 'robotics.store01-simulation',
        action: 'SIMULATE_INBOUND_TOTE_MOVEMENT',
        authorization: 'SIMULATION_ONLY',
      }),
    ]),
    permittedSideEffects: Object.freeze([]),
    physicalMotionAuthorized: false,
    invoiceApprovalAuthorized: false,
    paymentAuthorized: false,
    qualityReleaseAuthorized: false,
    deploymentMode: 'disabled',
  });
}
