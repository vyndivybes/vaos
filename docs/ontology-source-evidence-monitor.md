# Ontology Source Evidence Monitor (Ponytail P0)

A small, founder-only, read-only operator view over **existing** private Supabase receipt, projection and processing watermark tables. No new database, queue, graph engine or agent framework.

- `GET /api/ontology/health` uses the existing `vaos-control` server-key protected RPC; it returns strictly whitelisted metadata, never ERP properties or raw rows.
- Three sources: inventory, shortages and open POs. A missing receipt is `HOLD / NO_SIGNED_RECEIPT`, not an invented stock zero. Extraction-age thresholds are 15 min / 15 min / 60 min, **not** proof of source freshness or source CDC.
- Even a recent receipt remains `SOURCE_UNVERIFIED`. The overall status is always `HOLD`; `agentUsable=false`, `actionAuthorized=false` and `productionWriteAuthorized=false`.
- Existing source-ingestion feature remains disabled; no scheduled hydration, commission or PO execution is introduced. The workspace automatically loads and can manually refresh this read-only evidence monitor.

Qualification: isolated PostgreSQL 16 source-health SQL, founder HTTP deny-before-I/O tests, full VAOS regression checks and Cloudflare release verification. Production database migration and Supabase Edge Function must be reconciled independently from the GitHub merge.
