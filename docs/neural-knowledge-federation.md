# VAOS Neutral Knowledge Graph — read-only VYNDI/SPARK federation

Status: **founder-readonly gateway enabled in source configuration; production connection and live source availability remain unverified** (6 November 2026).
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
`vyndi-vedm`, `graphify`, `graphiti`, `llm-wiki`, `brain-atlas`, `obsidian`, `dify`, `registry`.

The gateway stays **off unless** `VAOS_NEURAL_KNOWLEDGE_CONTROL=founder-readonly-v1` is explicitly provisioned. The founder-only value is proposed in `wrangler.jsonc`; it does not commission external sources or authorize writes. It requires a founder session, refuses non-GET and arbitrary query parameters, returns no-store JSON, and masks upstream failures. It never accepts source bodies or arbitrary URLs from a client.

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

Graphify/Brain Atlas/Dify workflow metadata payload: `nodes: [{id,title,type}], edges: [{source,target,type}]`.
Graphiti payload: `entities: [{id,name}], facts: [{source,target,relation,valid_at?,invalid_at?}]`.
Wiki/Obsidian reviewed notes payload: `pages: [{id,title,sourceRef}], links: [{from,to,relation}]`.
No raw text bodies, external contacts, credentials, personal episode content, non-allowlisted node fields or business writes are exported.

## Required evidence before operational declaration

1. **VYNDI OS first:** pass the VEDM projection tests; deploy signed read action through normal reviewed CI. Verify source commit, replay resistance, signed identity, bounded graph size, no mutation and correct engineering holds.
2. **VAOS:** verify `npm run test:neural-knowledge`, Cloudflare dry-run and route registration. Do not change existing business transaction adapters.
3. **Live signed read:** authenticate as founder and call `?source=vyndi-vedm`; compare node/edge IDs, source commit, old/new gate status and returned authority against independent VYNDI source. Only then record a live verification result.
4. **Opt-in SPARK imports:** curate and inspect a snapshot offline, upload only approved metadata to existing R2, hash it, configure exact hash, verify retrieval, PII removal and node/edge equality. Never expose the SPARK localhost Graphiti endpoint to the internet.
5. **Release decision:** qualified read-only knowledge can inform explanations, but not release, purchasing, payments, payroll, ledger, production or engineering approvals. Keep all graph-derived statements source-linked with validity timestamps.

No application secret, token, API subscription, and no local-PC installation is included in this PR.

## 6 November 2026 — Unified Neural Intelligence source hub

The browser now exposes seven source panels, searchable/pannable/zoomable graph views, and node/source provenance inspection. `Neural Schema` denotes an interchange contract, not a separately operating inference service. Obsidian supports metadata-only note backlinks and Dify supports metadata-only workflow topology. Neither raw source bodies nor untrusted URLs are rendered; no demo nodes are fabricated.

**Not commissioned by this change:** remote access to the user's local SPARK machine, unreviewed Obsidian note bodies, Dify workflow execution, unattended synchronization, or certified live business state. The VYNDI signed export remains a reviewed engineering-reference graph.

### Commissioning checklist (free-tier infrastructure only)

1. Review and redact source metadata. Do not import contacts, private notes, credentials, employee data, private conversations or operational secrets. Pin an exact source revision and observed time.
2. Produce envelope `schemaVersion=VAOS_NEUTRAL_GRAPH_SOURCE_V1`, an exact permitted `sourceType`, lowercase 40/64 hex `sourceRevision`, ISO `observedAt` and approved bounded `payload`.
3. For Graphify, Graphiti, LLM Wiki, Brain Atlas, Obsidian and Dify, upload the approved envelope to `VAOS_ARTIFACTS` at `knowledge/neutral-v1/<sourceType>.json`, then configure its exact SHA-256 UTF-8 digest in `VAOS_NEURAL_GRAPH_SNAPSHOT_HASHES`. A bucket or hash setting alone does not prove a successful source read.
4. For VYNDI OS, verify the signed `KNOWLEDGE.OBSERVE_VEDM_GRAPH` endpoint, provenance, replay resistance, returned node/edge counts and read-only authority.
5. Authenticate as founder and inspect `GET /api/neural-knowledge?source=registry`, every permitted source API and `/neural-knowledge.html`. `401`, `403`, `409`, `503` or an empty node set must not be labeled operational PASS.
6. Run `npm run test:neural-knowledge`, Cloudflare dry-run, regressions and authenticated browser acceptance before a production claim.

**HOLD policy:** Unavailable source, failed signature, mismatching hash, absent R2 object or invalid schema remains visibly HOLD. Missing evidence never becomes decorative graph data.

### Workers Free variable-limit correction (6 November 2026)

Cloudflare Workers Free permits at most 64 text/secret variables per Worker. A dedicated `VAOS_NEURAL_KNOWLEDGE_CONTROL` binding caused deployment to fail with error 10055 at 65 variables. The founder-readonly control is now allowlisted in `apps/web/lib/feature-flags.mjs` and provisioned inside the existing `VAOS_FEATURE_FLAGS` JSON bundle, preserving the previous number of Worker variables. Tests assert that the standalone variable is absent and that the bundled control is actually read by the gateway. No paid upgrade is required.
