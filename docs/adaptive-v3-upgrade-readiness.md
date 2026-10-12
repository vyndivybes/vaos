# VAOS Adaptive Intelligence v3 — Upgrade Preparation

**State:** PREPARED FOR QUALIFICATION; **not** activated or generally autonomous.

**Authority:** VYNDI OS and VAOS governance. Safe default: read-only founder session, no business writes, no agent dispatch, no payments, no engineering-release approval, no unrestricted web browsing, and no paid API routing.

## Baseline verified
- Production Adaptive v2 is deployed. The last independently tested release is recorded in the repository history. Do not equate CI with authenticated end-user accuracy.
- The shared voice-AI pilot limit is **3 model calls per UTC day** in `apps/web/lib/voice-ai-focus.mjs`, including adaptive planning and synthesis; an adaptive question can consume 2 calls. This is a **VAOS application limit**, not Cloudflare's documented Neuron allocation.
- Cloudflare Workers AI documentation (updated 2026-10-09): Workers Free allocation is **10,000 Neurons per UTC day**, without additional requests once exceeded; Workers Paid can incur charges. Do not change plan, model or app call cap on the strength of these numbers alone. Monitor actual Neuron use and model cost first: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Branch previews on the current Workers Free account previously failed at Durable Object namespace quota 10067. Production builds can succeed; never delete namespaces merely to clear preview.
- Model output is advisory and cross-source numerical checks are only bounded consistency tests, not independent proof of causation.

## Upgrade phase gates — all mandatory
1. **Security:** authenticated founder-only read access confirmed in the actual browser; negative tests reject unauthenticated requests, arbitrary tools, credentials and writes. Paid routing remains disabled.
2. **Source fidelity:** adjudicate 20+ previously unseen operational questions against real source records; at least 90% evidence-correct responses, and **zero** fabricated, unqualified financial or engineering assertions. Record each sample, expected answer, actual source IDs, reviewer and evaluation date in a restricted evidence store; redact personal and commercial secrets from public CI.
3. **Live acceptance:** 10+ authenticated end-to-end queries, at least 90% with correct source-linked claims. Never mark unsupported facts as verified.
4. **Latency:** measure end-to-end service latency for live authenticated questions, with p95 <= 8 s. Record API wait, retrieval, inference and verification separately if available. Client-side speech latency needs separate browser testing.
5. **Inference capacity:** verify free-only budget against actual Cloudflare Neurons and existing shared R2 conditional-write quota arbitration. Document expected daily inquiries, cost margin and fail-closed behavior. **Do not raise the three-call application cap or activate paid models in this preparation phase.**
6. **Voice:** complete browser speech and wake-mode readback with permission granted in a real supported browser. Microphone and speech vendor behavior cannot be inferred from CI.
7. **Release:** GitHub tests green, Cloudflare production release green, authenticated read-only canary green, rollback path documented, founder approval recorded. A readiness score does not authorize activation.

## New diagnostics
The adaptive response exposes only an allowlisted status, observed source coverage, inference calls and bounded server-side latency. The browser identifies **bounded model-checked advisory** versus **evidence-only fallback** (including a daily quota reason). No provider secrets, raw records or user questions are logged by these diagnostics. Timing includes the handler's processing; this is not browser speech latency.

## Test protocol
- Synthetic and safe offline routing regression: `node scripts/qualification/adaptive-v3-offline-benchmark.mjs`.
- Unit and integration qualification: `npm test` (web + platform + verification suites).
- Production preflight: GET the public workspace; GET the adaptive endpoint without credentials must return 401; authenticated evaluation must use a real founder session and **read-only** questions only. Do not paste authentication cookies into tickets or chat.
- Use `assessUpgradeReadiness` with documented adjudicated counts and live p95. Missing evidence always means HOLD. `READY_FOR_HUMAN_APPROVAL` is **not** automatic activation.

## Next upgrade work after qualification
Bounded tool-classifier improvements, evidence-provenance linking and selective semantic fact checking; budget-adaptive model calls only after measured free-tier neuron acceptance. A general web researcher needs explicit allowlisting, citations, freshness checks and a privacy boundary before activation.
