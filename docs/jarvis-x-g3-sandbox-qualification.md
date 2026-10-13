# VAOS JARVIS X — G3.0 Synthetic Optimization Research Gate
**Release classification:** isolated test-only research scaffold. **Date:** 2026-10-13.

## Why G3 can advance without bypassing G2b
G2b's read-only graph and source-integrity audit are deployed, but full acceptance is still blocked by a genuine isolated **PostgreSQL restore**, independent verification of external source-document versions, semantic contradiction adjudication and authenticated founder acceptance. No code in this stage alters those holds.

G3.0 therefore implements two **deterministic, dependency-free, local-only** research capabilities under `intelligence/g3-synthetic-sandbox.mjs`, with **no Cloudflare API route**, worker import, AI model invocation, database connection, credentials, production bindings, mission dispatch or business writes.

## Implemented research capabilities
- `optimizeSandboxSchedule(scenario)` is a finite, exhaustive, bounded whole-day scheduling search (≤6 toy jobs, ≤3 toy resource types, ≤14 days), enforcing precedent dependencies, exclusive/capacity constraints, releases and hard deadlines. Objective: minimum makespan. It returns an optimality certificate **only within these synthetic assumptions and only on completed exhaustive search**. If it exhausts 100,000 search states, it returns `SEARCH_LIMIT_HOLD` without a schedule or optimality assertion. If a toy job is not marked ready, it returns `INPUT_RELEASE_HOLD` with no execution authorization.
- `simulateSandboxRisk(scenario)` is a seeded Monte Carlo **critical-path** model with 3-point triangular assumed durations and 64–1,024 draws. Outputs empirical P10/P50/P90 duration and simulated deadline-attainment fraction. It explicitly **does not model production capacity, shared resources, correlations, real historical calibration or finance**.
- Both reject unknown fields and non-synthetic inputs, enforce bounded IDs/arrays, prevent cycles and report `actionAuthorized=false`, `productionForecastCertified=false`, `productionPlanningQualified=false`, `businessDataRead=false`.

## Qualification
CI's root `npm test` includes `npm run test:g3-sandbox`. Test cases cover precedence, resource conflicts, optimum of toy schedules, infeasibility, missing release, cycle/forged production fields, replay determinism, longest-path behavior and uncalibrated Monte Carlo probability bounds.

This is a **quantitative research sandbox**, not a digital twin or forecast of real Vāyú Shastr operations. The test fixtures are invented and MUST NOT be cited as real cycle time, cost, likelihood, source quality, FEA acceptance or supplier readiness.

## 5P evidence chain
**Plan:** Preserve G2b's HOLD while preparing a math-backed G3 candidate with no production privileges.
**Prepare:** Red-first deterministic tests for correctness and safety boundaries.
**Proceed:** Add pure computation under `intelligence/` without exports to deployed Worker routes.
**Perform:** Run root regression suite, standalone G3 suite, worker build and CI, correct failures, verify isolation.
**Persist:** Merge CI-green revision; retain all operational holds and verify production has no new G3 endpoint.

## Non-negotiable next acceptance gates
1. **G2b:** Cryptographic/version authority, cross-application signed provenance, real independent Postgres backup **and isolated restore**, contradiction handling, logged founder authenticated acceptance. Never certify recovery from a JSON metadata round-trip.
2. **G3.1:** Source-to-solver contract for authoritative materials, job cards, capacity calendars, BOM/release authority and demand; fail closed on missing quantities/versions. No synthetic data may be silently replaced by live inputs.
3. **G3.2:** Real-model backtests, measurement of forecast errors, calibration/uncertainty, independent QA and safety validation. Release is sandbox-only until gates pass.
4. **G3.3:** Capability-restricted, separately approved user-facing read-only scenarios with versioned evidence. No autonomous manufacturing, financial posting, procurement or agent task dispatch.

**No new subscriptions or storage were required.**
