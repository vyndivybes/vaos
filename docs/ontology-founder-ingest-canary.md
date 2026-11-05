# Ponytail P0.1 — Founder-only durable receipt canary

POST `/api/ontology/ingest-canary?source=inventory|shortages|purchaseOrders` is a founder-session and same-origin protected manual canary. It is **disabled by default**. It requires `VAOS_ONTOLOGY_INGEST_CONTROL=founder-canary-v1` in Cloudflare, configured only after exact-source and separate independent security/acceptance checks pass.

The handler reuses the existing VYNDI P-256 signed read client, existing VAOS Supabase control store and existing private `vaos_ontology_ingest_read_receipt_v1` RPC. No extra package, runtime, token, service, cron or hydration engine. Inputs accept a single enumerated source and no request body; output contains only status metadata, never ERP source rows.

A complete extract of at most 100 rows is persisted into the private source receipts and object projections as `SOURCE_UNVERIFIED`. Invalid hashes, inconsistent route authorities, incomplete pages and store errors cause HOLD before any business action. No agent authority is granted: `agentUsable=false`, `actionAuthorized=false`, `productionWriteAuthorized=false`.

Qualification: `node --test apps/web/api/ontology-ingest-canary.test.mjs apps/web/api/ontology-source-status.test.mjs platform/ontology/durable-receipt-ingestor.test.mjs platform/persistence/supabase-store.test.mjs`. GitHub CI also tests the actual PostgreSQL migration against isolated PostgreSQL 16 and runs `npm test`.

Live activation procedure: (1) merge green PR; (2) deploy Edge Function revision exactly matching reviewed GitHub; (3) verify VAOS/VYNDI Worker source versions; (4) enable only the specific founder canary feature flag; (5) POST once from an authenticated same-origin founder session; (6) independently inspect private receipt count, watermark and source hash; (7) disable the flag pending review. No automatic scheduled processing or procurement writes are enabled by this work.
