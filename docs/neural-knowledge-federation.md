# VAOS Neutral Knowledge Graph — read-only VYNDI/SPARK federation

Status: **source integration prepared; production disabled/unverified** (3 November 2026).
Repositories: `vyndivybes/vaos`, `vyndivybes/vyndios`, `vyndivybes/spark`.
No new service or paid inference subscription; no automatic migration of the personal Graphiti graph.

## Architecture

- **VYNDI OS authority graph:** owned by `src/lib/vedm-authority-graph.ts`; projected in VYNDI OS by `src/lib/vaos-knowledge-graph-export.ts` and accessed through the *existing* P-256 signed `POST /api/vaos/bridge` with `KNOWLEDGE.OBSERVE_VEDM_GRAPH`. VAOS must never reinterpret a reviewed reference as a live release decision. Use the original source revision in all answers.
- **Graphify:** SPARK architecture/business graph metadata. SPARK's local `graphify-out/graph.json` and packaged reference inventories are *not* public APIs; VAOS can read only an explicitly reviewed metadata-only snapshot stored in its existing R2 bucket.
- **Graphiti:** SPARK's embedded Kuzu/Graphiti temporal knowledge with valid/invalid fact dates. No default upload from SPARK, no tunnelling to the user's PC. Review facts and redact personal/private episode bodies before creating a curated snapshot. Derived relationships remain model-derived, never authoritative.
- **LLM Wiki:** an optional curated, source-referenced wiki snapshot contract, not a discovered or commissioned provider. No LLM-generated answers, no raw wiki corpus or unqualified citations are imported. Wiki links are advisory.
- **Neural Schema:** `integrations/neural-knowledge/neutral-schema.mjs` is a **provider-neutral graph interchange format**, not a new neural inference service. It carries node identity, type, sourceRef, edge relation, Graphiti valid/invalid dates, pinned revision, observedAt, explicit authority class and refusal flags.
- **Brain Atlas:** the SPARK Neural Atlas/Brain Map inventory metadata can share the neutral-schema graph viewer, without copying the local 3-D rendering/runtime or personal note text. It is a snapshot, not live VYNDI OS current state.

## VAOS user-facing surface

`/neural-knowledge.html` — Founder Brain Graph; interactive nodes/edges, source inspector, provenance, source registry and explicit HOLD messages. No synthetic demo results. The authenticated read route is `GET /api/neural-knowledge?source=` with one of:
`vyndi-vedm`, `graphify`, `graphiti`, `llm-wiki`, `brain-atlas`, `registry`.

The gateway is **off unless** `VAOS_NEURAL_KNOWLEDGE_CONTROL=founder-readonly-v1` is explicitly provisioned. Prefer adding that exact string key/value to the existing bounded `VAOS_FEATURE_FLAGS` JSON bundle: production already uses all 64 free-tier variable slots, so a new direct binding would require a paid upgrade. Preserve every other bundle entry. A legacy direct binding, if present, takes precedence (including an explicit `off`). Checked-in defaults do not activate the gateway. It requires a founder session, refuses non-GET and arbitrary query parameters, returns no-store JSON, and masks upstream failures. It never accepts source bodies or arbitrary URLs from a client.

Record source SHA through the reviewed Git tree, build provenance and Worker version annotations; do not consume a new environment-variable slot solely for a release label. For rollback, remove only the neural key from the bundle or set it to `off`, retaining all other controls, and restore the recorded flag-OFF Worker version if needed.

## Source admission & cost controls

- VYNDI: existing `env.VYNDI` service binding plus the existing Supabase-controlled bridge signer; the VYNDI route must be deployed first, with durable nonce replay protection, signed context and the new exact action allowlist. There is no additional token requirement.
- Other providers: `env.VAOS_ARTIFACTS` existing R2, **hardcoded paths** `knowledge/neutral-v1/<source>.json` and `VAOS_NEURAL_GRAPH_SNAPSHOT_HASHES`, a JSON object whose per-source values are independently reviewed lowercase SHA-256 hashes of the exact UTF-8 file bytes. The snapshot must have `schemaVersion=VAOS_NEUTRAL_GRAPH_SOURCE_V1`, an exact `sourceType`, 40- or 64-hex `sourceRevision`, ISO `observedAt` and a bounded `payload`. Missing/mismatched hashes, objects and oversized files HOLD closed.
- Explicitly review each source for access rights, cost, residency and PII. Only existing free-tier resources may be used; actual R2 usage remains subject to the configured Cloudflare quota. No automatic scheduled jobs or subscriptions are created.

Snapshot example (illustrative schema only; do not upload fake source data):

```json
{
  "schemaVersion":"VAOS_NEUTRAL_GRAPH_SOURCE_V1",
  "sourceType":"graphiti",
  "sourceRevision":"<40-or-64-hex-pinned-source-revision>",
  "observedAt":"2026-11-03T07:00:00Z",
  "payload":{
    "entities":[{"id":"approved-node-id","name":"Reviewed reference"}],
    "facts":[]
  }
}
```

Graphify/Brain Atlas payload: `nodes: [{id,title,type}], edges: [{source,target,type}]`.
Graphiti payload: `entities: [{id,name}], facts: [{source,target,relation,valid_at?,invalid_at?}]`.
Wiki payload: `pages: [{id,title,sourceRef}], links: [{from,to,relation}]`.
No raw text bodies, external contacts, credentials, personal episode content, non-allowlisted node fields or business writes are exported.

## Required evidence before operational declaration

1. **VYNDI OS first:** pass the VEDM projection tests; deploy signed read action through normal reviewed CI. Verify source commit, replay resistance, signed identity, bounded graph size, no mutation and correct engineering holds.
2. **VAOS:** verify `npm run test:neural-knowledge`, Cloudflare dry-run and route registration. Do not change existing business transaction adapters.
3. **Live signed read:** authenticate as founder and call `?source=vyndi-vedm`; compare node/edge IDs, source commit, old/new gate status and returned authority against independent VYNDI source. Only then record a live verification result.
4. **Opt-in SPARK imports:** curate and inspect a snapshot offline, upload only approved metadata to existing R2, hash it, configure exact hash, verify retrieval, PII removal and node/edge equality. Never expose the SPARK localhost Graphiti endpoint to the internet.
5. **Release decision:** qualified read-only knowledge can inform explanations, but not release, purchasing, payments, payroll, ledger, production or engineering approvals. Keep all graph-derived statements source-linked with validity timestamps.

No application secret, token, API subscription, and no local-PC installation is included in this PR.
