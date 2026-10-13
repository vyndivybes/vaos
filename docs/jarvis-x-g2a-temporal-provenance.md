# JARVIS X — G2a Temporal Gateway Provenance and Relation-Versioning

**Date:** 2026-10-13. **Release classification:** Founder-only supervised, read-only. **Authority:** Existing VYNDI OS bridge, VEDM engineering and VIBPE evidence; no new independent data source.

## The new capability

The JARVIS X source-status graph has deterministic, schema-versioned relation IDs (for example, `rel:v1:PROCUREMENT:PRODUCTION`) so source-domain relationships can be compared between responses. Every edge retains `UNVERIFIED_DEPENDENCY_HYPOTHESIS`: an edge asserts neither causation nor a verified material dependency.

The same authenticated adaptive read-only handler now timestamps each successful authorized **gateway read** using the **server clock** after receiving and checking the expected source authority and action type. The frontend, question, AI model and returned source payload cannot set these timestamps. The graph contains only bounded tool status, allowlisted source authority and a gateway-read receipt. It does not persist or reproduce raw business, customer, employee, technical or finance records.

Freshness classifications:
- `RECENT_GATEWAY_READ`: a successful gateway read completed within the previous 300 seconds (not a claim that its underlying records are current).
- `STALE_GATEWAY_READ`: an old gateway read receipt.
- `INVALID_OR_UNVERIFIED_GATEWAY_RECEIPT`: malformed, future-dated or untrustworthy timestamp.
- `NO_OBSERVED_RECEIPT`: source was on HOLD or had no verified observation.

**Invariant:** `sourceUpdatedAt=null`, `sourceAgeVerified=false`, `sourceDataFreshnessCertified=false`, `evidenceFreshness=UNVERIFIED` even when the gateway receipt is recent. This avoids confusing *fetch time* with *underlying record freshness*. Original records are not stored and the graph is neither signed nor durable.

## Boundaries and rollback

- Existing endpoint `GET /api/adaptive-intelligence?q=...&eval=v3-readonly&mode=jarvis-x`.
- Founder authentication, source allowlist, maximum three reads, independent model-draft checks and existing daily free-only AI budget unchanged.
- Zero new database migrations, paid APIs, Durable Object namespaces, model calls, business writes, agent promotions or autonomous dispatches.
- No production manufacturing, cash, lead-time or FEA outcomes may be inferred from heuristic review priorities or graph edges.
- On malfunction, return to the prior known-good Cloudflare Worker production deployment. No data migration/rollback required.

## Five P evidence

**Plan:** Eliminate false freshness and non-versioned graph-edge ambiguity without a new storage or execution surface.

**Prepare:** Author negative tests for forged/future/stale timestamps, raw-private-data leakage, HOLD source recency and actor control restrictions.

**Proceed:** Implement server-issued gateway receipts and versioned schema-only relation IDs on the existing read-only JARVIS X response path.

**Perform:** Run existing platform/web/regression suites, Worker bundle, login tests, Cloudflare deployment and public unauthenticated 401 smoke. CI tests are synthetic; they do not certify live answer quality.

**Persist:** Merge evidence-backed code; update release record. Maintain G2b **HOLD** for a truly persistent graph until signed source versioning, data-handling approval, retention policy, independent reconciliations and migration/restore evidence are present.

## Next qualification gates

**G2b Persistent Authority Graph:** signed/versioned source-record IDs, documented source timestamps, explicit mismatch/contradiction handling, privacy classification, data-retention and access model, backup/restore and rollback. Do not create a persistent graph until source agreements and restore gates pass.

**G3 Quantitative Optimization:** obtain actual capacity, dates, released BOM and material allowables and validate an isolated solver against known scenarios; retain strict sandbox-only operation.

**G4 Qualified Agent Collaboration:** verify Q-levels and policies for each assigned digital employee; never treat the proposed review roles as assigned, qualified or activated.

**G5 Founder Live Acceptance:** 20 independently adjudicated questions, ≥90% source-grounded accuracy, zero invented quantities and browser voice proof. These tests remain outstanding.
