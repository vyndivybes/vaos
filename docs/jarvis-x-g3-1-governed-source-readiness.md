# VAOS JARVIS X — G3.1 Governed Predictive Data Integration
**Date:** 2026-10-13. **Release classification:** founder-only, read-only source readiness; **NOT** production forecasting.

## Scope and 5P
**Plan:** Reuse existing VYNDI OS signed read gateway, four relevant read-commissioned routes, and isolated G3.0 mathematical sandbox; do not create new repositories, paid services, Durable Objects, raw-data caches or new production permissions.

**Prepare:** Negative tests for forged authority, arbitrary source rows, stale/future timestamps, missing sources, browser access by a non-founder, and unauthorised methods. The actual source-update timestamp, record version, material unit and engineering release are not available in qualified form from these gateway responses.

**Proceed:** Added the bounded founder-only `GET /api/jarvis-g3-readiness` endpoint (no request body or parameter-driven route choice). Calls exactly four existing signed, read-only VYNDI bridge routes on demand. Does not call the G3 solver, mutate the database, post a journal or assign any agent. All raw source data is discarded immediately; return only approved source names/authorities, server-issued retrieval receipt and explicit outstanding qualifications.

**Perform:** Run all regression tests, verify Cloudflare Worker preview and main CI, and independently verify that the API denies unauthenticated requests. Inspect G2b recovery gates separately: no synthetic replay counts as restored production data.

**Persist:** Merge code and qualification evidence, preserve the read-only contract and a rollback to the previous Cloudflare Worker release.

## Source mapping and authority
| Domain | Qualified gateway action | Canonical VYNDI authority | Currently permitted conclusion |
| --- | --- | --- | --- |
| Procurement | `PROCUREMENT.OBSERVE_SHORTAGE` | `getConfiguredDemandShortages` | Gateway retrieval performed / HOLD |
| Inventory | `INVENTORY.OBSERVE_STOCK` | `getAuthoritativeInventory` | Gateway retrieval performed / HOLD |
| Production | `PRODUCTION.OBSERVE_WIP` | `getProductionJobCards` | Gateway retrieval performed / HOLD |
| Engineering configuration | `ENGINEERING.OBSERVE_CONFIGURATION` | `getEngineeringChangeControlState` | Gateway retrieval performed / HOLD |

**Critical distinction:** The fourth route reads the VYNDI engineering configuration record. This is **not** the same as a complete verified VEDM + VIBPE knowledge pack, nor does it certify material allowables, engineering release or FEA. Finance, commercial forecasts, staffing capacities and maintenance are out of this four-read acceptance slice, not assumed verified.

## Data contract and controls
- All routes are discovered from the already-reviewed VYNDI read-bridge registry; each action must be `READ_READY`, `executionEnabled=true`, `effectClass=read`. These are fixed in code, not user/model-selectable.
- The existing signed bridge client cryptographically binds the request and verifies response action/authority. The Worker independently compares the returned action and source authority with the approved contract. A mismatch produces a `HOLD` source without leaking upstream text.
- The timestamp is added **after successful gateway retrieval using the server clock**, not received from the upstream application. A five-minute old gateway receipt is not evidence of fresh underlying records.
- Response is `G3_1_AUTHORITY_READINESS_V1`, `INPUT_QUALIFICATION_HOLD` with at most four source-status entries, no raw rows, no quantities, no customer data, no source document content, and strict booleans `canRunRealDataOptimizer=false`, `productionForecastCertified=false`, `actionAuthorized=false`.
- Strictly require a founder session and existing `VAOS_VOICE_CONTROL=founder-readonly-browser-v1`. No new model calls, database migrations, schedules, paid provider credentials, financial postings or manufacturing releases.

## Predictive qualification gates
G3.0's numeric optimizer and simulator remain **synthetic-only** and are **not imported** into this endpoint. They are not permitted to consume raw or partial real source payloads.

**G3.1A–C:** Source mapping, authenticated transport and contract/freshness checks: implement and CI qualify, with real content versions still on HOLD.

**G3.1D–E:** Real-source adaptation to optimization and its scenarios: **HOLD** until unit-checked numerical payload schemas, versioned BOM/release evidence, authoritative capacity calendar, supplier lead-time evidence, independent VEDM/VIBPE source integrity and documented scenario assumptions are available. Synthetic-engine tests alone do not complete this stage.

**G3.1F:** Independent real-data acceptance: **HOLD** until a signed-in end-to-end read, source-row/quantity reconciliation, boundary tests, expected-vs-actual scenarios, and the separately required G2b recovery drill are recorded.

## Parallel G2b recovery requirement
The earlier G2b metadata-only JSON reconstruction is **not** a database restore. To qualify actual recovery, obtain read-only authorized PostgreSQL logical export using the official Supabase CLI/pg_dump compatible with the source version; encrypt and checksum the backup; restore it into **an isolated non-production PostgreSQL database** whose schema and source rows are independently inspected; verify row counts, source permissions and integrity; record signed evidence and delete the temporary isolated copy according to approved retention. Do **not** restore to production, download credential secrets into GitHub, create paid cloud branches, or claim approval without proof.

**Commissioning decision:** The readiness endpoint can be deployed as supervised diagnostics without relaxing the G2b HOLD or commissioning G3 production predictions.
