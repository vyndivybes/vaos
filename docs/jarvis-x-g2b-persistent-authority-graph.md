# VAOS JARVIS X — G2b Persisted Authority Graph (2026-10-13)

## Authority and implementation
G2b reuses the **existing, durable, RLS-enabled** `vaos_private.digital_thread_links` Postgres table rather than creating a parallel graph store or indexing proprietary documents. The canonical VAOS business and engineering records retain ownership; a relation is eligible only when created through an intent-bound, leased `DIGITAL_THREAD.CREATE_LINK` job that **SUCCEEDED**, and both linked source records still exist in their controlled domain tables.

Canonical source domains for this first audited slice: `QA_CAPA`, `ENGINEERING_BASELINE`, `PROJECT_RISK`. This is **not** a claim that VYNDI OS commercial, finance, VEDM and VIBPE knowledge have all been ingested. The graph is intentionally narrow. Other domains and unrestricted sources are not silently inferred.

## Read-only access and privacy
- Authenticated founder-only Cloudflare API: `GET /api/jarvis-authority-graph`.
- Existing `SUPABASE_URL` and sealed `VAOS_DB_RPC_SECRET` Worker bindings, existing `vaos-control` Edge Function, new read-only `vaos_jarvis_graph_snapshot` SQL function. No public/anon/authenticated direct SQL execute rights; `service_role` RPC and server-key check are required.
- Deterministic SHA-256 **pseudonymous** node and link IDs derived from random internal UUIDs. No plaintext UUID, context, free-text descriptions, customer/personnel names, email addresses, authorization tokens, payloads or record contents in the projection. Pseudonymous IDs are **not encryption or an independently verified digital signature**.
- At most 100 eligible links returned, newest first internally; larger graphs need future pagination. The response does not certify completeness beyond the bounded projection.
- Created-at timestamp is the **link creation time**, not source-record update time. No causal proof, engineering release or verified forecast is inferred.
- Zero extra AI calls, new secrets, paid provider subscriptions, database write paths, scheduled tasks or Durable Object namespaces.

## Retention and disaster recovery
G2b stores **no new user/business rows**. Retention and deletion obligations remain with the existing `digital_thread_links` canonical ledger; there is no independent duplicate index or uncontrolled cache. Existing authorized DB snapshot/restore and row-retention procedures therefore govern the data. Never delete immutable governance links just to satisfy a graph retention request without the owning ledger's approved procedure.

**Recovery gate:** The live graph read, repeatability and source-audit count can be verified without a database write. A separate independent backup/isolated-restore drill of the underlying Postgres ledger must pass before claiming full G2b disaster recovery certification. A SQL projection cannot itself prove recoverability.

## Qualification limitations
- **Proven durable:** Canonical Postgres links are persistent; read-only bounded authoritative projection.
- **Not proven:** Cryptographic link signatures, independently verified source-document versions, source freshness, third-party VYNDI/engineering ingestion, cross-source contradiction adjudication, historical replay after restore, and GraphRAG semantic search.
- **HOLD:** If no eligible links, unavailable read service, invalid source data, missing server authorization or failure of independent restore proof. Never promote HOLD to production optimization or VAOS autonomous decision authority.
- Snapshot counts and metadata are advisory, founder-only and subject to the current governance, role and source authority restrictions.

## 5P execution & acceptance
**Plan:** Audit live VAOS Postgres and reuse existing governed ledger. **Prepare:** Test exact metadata shapes, privacy, forged source, legacy links, no-key rejection and fail-closed handling. **Proceed:** Add read-only SQL RPC, Edge operation and founder-only API. **Perform:** Verify migration, read-only production API, denial for unauthenticated requests, CI, live control-plane RPC and compare database counts. **Persist:** Merge source changes and preserve migration and qualification record.

**Release criterion:** Functionality may be accepted as a **bounded operational persistent graph slice** on live DB + API proof. **Full enterprise-wide G2b** and independently qualified recovery remain **HOLD** until the noted evidence exists.
