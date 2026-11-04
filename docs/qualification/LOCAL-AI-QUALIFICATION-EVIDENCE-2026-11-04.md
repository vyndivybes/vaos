# VAOS — Local AI qualification evidence (2026-11-04)

> **Evidence status: LOCAL SOFTWARE + SYNTHETIC GATES ONLY.**
>
> This record documents offline and deterministic qualification results produced from the `vaos-main` source tree on 4 November 2026.
> It is **not** an individual agent certificate, live model production activation, human independent review, or authority change.
> `qualificationGranted` and `operationallyQualified` remain **false** everywhere unless a separate governed commissioning path says otherwise.

## Scope

| Area | In scope | Out of scope |
|------|----------|--------------|
| Offline unit / contract tests | Yes | Hosted Cloudflare live traffic |
| Synthetic workforce role drills | Yes | Live VYNDI ERP writes |
| Stage-9 VYNDI bridge readiness | Yes (counts corrected) | Commissioned mutation execution |
| Jarvis governed model path (L0–L3) | Module + unit tests added | Production model traffic, L4/L5 |
| Postgres / PGlite recovery tests | Attempted; install blocked in this runner | Hosted Supabase RPCs |
| Independent human review samples | No | Required for Certificate A |

## Stage-9 procurement preflight — fixed

**Defect:** `platform/qualification/stage9-procurement-preflight.test.mjs` expected `routeCount=24`, `readReady=9`.  
**Actual contract** (`packages/contracts/vyndi-write-bridge.mjs`): `routeCount=27`, `readReady=12`, `writePrepared=15`, mutation `executionEnabled` count = **0**.

**Change applied:** update expected counts to match the frozen contract. Mutation routes remain disabled.

**Result after fix:** 4 / 4 tests **PASS**.

Interpretation: three additional **read-only** routes were added to the contract; no write route was enabled. The bridge remains restricted.

## Local suite results (this runner)

| Suite | Result | Notes |
|-------|--------|-------|
| Syntax check (`scripts/check-syntax.mjs`) | PASS | 756 files (prior full extract) |
| `intelligence/*` | 93 / 93 PASS | Jarvis evaluation, coordination, G3, workforce evidence |
| `platform/runtime/*` | 56 / 56 PASS | L0–L5 policy, 16-employee operating model |
| `platform/execution/*` | 345 / 345 PASS | Providers, missions, credentials, kill switches |
| `apps/web/**` | 800 / 800 PASS | Jarvis UI/API, tools, decision room, voice contracts |
| LangGraph agent-supervisor | 11 / 11 PASS | Safe read-only missions only |
| Workforce prepare-executor | 20 / 20 PASS | All 16 specialist roles |
| Workforce software drills | SOFTWARE_CONTROL_DRILLS_PASS | Still `qualificationGranted: false` |
| Workforce role exercises | LOCAL_DETERMINISTIC_EXERCISES_PASS | Still `qualificationGranted: false` |
| Stage-9 procurement preflight | 4 / 4 PASS (after fix) | Counts aligned to contract |
| **New** `intelligence/jarvis-governed-model` | **10 / 10 PASS** | L0–L3 advisory boundary |

### Platform residual failures (unchanged environment limits)

| Test | Cause |
|------|--------|
| `founder-stage4-http-persistence.test.mjs` | Requires live `psql` + Stage-4 schema |
| `workforce-local-login-training.test.mjs` | Local training server + deps |
| `workforce-training-postgres.test.mjs` | Needs `@electric-sql/pglite` install (npm blocked in this runner) |
| `dashboard-definitions-postgres.test.mjs` | Postgres / PGlite |
| `workforce-evidence-postgres.test.mjs` | Postgres / PGlite |

These remain **HOLD** for local evidence until a clean `npm install` and (where required) Postgres are available. They are not interpreted as production qualification.

## New governed Jarvis model path

**Files**

- `intelligence/jarvis-governed-model.mjs`
- `intelligence/jarvis-governed-model.test.mjs`

**Contract**

- Authority levels: **L0, L1, L2, L3 only**. L4/L5 refused at the boundary.
- Injected `ai.run` only (same pattern as `founder-ai-draft` / `business-advice-ai`).
- Default model binding: `@cf/meta/llama-3.1-8b-instruct-fp8` (Workers AI).
- No tools; tool calls from the model are rejected.
- Output must be exact JSON `{ recommendation, riskPosture, summary }`.
- Recommendation vocabulary: `PROCEED_WITH_REVIEW | HOLD_FOR_EVIDENCE | ESCALATE`.
- L0/L1 cannot emit `PROCEED_WITH_REVIEW`.
- Summary rejects numerals, currency, approval/certification/autonomy language.
- Always returns `actionAuthorized: false`, `executionEnabled: false`, `qualificationGranted: false`, `operationallyQualified: false`, `authority: 'ADVISORY_ONLY'`.

**How to invoke locally (once an `ai` binding exists)**

```js
import { runJarvisGovernedAdvisory } from './intelligence/jarvis-governed-model.mjs';

const result = await runJarvisGovernedAdvisory({
  ai, // { run(model, { prompt, max_tokens, temperature, stream }) }
  authorityLevel: 'L2',
  domain: 'procurement',
  subjectId: 'SHORTAGE-REVIEW-1',
  observations: [{ domain: 'procurement', status: 'HOLD' }],
  question: 'Should we prepare a purchase order?',
});
// result.actionAuthorized === false
```

## Explicit non-claims

- No employee or agent received Certificate A, B, or C from this work.
- No production write route was enabled.
- No live model traffic was executed against Cloudflare Workers AI or any paid provider in this session.
- Synthetic PASS and software drills do **not** grant operational competence.
- Independent reviewer paired samples are still required before Jarvis evaluation can leave `SYNTHETIC_ONLY` / declared-review modes for production calibration claims.

## Recommended next commissioning steps

1. Clean `npm install` on a developer workstation; re-run PGlite Postgres recovery tests.
2. Provision disposable Postgres for Founder Stage-4 persistence test (never production).
3. Wire `runJarvisGovernedAdvisory` behind an existing authenticated founder/Jarvis API with the same session and capability gates used by `business-advice-ai`.
4. Collect independent reviewer pairs into private storage and feed `scripts/qualification/jarvis-paired-evaluation.mjs`.
5. Keep mutation routes on the VYNDI bridge at `executionEnabled: false` until a separate write-commissioning gate and independent sign-off exist.

## Change list in this evidence package

| Path | Change |
|------|--------|
| `platform/qualification/stage9-procurement-preflight.test.mjs` | Expected route counts 24/9 → 27/12 |
| `intelligence/jarvis-governed-model.mjs` | **Added** — L0–L3 governed advisory model path |
| `intelligence/jarvis-governed-model.test.mjs` | **Added** — 10 unit tests, all PASS |
| `docs/qualification/LOCAL-AI-QUALIFICATION-EVIDENCE-2026-11-04.md` | **Added** — this record |

---

*Recorded 2026-11-04. Local software evidence only. Not a production activation.*

Patch review reran the ten advisory tests with an injected mock runner and four Stage-9 checks. A proceed recommendation requires observed source coverage. No live provider call or database rerun was performed during this review.
