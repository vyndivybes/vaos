# AI Independence Programme — 5P baseline (18 November 2026)

**Status: Phase 1 foundation only.** Not a production qualification, autonomous-learning claim, model deployment or authorization to disconnect providers.

## Mission
Use ChatGPT/Codex for software development and a vetted Gemini free tier for permissible experiments. Eventually SPARK, VAOS and VYNDI OS should operate their specified cognitive, multimodal, memory and agent functions without either development service at runtime. A real independent inference runtime will still be required.

## Scope
- SPARK: personal assistant, computer interaction, voice, multimodal context and memory; its local Windows workspace is NOT accessible here. Do not assume the separate personal-jarvis repository is SPARK.
- VAOS: governed enterprise missions, planning, business analysis, learning evidence, and controlled execution.
- VYNDI OS: ERP, MES, procurement, engineering, quality and finance intelligence; preserve provenance and financial controls.
- Reuse provider and qualification contracts, not customer records, personal data or credentials across projects.

## Phases and exit criteria
| Phase | Deliverables | Exit gate |
|---|---|---|
| 1 PLAN | Inventory models, agent authority, data classes and evidence quality | Unknowns documented as HOLD; reviewed architecture |
| 2 PREPARE | Portable inference gateway, data-classification policy, free-tier budget, local-provider adapter | Synthetic-only integration tests and secrets-free staged route |
| 3 PROCEED | Multimodal ingestion, grounded memory, tool planning and permission gates | Real input acceptance, replayable tests and verified authorization |
| 4 PERFORM | Governed autonomous missions and evaluated improvement loop | Independently scored held-out results and recovery drills |
| 5 PERSIST | Provider-off operations, monitoring, rollback, operator signoff | >=72h without external inference, >=95% success across >=20 adjudicated missions, no critical policy violations, confirmed multimodal and memory tests, measured held-out improvement |

These are target thresholds, NOT measurements. Good memory retrieval does not prove model-weight training or general cognitive independence.

## First implementation (VAOS only)
- File: platform/ai-independence/provider-router.mjs; tests: platform/ai-independence/provider-router.test.mjs.
- Development defaults to no external inference. Explicitly approved free external providers may receive only PUBLIC or SYNTHETIC content after the upstream classifier is trusted.
- Confidential content can only reach locally governed providers. Local-first selection and an explicit independence mode support provider-disconnection drills.
- Fail closed on missing capability, provider errors or policy mismatch. No silent fallback, paid routing or financial/engineering write authority.
- Evidence assessor returns HOLD or READY_FOR_HUMAN_REVIEW, never automatic disconnection. Claims are only as reliable as independently verified telemetry supplied by the caller.
- This module is not connected to the application runtime, Gemini API, Cloudflare secrets or an actual local inference server.

## Focused test and release policy
Run with Node.js 22: node --test platform/ai-independence/provider-router.test.mjs
Local baseline test: 12/12 pass. The full monorepo suite, CI, live model integration and production deployment have NOT been qualified by this change.
Never bypass protected release gates or use paid providers without explicit approval. Never store credentials, API keys, customer data or confidential engineering IP in free-tier model requests without approved terms.

## Next work packages
1. Inventory actual model callsites, runtime credentials/configuration and agent permissions in SPARK, VAOS and VYNDI OS.
2. Create a secrets-free Gemini development adapter only after checking model name, quotas and data terms; create an independently hosted/local adapter with realistic hardware feasibility.
3. Add usage quotas, classification validation, audit envelopes and unit/integration tests at the actual application callsites.
4. Qualify audio/image/document, knowledge provenance, memory and offline fallback against separate benchmarks.
5. Conduct provider-off qualification with independently collected evidence and operator-reviewed disconnection; preserve existing governance.

## Status terminology
IMPLEMENTED means code exists; UNIT_TESTED means isolated tests pass; INTEGRATED means an actual application route ran; DEPLOYED means a release is verified; QUALIFIED means independently reviewed acceptance evidence exists.