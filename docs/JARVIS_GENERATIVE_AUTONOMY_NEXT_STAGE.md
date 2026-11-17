# VAOS JARVIS — Next stage: governed generative agentic autonomy
Date: 18 November 2026; starting baseline: GitHub main 7edf2124, Cloudflare v841.

## Scope
Manual founder-only L2 advisory canary on the existing Cloudflare Worker. New endpoint: POST /api/jarvis-autonomy-investigate. Input:
{"operation":"INVESTIGATE","confirm":true,"question":"Analyse finance and material shortages"}.

Requires signed founder session, same-origin POST, strict input, allowlisted read-only source planner, existing signed VYNDI bridge, and sanitized data-agent observations. The Workers AI model sees only domain/status/bounded selected record counts, never raw ERP data, source bodies, customer/employee IDs, credentials or the original question. Model tools are prohibited. The independent source gate overrides PROCEED when source revisions are unverified.

The consolidated flag VAOS_AUTONOMOUS_INVESTIGATION_CONTROL=founder-manual-readonly-v1 requires no new secret. A separate R2 conditional atomic budget allows at most TWO explicit inference requests per UTC day. Missing quota storage, invalid state or racing claims HOLD closed. Only the quota marker is written; no source/model output, business transaction or auto-scheduled mission is written. Never infer that model processing is local; check provider data processing and pricing before wider promotion.

## 5 unresolved phases and promotions
1. ORCHESTRATION: Code now supports bounded signed read -> constrained L2 model -> deterministic source gate. Missing independent 16-agent role certification, durable multi-agent generative handoffs, authenticated live acceptance and action-specific L4/L5 authorization.
2. BI AND GRAPH: Existing source observations and integrity-pinned Graphify/Brain Atlas/LLM Wiki snapshots exist. Missing independently verified source revisions and fresh signed VYNDI enterprise business truth, plus consented Graphiti and Obsidian temporal synchronization.
3. PREDICTION: MAE/RMSE and empirical maximum error band are implemented; not calibrated and not separately evaluated from model selection. Missing reconciled actual demand/revenue datasets, independent holdout and audited uncertainty.
4. PERSISTENCE: Explicit founder-consented R2 aggregate evaluation ledger and replay exist. Missing independently reviewed outcome labels, versioned model comparisons, measurable improvement, retention/revocation tests. There is NO self-training or autonomous model promotion.
5. MULTIMODAL: Source-pinned preview document/image endpoints exist. Missing authenticated end-to-end execution with independently labeled real engineering figures and documents, accuracy evaluation, provider processing review and free-tier quota acceptance.

## 5P qualification
PLAN: scope low-risk mission and authorized data sources.
PREPARE: verify provider free-plan budget, founder session, risk controls and exact source revision.
PROCEED: manual bounded canary; never auto-call unrestricted tools.
PERFORM: run exact-SHA CI, Cloudflare deployment, signed-source comparison, unauthorized and failure-case testing.
PERSIST: append versioned evidence, test outcomes and explicit holds without private customer data.

Future L3 PREPARE requires verified source revision, policy and lineage. L4/L5 requires independent executor qualification, signed specific authorization, idempotency, reversible stop, audit, recovery drill, budget and real production acceptance. Green CI and model output do NOT confer L4/L5 authority.

## Founder live acceptance
Sign in via an authenticated first-party session and submit the fixed POST payload. With source revisions still unverified the result MUST be HOLD even if model says PROCEED_WITH_REVIEW. Confirm unauthorized 401/403, write requests 422, disabled control 409, budget exhaustion 429, unsupported model 503. The first production test must record exact Cloudflare version, source bridge response, source revisions, and cost evidence.
