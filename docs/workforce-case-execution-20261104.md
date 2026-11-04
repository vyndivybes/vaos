# Bounded workforce case execution — 4 November 2026

Source baseline: VAOS `96c4d67b915d709b9dbe8a55e4d0f9a4eaae2982`.

Startup worksheets previously returned predefined steps with blank inputs. The new preparation handlers process versioned synthetic departmental evidence into findings, calculated results and proposed handoffs. They are deterministic rule handlers, not LLM employees or general autonomous business executors.

## Delivered scope

- Sixteen bounded case handlers, starting with Security and Orchestrator.
- Challenge and corrected inputs for each role, with canonical source hashes.
- Founder-authenticated `/api/workforce-exercise` GET catalog and strict POST submission.
- Persistence through the existing immutable startup-output RPC. Exact request IDs are retained on uncertain writes. A second idempotent RPC round trip SELECTs the same stored row, including older receipts outside the ten-item UI history window.
- Browser exercise page linked from Company startup. API requests and stored pending IDs support reconciliation after interruption.
- No model binding, provider inference, paid service, new dependency, database migration or business mutation capability.

Every response retains operationallyQualified:false, qualificationGranted:false, productionWriteAuthorized:false, businessEffectsExecuted:false and engineeringReleaseGranted:false. Proposed handoffs are explicitly not dispatched. Corrected release, production and configuration cases intentionally remain HOLD because the synthetic engineering release is still withheld.

## Verification

Executed on Node 24.22.1 in a disposable workspace:

`node --test platform/qualification/workforce-prelaunch-drills.test.mjs platform/execution/mission-consumer.test.mjs platform/runtime/vaos-eight-operating-model.test.mjs agents/workforce/prepare-executor.test.mjs apps/web/api/workforce-exercise.test.mjs`

Result: **144 passed, 0 failed**, including 21 new handler/API tests. The API suite uses actual local HTTP requests and a disposable file-backed SQLite journal. It verifies anonymous/checker denial, malformed-cookie handling, same-origin enforcement, strict source rejection, interruption after commit, server/storage restart, same-ID replay, conflicting-ID rejection and corrupted persistence failure. JSON key reordering is exercised to match PostgreSQL JSONB semantics.

Adjacent existing tests cover evidence-gated independent handoff review, changed sources after interruption, unavailable readback, restricted/training identities and bounded read receipts. These tests do not establish hosted role competence.

Changed executable modules passed Node syntax checks and `git diff --check` passed. A full repository test/build was not run: a pinned source subset was retrieved through the repository connection because direct git clone authentication is unavailable in this workspace. Browser rendering, the real PostgreSQL RPC and Cloudflare runtime still require exact-commit acceptance after deployment.

## Operational qualification disposition

**HOLD for all 16 employees.** Local case-processing capability is implemented and tested; hosted deployment and independent operational qualification are not claimed.

Remaining acceptance evidence: deployed-commit identity, hosted authenticated Security and Orchestrator exercise receipts, independent reviewer response checks, real isolated handoff acceptance/correction/recovery, production role-permission sessions, canonical business-source accuracy/completeness, and fresh independent restore proof. Apply that evidence standard to the remaining fourteen roles. No certificate or registry Q-level promotion is authorized by software tests alone.

Engineering HOLDs and cancelled demand remain unchanged. Human release/acceptance must be based on the completed evidence pack; it cannot substitute for missing technical evidence.
