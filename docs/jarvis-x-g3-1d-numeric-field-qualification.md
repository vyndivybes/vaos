# VAOS JARVIS X — G3.1D Quantitative Field Contract Gate (2026-10-13)

## 5P engineering execution

**Plan:** Inspect the _live connected_ source code of `vyndivybes/vyndios`, including `src/routes/api/vaos/bridge.ts`, `src/lib/production-job-card.ts`, `src/lib/inventory-authority.ts` and `src/lib/engineering-change-control-authority.ts`. The signed bridge currently returns up to 50 rows using `to_jsonb`; it does not supply an independently signed snapshot revision or a completeness certificate. The four read routes were already commissioned in G3.1A–C.

**Prepare:** Red-first negative tests for missing schema, unrecognized units, nondecimal inputs, negative stock, shortage exceeding demand, nonintegral production units, unknown engineering revisions, partial response limits, privacy leaks and false upstream certification flags.

**Proceed:** Add `intelligence/g3-quantitative-contract.mjs` and integrate **field inspection only** into the existing founder-only `GET /api/jarvis-g3-readiness` endpoint. Keep the existing four signed, read-only gateway requests and the original `G3_1_AUTHORITY_READINESS_V1` status. The response gains `quantitativeDiagnostics` with strictly enumerated statuses and aggregate sample counts; there are no source rows, identifiers, customer names, quantities, prices, BOM values, invoices or secret tokens. It does **not** call the G3 optimizer or forecasting simulator.

**Perform:** Run all root tests, the new numeric tests, security checks and Cloudflare build. Verify anonymous users cannot call the endpoint, private code remains unreachable and upstream business records are not modified.

**Persist:** Merge only passing changes, keep the prior Cloudflare Worker version as the rollback candidate, and retain G2b recovery HOLD.

## Canonical field crosswalk — exact observed source implementation
| Source | Existing VYNDI SQL authority | Minimum strictly inspected fields | Caveats |
| --- | --- | --- | --- |
| Procurement | `epr_production_job_card_lines` where `shortage_quantity>0` | `sku`, `unit`, `required_quantity`, `shortage_quantity`, `bom_revision` | Read of 50 rows is partial; quantity/provenance/source currency unverified; a missing field produces a HOLD. |
| Inventory | `vyndi_inventory_balance` | `sku`, `unit`, `quantity_balance` | Physical quantity may be negative or absent; financial values not inspected; no weighted average cost certification. |
| Production | `epr_production_job_cards` | `id`, `units`, `bom_revision`, `status` | Actual capacity calendar, start/end dates, cycle times and engineering release evidence are **not** provided by this read. |
| Engineering | `vyndi_engineering_change_orders` and `vyndi_engineering_baselines` | baseline `id`, `revision_code`, `bom_revision`, `status` | The presence of “released” text does not certify effective authority, physical allowables or VEDM/VIBPE validation. |

The validator accepts bounded numbers or strict decimal strings (no exponents, NaN, Infinity or out-of-range values), recognizes a small explicit list of units and detects conflicting unit labels for a common SKU without inventing conversion factors. This is **schema screening**, not independently calibrated dimensional reconciliation. It does not equate stock and shortage quantities, or compare bills of materials across source systems.

### Semantics of quantitative diagnostics
- `STRUCTURAL_CANDIDATE_UNCERTIFIED`: a nonempty sample conforms to the chosen field grammar. No quantities are returned or approved.
- `FIELD_CONTRACT_HOLD`: candidate rows contain missing/invalid values or mixed units without reconciled conversions.
- `NO_NUMERIC_ROWS_OBSERVED`: no rows were returned in the limited sample, **not** proof of zero business volume.
- `PAYLOAD_SHAPE_HOLD`: an unrecognized response shape or oversized response; samples never silently certify completeness.
- `SOURCE_READ_HOLD`: signed route unavailable, incorrect action or source authority.
- At all times: `quantityCertifiedForOptimization=false`, `sourceRevisionVerified=false`, `completeDatasetVerified=false`, `canRunRealDataOptimizer=false`, `productionForecastCertified=false`, `actionAuthorized=false`.

## Remaining G3.1D–F / G2b hard gates
1. **Authoritative numerical semantics:** Existing signed-read connection must eventually include mutually reconciled part numbers, canonical unit definitions/conversion evidence, revision references, source-update timestamps, pagination/completeness proofs and independent quantities, not merely counts.
2. **Engineering:** Link VEDM controlling baseline, BOM applicability, material FAW/resin/allowables, VIBPE FEA, QC/NDT, signed human release, effectivity and actual supplier/prototype evidence. Do not synthesize these from descriptive fields.
3. **Production:** Qualified machine and labor calendars, validated duration histories, WIP priorities, demand quantities, lead times and nonconformance blockers.
4. **Forecast acceptance:** Hold real-data optimization until version/permission/consistency checks and historical out-of-sample backtests (errors, uncertainty, calibration) pass with independent reviewers.
5. **Recovery:** Actual encrypted PostgreSQL export and isolated restore of G2b durable records with observed reconciliation and preserved authorization; an in-memory metadata roundtrip is insufficient.
6. **Live authenticated founder test:** Sign in to VAOS and confirm the new `quantitativeDiagnostics` from real gateway responses, preferably matched to independent canonical database counts. Anonymous 401 testing is necessary but insufficient.

**Release decision:** G3.1D field screening can deploy safely. Actual quantitative inputs, G3.1E live simulation, and G3.1F forecasting commissioning stay **HOLD**. No new costs, DB migrations, paid AI providers, agents, mutation capabilities or Worker DO namespaces.
