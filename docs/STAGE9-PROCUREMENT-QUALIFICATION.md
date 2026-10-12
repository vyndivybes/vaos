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

## October 12 isolated lifecycle acceptance extension

`platform/qualification/stage9-p2p-isolated-sandbox.mjs` is a **CI/test-only**, in-memory model. It rejects injected network/database transports and uses no production records. Its narrow pilot is one M + one L configuration of one VYNDI Altitude model with wholly synthetic pricing and supplier IDs. This does not override the VYNDI OS pilot planning or release the unfrozen carbon material/BOM.

Acceptance scenarios verify draft PO, separated checker, GRN, independent QA, 3-way quantity/price matching, deterministic evidence hash, idempotent replay, idempotency conflict, stale revision, mismatched GRN/invoice, QA rejection, unknown-outcome HOLD, emergency disable, and zero `VYNDI` bridge transport calls. The supplier invoice is **`INVOICE_MATCHED_NOT_POSTED`**, never posted to an accounting ledger and never payable.

**Updated classification:** synthetic P2/P3/P4/P5 mechanics may receive engineering CI PASS. P1 production readback, actual P3 VYNDI sandbox posting, canonical receiving/invoice services, external recovery and P7 production release all remain **HOLD**. The VYNDI bridge continues to reject `PROCUREMENT.CREATE_PO` execution, supplier invoice posting and payment effects. A green GitHub check may not change these authority gates.

An actual Stage 9 qualification needs a separate VYNDI sandbox environment, sandbox canonical receipt/invoice APIs with signed context, independent readback and rollback, and founder approval before *any* isolated write. No new separate size ledgers are authorized.

## 2026-10-12: actual VYNDI canonical PostgreSQL function qualification — PASS (ephemeral database only)

VYNDI OS [PR #51](https://github.com/vyndivybes/vyndios/pull/51) is **merged** at
`b1c87f5a94f4a2968e070917d92a3df28cde36f2`.
The isolated VYNDI [Stage 9 SQL integration CI](https://github.com/vyndivybes/vyndios/actions/runs/38290494070) and full [Development CI](https://github.com/vyndivybes/vyndios/actions/runs/38290494190) passed on the tested PR head.

This evidence is materially stronger than VAOS's previous in-memory simulator: it loads the **actual VYNDI migrations** into an ephemeral PGlite PostgreSQL engine and invokes VYNDI's canonical supplier, PO creation, maker/checker approval, issued PO, accepted GRN, supplier-invoice match and inventory-ledger queries. Synthetic M and L prototype demand uses a common controlled material SKU and one inventory ledger; configuration.frameSize is traceable in the source notes, but must not be mistaken for a released canonical model/variant key. The test also rejects same-maker approval, stale PO revision, mismatched invoice, and invoice self-approval, and verifies **zero supplier payments**.

**Acceptance classification:** VYNDI CANONICAL-DB-ISOLATED-P2P **PASS**. This is not a networked VYNDI OS sandbox, not a real signed VAOS service-binding invocation, and not authorization to write to production. Actual VYNDI procurement write adapter, independently signed end-to-end readback, release/compensation and a deliberately provisioned sandbox remain **HOLD**. No new paid Neon branch or live business writes were used. P7 production release remains **HOLD**.

This evidence is retained alongside the VAOS isolated state-machine proof and must be requalified if VYNDI's canonical P2P procedures, signed bridge or procurement authority change.
