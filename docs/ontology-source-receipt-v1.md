# P0.1 — VAOS signed-source receipt admission

The existing signed VYNDI bridge client now exposes `readOnly:true` and `effectClass:read` on successful reads and validates the new optional source-content receipt for **inventory and shortages**. A full content digest, exact source scope and canonically formatted UTC extraction timestamp are checked before returning `sourceReceiptChecked:true`.

`sourceReceiptChecked` means structural/content consistency **only**. The client ALWAYS returns `sourceCompletenessVerified:false`, `productionWriteAuthorized:false`, `actionAuthorized:false`. The bridge's prior legacy read shape remains supported with `sourceReceiptChecked:false`, so existing read-only dashboards do not break.

This does not provide CDC, tenant-safe entity resolution, source-revision signatures, durable Ontology storage, scheduled replay, or authority to prepare/commit a purchase order. Preserve the existing L0-L5 policy and the 16 staff's historical qualifications.

Tests: `node --test platform/execution/vyndi-read-bridge-client.test.mjs platform/execution/vyndi-ontology-read-receipt.test.mjs`.
