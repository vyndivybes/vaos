# P0.1 — Durable ontology receipt staging, NOT business readiness

This migration adds a **private** append-only read-receipt log, source processing watermark, and per-source object projection in `vaos_private`. The only service-role RPC requires the existing VAOS server-key check and stores *complete, bounded, content-addressed read receipts* as `SOURCE_UNVERIFIED` with `agentUsable=false`.

At the SQL boundary the content hash is treated as *upstream signed-client-verified input*, not independently recomputed or CDC-certified. The only adapter that may call the service-role store is `platform/ontology/durable-receipt-ingestor.mjs`, disabled by default. Deployment must separately bind that adapter to an authenticated, explicitly approved source-extraction worker and the server-controlled RPC; no such binding is activated by this PR.

Invalid rows, duplicate identities, truncated pages and out-of-order or same-time conflicting extracts fail before writes. A valid complete source page archives its receipt, marks records absent from the latest page as not current, stores current projections as `SOURCE_UNVERIFIED`, and updates a processing watermark atomically. Prior receipts remain append-only; no deletions occur.

**This is not** an autonomous PO pipeline, qualified digital twin, reconciled source revision, cross-system entity-resolution system, Cloudflare cron, or grant to existing digital employees. No VYNDI production record or VAOS autonomous write authority changes.

Qualification command: `node --test platform/ontology/durable-receipt-ingestor.test.mjs`. The SQL must be independently validated on isolated PostgreSQL before migration promotion. Zero-cost resources only.
