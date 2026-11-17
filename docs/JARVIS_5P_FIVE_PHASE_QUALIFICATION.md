# JARVIS five-phase qualification — 5P
Date: 2026-11-18. Scope: governed capabilities only. Free-tier infrastructure; no new subscriptions.

## 5P execution standard
1. **Plan:** identify exact owner, action, authoritative source, expected result and acceptance gate.
2. **Prepare:** pin the Git commit, validate credentials exist without printing secrets, isolate source and risk, and preserve existing approval/kill switches.
3. **Proceed:** test a bounded operation without approving purchases, payroll, stock movements, engineering release or changes to model weights.
4. **Perform:** run the per-phase acceptance suite and independently compare the live provider response to the authoritative source before any production PASS.
5. **Persist:** retain reproducible tests and summaries, SHA-bound evaluation receipts where explicitly consented, and a clear HOLD for absent source evidence.

## Phase 1 — agent orchestration and decisions
Existing components: governed mission lifecycle, agent handoff ledger, production read-only observer, signed VYNDI bridge.
Code gate: 'node --test intelligence/jarvis-coordination.test.mjs platform/execution/production-l5-observer.test.mjs'.
Live gate: reconcile hourly unique intent, matching verified evidence, VYNDI source readback, error paths and external authorization. The L5 production observer remains restricted to PRODUCTION.OBSERVE_WIP. A recorded PASS is not authority to dispatch other agents or authorize business writes.

## Phase 2 — BI + graph source integrity
Existing components: founder enterprise BI department read, ontology receipt projection, read-only neural knowledge federation.
Code gate: 'node --test apps/web/api/enterprise-bi.test.mjs apps/web/api/neural-knowledge.test.mjs'.
Live gate: signed current source reads plus independent source record count/version comparison; reject stale, absent, unsigned, derived, or incomplete sources. Ontology 'SOURCE_UNVERIFIED' receipts remain HOLD; a pinned R2 hash proves integrity of a reviewed snapshot, not live Graphiti/SPARK synchronization.

## Phase 3 — predictive analytics
Implemented: three rolling one-step test folds; MAE and RMSE for selected model and last-observation baseline, held-out fold signed errors and a conservative empirical maximum-absolute-error band.
Code gate: 'node --test intelligence/market-series-forecast.test.mjs intelligence/market-forecast-quality.test.mjs'.
Limits: Three folds, same-fold model selection and no independent dataset qualification. The band is **not** a calibrated confidence interval; the method cannot certify business demand, production scheduling or cash forecasts.

## Phase 4 — persistent evaluation ledger
Endpoint: founder-only POST '/api/jarvis-learning-review' evaluates the existing paired outcome contract without storage by default.
Explicit opt-in: POST '{"operation":"SAVE","confirm":true,"batch":{"mode":"DECLARED_REVIEW_RESULTS","pairs":[...]}}' with founder cookie and matching Origin. Stores a whitelisted aggregate only under existing 'VAOS_ARTIFACTS' R2 with a UTC-date/UUID receipt and a SHA-256 hash of submitted evaluation input. No raw questions, answers, source documents, sample/reviewer identifiers or credentials are stored.
Replay: authenticated GET '/api/jarvis-learning-review?receipt=YYYY-MM-DD/uuid'; invalid and missing receipts fail closed. Legacy plain POST still returns 'stored:false'.
Code gate: 'node --test intelligence/jarvis-learning-ledger.test.mjs apps/web/api/jarvis-learning-review.test.mjs'.
Limits: The outcome labels remain caller-declared and unverified. No model training, self-modification, independent reviewer attestation, retention policy certification, or production self-learning claim. Evidence retention still requires founder consent.

## Phase 5 — multimodal
Existing component: founder-gated document (PDF/DOCX/PPTX), bounded excerpt Q&A, still-image analysis, provider refusal checks and input SHA validation.
Code gate: 'node --test apps/web/api/jarvis-multimodal.test.mjs'.
Live gate: authenticated provider interaction on a curated, independently labeled test set covering engineering drawings, image text, diagrams and scanned/complex documents. Assess accuracy, unsupported claims, provider processing and free-tier usage. Continue to label outputs unverified and prevent engineering/financial/regulatory approval claims.

## Release declaration
The CI workflow '.github/workflows/jarvis-five-phase-qualification.yml' provides separate PASS/FAIL for **software gates**.
A green CI workflow is not live acceptance. Claim production-qualified status only after exact-build Cloudflare deployment, founder session smoke, independent source evidence, and a reversible recovery/drill record.
Maintain a mandatory HOLD for unverified underlying business source truth, full autonomous decision power, model improvement, and real-document multimodal accuracy until those validations exist.
