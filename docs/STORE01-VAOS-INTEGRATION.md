# Store 01 supplier receiving — VAOS ↔ VYNDI OS

This is a **proposal-only integration slice**, not production automation.

- VYNDI OS owns issued PO, inspection, GRN, stock/FIFO movements, supplier invoice,
  three-way match, approvals, payments and audit.
- VAOS may process incoming, source-backed supplier arrival observations into
  idempotent **review proposals**, using `planStore01SupplierIntake`.
- Canonical human-facing routes remain `/command/receiving` and
  `/command/payables`; the receipt/invoice can only be posted through
  VYNDI's authenticated governed authority.
- Store ID must be `STORE01`. Store 02 finished bicycle dispatch is not enabled.
- An optional simulator may consume a proposal to render a virtual movement,
  but `physicalMotionAuthorized=false` and `deploymentMode=disabled` are
  enforced on every plan.
- Do not forward an unverified device payload straight into a canonical database,
  robot motion controller, warehouse PLC or finance posting endpoint.
- Real integration should use signed and replay-safe H5 integration inbox/outbox,
  source document hashes, rate-limiting, separate roles, and evidence reconciliation.
- Human-reviewed OCR integration can reuse the free/open-source document adapters,
  subject to source-quality and privacy checks. No paid provider enabled.

## Flow contract

`supplier arrival observation → schema/evidence preflight →
VAOS proposal → authenticated VYNDI receiving/Finance operator →
canonical GRN + AP transaction → evidence/result readback`

The simulation adapter is not connected to a robot fleet and does not
issue physical movement instructions. Before commissioning any mobile robot,
require independent safety-rated protections, a site-specific hazard analysis,
and an operator-controlled kill switch.

## Suggested qualification

`node --test integrations/vyndios/store01-intake-planner.test.mjs`

Then run the existing VAOS repository qualification suite, verify Cloudflare
artifact lineage if released, and separately prove VYNDI GRN and AP workflows
on the intended environment. No merge or deployment should occur solely on
the basis of a successful unit test.
