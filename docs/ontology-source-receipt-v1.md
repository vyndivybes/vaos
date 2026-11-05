# P0.1 — VAOS signed-source receipt admission

The existing signed VYNDI bridge client now exposes `readOnly:true` and `effectClass:read` on successful reads and validates the new optional source-content receipt for **inventory and shortages**. A full content digest, exact source scope and canonically formatted UTC extraction timestamp are checked before returning `sourceReceiptChecked:true`.

`sourceReceiptChecked` means structural/content consistency **only**. The client ALWAYS returns `sourceCompletenessVerified:false`, `productionWriteAuthorized:false`, `actionAuthorized:false`. The bridge's prior legacy read shape remains supported with `sourceReceiptChecked:false`, so existing read-only dashboards do not break.

This does not provide CDC, tenant-safe entity resolution, source-revision signatures, durable Ontology storage, scheduled replay, or authority to prepare/commit a purchase order. Preserve the existing L0-L5 policy and the 16 staff's historical qualifications.

Tests: `node --test platform/execution/vyndi-read-bridge-client.test.mjs platform/execution/vyndi-ontology-read-receipt.test.mjs`.

## Founder-only source status (disabled by default)

`GET /api/ontology/source-status?source=inventory|shortages` is registered in the VAOS Worker but disabled unless `VAOS_ONTOLOGY_SOURCE_CONTROL=founder-readonly-v1` is provisioned after read source qualification. It uses the existing signed VYNDI bridge, never accepts a caller URL, and never returns ERP row bodies. An internally consistent bounded extract is reported `SOURCE_UNVERIFIED` (not agent action authority). Missing, malformed or partial receipts produce `HOLD`. No POST handler, production hydration writer, PO preparation or autonomous action is enabled.

## Open Purchase Order observation — P0.1 extension

`PROCUREMENT.OBSERVE_OPEN_POS` is an explicit thirteenth signed read route (28 total bridge routes; 15 mutations still disabled). Its source scope is `vyndi_purchase_orders:open_status_v1`, with supplier/PO revision provenance and bounded page completeness. The existing founder endpoint may now accept `?source=purchaseOrders`; it never returns PO rows or authorizes any mutation. The read receiver validates the canonical content digest and source scope, but the receipt is **not independently certified**, and the source-status endpoint stays disabled until separately commissioned. No changes to production writes or digital employee qualification.
