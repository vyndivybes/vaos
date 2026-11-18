# JARVIS-A01 signed-source reconciliation (read-only)

**Five-P execution: Plan – Prepare – Proceed – Perform – Persist**. 18 November 2026.

## Explicit goal
Before commissioning an autonomous production-delay investigation, independently **compare** six signed, nonce-distinct VYNDI OS bridge reads (two each for inventory, shortages and open purchase orders) and the separate persistent VAOS ontology-projection health view. The mission has three distinct dimensions:

- **Reconciliation gate:** consistent current receipts, hash-checked content, identical source counts and digest for each pair, bounded complete page, scoped expected authority, projection counts and freshness can PASS.
- **Specialist evidence review:** only after a PASS consistency gate, four additional bounded signed reads cover procurement, inventory, production and engineering. Existing G3 cross-source analysis produces sanitized discrepancy types and preparatory corrections; raw SKU, order, supplier, engineering and financial identifiers never leave the request. These are unverified leads, not confirmed operational incidents.
- **Business authority gate:** source-of-record revision/CDC or independently certified DB version remains **HOLD**. Two reads from the same source do not constitute independent business certification; a current durable projection does not establish source authority.

This is constructive engineering evidence, not a data-authority shortcut. Existing upstream VYNDI receipt field `sourceRevisionAuthority: CONTENT_DIGEST_ONLY` and `sourceCompletenessVerified:false` MUST remain unchanged until independently authorized new upstream proof exists.

## Production endpoint
`GET /api/jarvis-a01`, founder cookie only, gated by existing `VAOS_ONTOLOGY_SOURCE_CONTROL=founder-readonly-v1`. Query strings and mutations prohibited. No AI calls or external-agent dispatch. No ERP writes, R2 writes, automatic retries, money, purchases, design releases or hidden model calls.

A01 source descriptions: `inventory`, `shortages`, `purchaseOrders`. Each source uses the already commissioned exact VYNDI signed bridge read action. The handler issues two disjoint reads per source, using independent cryptographic request signatures/nonces, then compares their content hashes and counts. Where those checks agree, it performs one additional fixed four-domain review with read-only signed bridge actions. The result includes `specialistReview.status` (`BOUNDED_EVIDENCE` or `SOURCE_HOLD`) and a list of safely scrubbed preparatory findings. The separate durable VAOS source-health view is required. An unavailable source returns HOLD, never zero. A failed source-consistency gate **prevents** the additional specialist reads; the generative model remains unused.

An all-MATCHED dossier must still return `status:HOLD`, `consistencyGate:PASS`, `businessSourceAuthorityVerified:false` and `AUTHORITATIVE_DATABASE_REVISION_REQUIRED`. If source hashes change between reads, source rows exceed the bounded limit, receipts age beyond fifteen minutes, or projection counts drift, the consistency gate itself returns HOLD.

Returned JSON contains bounded metadata and source SHA-256 values, not records, SKUs, PO identifiers, quantities, supplier names, personal information, or financial values. It is generated on demand; production does not currently persist completed A01 mission execution to a separate audit ledger.

## 5P admission checklist
1. **Plan:** select A01 read-only source-consistency mission; prohibit generative inference and business writes.
2. **Prepare:** check authenticated founder session, signed bridge availability, durable projection source health, and separate source-count authorities.
3. **Proceed:** run three read pairs against inventory, shortages and open POs; no commercial write route.
4. **Perform:** run `node --test apps/web/api/jarvis-a01.test.mjs`, full `npm test`, security regressions, Cloudflare SHA-match, and authenticated production GET.
5. **Persist:** retain immutable GitHub test/release records and the report's observed digests, count and timestamps in founder-reviewed qualification evidence. Separate durable receipt storage is NOT commissioned here.

## Remaining A01 closure gates
- Independently attributable authoritative VYNDI source version and completeness evidence (current content digest is insufficient).
- Source-of-record and production ledger reconciliation with approved units and canonical linkages.
- Independently verified specialist handoff execution and persistent case evidence. The bounded four-domain evidence review is implemented, but not an independent dispatched specialist mission.
- Authenticated founder production acceptance against live VYNDI; no promotion based only on green CI.

## Security
A mismatch is a HOLD, never a repair authorization. Do not change upstream flags to falsely mark completeness or authorization. No new paid service, provider token or AI inference is required.
