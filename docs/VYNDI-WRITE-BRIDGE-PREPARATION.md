# VAOS ↔ VYNDI Write Bridge Preparation

## Status

**All 23 routes prepared; bridge execution still disabled.**

The 16-person workforce is ACTIVE, but the eight operational employees remain constrained by the VAOS `PREPARE_ONLY` policy. This package defines the bridge boundary without enabling any network or business mutation.

VYNDI PR **#18** (`134a77679d75febd9bebded6f7e4434a7c570eb7`) qualified the final three canonical command authorities. Development CI run **#84 / 37775667502** passed migration-from-empty, focused authority integration, Golden MES, H4, scanner, typecheck and Cloudflare bundle. The VYNDI PR is a dependency and is **not treated as production-live until separately merged/deployed**.

## Contract principles

- VYNDI remains the only canonical business-truth authority.
- VAOS submits governed intent; it never writes directly to VYNDI databases.
- Every mutation carries the originating mission, intent, idempotency key, approval reference and source reference.
- Every mutation is verified against canonical VYNDI evidence after execution.
- The bridge contains no credentials and no hard-coded deployment URL.
- A prepared route is **not** an enabled route.
- Canonical-authority gaps must fail closed; the current matrix has zero known gaps.

## Readiness matrix

| Employee | VAOS action | VYNDI authority | Preparation state |
|---|---|---|---|
| Commercial | Observe pipeline | `listSalesOrders` | READ_READY |
| Commercial | Commit/change order | `saveSalesOrder` | WRITE_PREPARED |
| Procurement | Observe shortage | `getConfiguredDemandShortages` | READ_READY |
| Procurement | Create PO | `submitDraftPurchaseOrder` | WRITE_PREPARED |
| Procurement | Change PO | `amendPurchaseOrder` | WRITE_PREPARED |
| Inventory | Observe stock | `getAuthoritativeInventory` | READ_READY |
| Inventory | Reserve material | `refreshProductionReservations` | WRITE_PREPARED |
| Inventory | Issue material | `issueProductionReservation` | WRITE_PREPARED |
| Production | Observe WIP | `getProductionJobCards` | READ_READY |
| Production | Release job/batch | `approveProductionBatch` | WRITE_PREPARED |
| Production | Advance stage | `advanceProductionTravellerStage` | WRITE_PREPARED |
| Maintenance | Observe asset | `getAssetMaintenanceState` | READ_READY |
| Maintenance | Open work order | `createMaintenanceWorkOrder` | WRITE_PREPARED |
| Maintenance | Return to service | `completeMaintenanceWorkOrder` | WRITE_PREPARED |
| Finance | Observe ledger | `getAccountingWorkbench` | READ_READY |
| Finance | Prepare payment | `prepareSupplierPayment` | WRITE_PREPARED |
| People | Observe workforce | `listPeopleOfficeAuthority` | READ_READY |
| People | Prepare payroll | `recordPayrollReadiness` | WRITE_PREPARED |
| People | Change employee master | `savePeopleRecordDraft` | WRITE_PREPARED |
| Engineering Configuration | Observe configuration | `getEngineeringChangeControlState` | READ_READY |
| Engineering Configuration | Change configuration | `createEngineeringChangeOrder` | WRITE_PREPARED |
| Engineering Configuration | Release configuration | `releaseEngineeringChangeOrder` | WRITE_PREPARED |

## Closed authority gaps

1. **PROCUREMENT.CHANGE_PO** → `amendPurchaseOrder`
   - optimistic revision check
   - no amendment after issue/receipt
   - approved amendments return to pending approval
   - auditable commercial revision

2. **PRODUCTION.ADVANCE_STAGE** → `advanceProductionTravellerStage`
   - forward-only progression
   - EPR-04 required before build
   - active release blocks fail closed
   - canonical Quality release required before completion
   - optimistic traveller revision

3. **FINANCE.PREPARE_PAYMENT** → `prepareSupplierPayment`
   - idempotent preparation
   - maker/checker approval lifecycle
   - reserves open payable
   - preparation and approval do **not** post cash, journal or supplier payment
   - actual execution remains a separately governed VYNDI function

## Commissioning sequence

1. Merge and deploy VYNDI PR #18 under VYNDI release governance.
2. Verify migration 0146 and runtime health in production.
3. Expose a narrowly authenticated VYNDI bridge endpoint or equivalent service boundary.
4. Bind VAOS service identity without sharing human credentials.
5. Require intent ID, mission ID, idempotency key, approval reference and source reference on every mutation.
6. Execute dry-run/prepare qualification for all 23 routes.
7. Commission read routes first.
8. Commission draft/preparation mutations next.
9. Commission high-assurance effects last: Production release, Maintenance return-to-service and Engineering release. Finance payment **execution** remains outside the `FINANCE.PREPARE_PAYMENT` capability.
10. Test replay, duplicate idempotency, stale revision, RBAC denial, approval denial, network timeout and unknown-outcome reconciliation.
11. Remove `PREPARE_ONLY` per action only after that action's evidence is PASS.

No route in this preparation changes the current production authority ceiling.
