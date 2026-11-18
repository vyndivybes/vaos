# AI Independence: bounded development integration

This stage adds a fixed synthetic text probe to the existing founder-only
`POST /api/jarvis-multimodal` route with operation `DEVELOPMENT_TEXT_PROBE`
and `confirm: true`. Every other field is rejected. Session, founder,
same-origin and JSON checks execute first. It does not use the vision flag.

## Activation remains HOLD

No secrets, flags, billing, infrastructure, provider retirement or business
records were changed. New inference is disabled unless server configuration
contains **all** of:

- `VAOS_AI_DEVELOPMENT_CONTROL=synthetic-one-shot-v1`.
- A server-only `GEMINI_API_KEY` independently matched to the reviewed project.
- `VAOS_AI_FREE_TIER_EVIDENCE`: bounded JSON with `id`, `project`, exact
  `model=gemini-3.8-flash`, `tier=free`, `billingEnabled=false`, `approved=true`,
  integer epoch-millisecond `reviewedAt` / `expiresAt` (maximum 24h validity),
  and positive observed project `rpm`, `rpd`, `tpm` (at least 768).
- An R2 `VAOS_ARTIFACTS` binding with conditional object creation available.

The evidence object is an operator attestation, **not a billing API check**.
The operator must verify region/terms eligibility, project-key identity, no
billing account, remaining quota and approval before enabling it. The fixed
prompt must not be expanded with private code, documents, history or RAG.
Gemini output must not be used to train or distill a competing model.

Each reviewed evidence ID admits **one request for its lifetime**, reserved
atomically before network access with an R2 conditional put. Failure, timeout,
restart or a new adapter instance does not refund that reservation. Do not
delete it or generate IDs automatically. This is not a general distributed
RPM/TPM limiter; shared project use still needs quota coordination. Model,
fixture, time and outcome are audited; prompts, responses and credentials are
not stored. Only whether the fixed answer was accepted is returned. Audit
failure prevents qualification. No model output authorizes tools or writes.

Both Gemini and local adapters reject redirects; model errors are sanitized.
The local adapter reaches only `http://127.0.0.1:11434`, for local Node use.
Cloudflare cannot reach the owner's PC loopback. A separately authenticated,
qualified self-hosted bridge remains required for cloud-to-local integration.

## Audit boundaries

- Existing founder chat calls Workers AI with mission/evidence context in
  `apps/web/lib/founder-ai-draft.mjs` and related context/multitopic drafts.
- Existing multimodal/document/video paths use Workers AI and user excerpts.
- Existing business advice and voice AI remain outside this synthetic probe.
- The new path does not replace or certify those existing provider call sites,
  and does not grant global no-cost or privacy qualification to the app.

## Verification and release

`npm run test:ai-independence` exercises gate, adapters, route authorization,
existing multimodal behavior and a real local R2 conditional-reservation race.
Provider responses in these tests are simulated. The separate Windows Ollama
smoke used installed `gemma3:1b`, returned `2`, and measured 27 input / 3 output
tokens through SPARK's Models adapter. It proves one local text path only.

Keep the PR draft until exact-head CI, protected release review, authenticated
runtime smoke and real credential/quota admission pass. Production
independence still needs >=20 independently judged missions at >=95%, zero
critical violations, 72h provider-off evidence, multimodal, memory, learning
and recovery qualification. No provider is disconnected by this stage.

Sources reviewed 2026-11-18:
[pricing](https://aistudio.google.com/docs/pricing),
[limits](https://aistudio.google.com/docs/rate-limits),
[billing](https://aistudio.google.com/docs/billing),
[terms](https://aistudio.google.com/docs/terms),
[R2 conditional writes](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
