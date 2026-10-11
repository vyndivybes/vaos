# VAOS Stage 9 — Procurement P2P qualification

**Status: PREPARE_ONLY, candidate release evidence. No business-write authority.**

## Reuse existing VAOS / VYNDI assets
VAOS governs intents, employee duties, approvals and verification. VYNDI OS remains the canonical ERP and business-truth authority. Do not introduce another ERP or direct database writer.

The current bridge contract defines **24 routes: 9 read-ready, 15 write-prepared, 0 general write-execution-enabled**. Procurement shortage observation is read-ready. Draft PO creation and PO amendment are prepared but execution-disabled. Receiving, supplier-invoice posting and payment execution have not been qualified in this bridge.

## First vertical: two prototype frames
Synthetic Vāyū Shastr prototype procurement for one M and one L variant of the VYNDI Altitude model; do not create a separate size ledger or claim frozen engineering material authority.

| Gate | Required independent evidence | Current disposition |
|---|---|---|
| P1 Inventory/demand observation | Signed VYNDI read, canonical revision | Ready in contract, production recheck required |
| P2 Draft PO preparation | Mission, intent, idempotency, approved maker/checker and material revision | Prepared; write transport disabled |
| P3 Posting simulation | Isolated VYNDI sandbox, canonical PO ID and readback | HOLD |
| P4 Goods receipt | Canonical receiving service, QA and inventory reconciliation | Bridge gap |
| P5 Supplier invoice | Canonical invoice and ledger matching, no payment effect | Bridge gap |
| P6 Recovery | Replay, stale revision, unknown outcome, denial, dead-letter | Integration qualification pending |
| P7 Release | All evidence verified, zero unauthorized or duplicate writes | HOLD |

**Do not enable L5 autonomy, supplier payments, general posting or financial writes.** One bounded P2P sandbox vertical must be qualified before expanding to other adapters or real partner data.

## Release criteria
- No unauthorized or duplicate effects.
- Segregated maker and checker with auditable approval.
- Independent VYNDI canonical readback, result/evidence hash and replay protection.
- Verified compensation / kill switch / unknown-outcome procedure.
- Explicit stage-by-stage signoff; green unit tests alone are not production authorization.
