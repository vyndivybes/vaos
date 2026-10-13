# JARVIS X — G2b.2 Source Authority Audit and Isolated Metadata Replay
Date: 2026-10-13. Classification: founder-only supervised, **read-only**.

## Why this stage exists
The deployed G2b authority graph stores governed links between VAOS quality/CAPA, engineering baseline and project-risk records, but link creation does not certify that the underlying record is current, unchanged, free of contradiction or recoverable after a database incident.

G2b.2 adds a **separate, on-demand, founder-only audit** under `GET /api/jarvis-source-audit`. It does not increase routine query costs or change the existing Ask VAOS path. It calls the existing authenticated Supabase Edge adapter, whose new `jarvisSourceAudit` operation invokes the read-only SQL RPC `vaos_jarvis_source_audit`. Only aggregate counts leave the database.

### Acceptance measures
- Count all existing durable links and qualify links only where creation was a successful leased, intent-bound `DIGITAL_THREAD.CREATE_LINK` job with both source and target rows present. Qualifying a link does **not** certify source-document version.
- Compare the source/target `updated_at` to the link's creation time; disclose post-link changes, absent timestamps and future-dated timestamps. A comparison by itself cannot certify a business record's factual completeness, ownership, or current-world freshness.
- Check source and target endpoint job SUCCESS counts; this is provenance evidence, **not** cryptographic signatures.
- Expose legacy and unqualified counts, preserving HOLD without creating new links.
- Require the same server-key RPC / service-role and authenticated founder access; raw rows, IDs, context, free text, names and emails never appear in the audit.
- Keep `sourceVersionSignatureVerified=false`, `sourceDocumentVersionsIndependentlyVerified=false`, `semanticContradictionsResolved=false` and `fullDatabaseRecoveryQualified=false` until separately proven.

## Recovery experiment
`verifyMetadataRoundTrip` performs deterministic serialization, SHA-256 checking and reconstruction of an **allowlisted pseudonymous graph projection in isolated JavaScript memory**. It refuses raw records, extra fields, duplicate IDs and malformed identifiers; it never writes production or reconstructs PostgreSQL ledger data. **This is a metadata round-trip exercise, not independent disaster recovery or a real `pg_dump`/restore acceptance.**

Supabase Free has no managed daily downloadable backups or free PITR. The independently scoped real restore milestone requires an actual logical export via an authorized database connection (e.g., Supabase CLI `db dump`), encrypted offsite retention, and restore to a separate authorized PostgreSQL instance. Do not create paid Supabase branches or enable PITR automatically.

## Evidence: five P
**Plan:** Audit data authorities and verify no new DB storage needed.
**Prepare:** Negative tests for forged certification, validation, forbidden writes, missing credentials and tampered metadata.
**Proceed:** Add append-only SQL function, fixed Edge operation and founder-read-only Worker endpoint.
**Perform:** CI and live database grant/aggregate checks; Cloudflare production deployment; HTTP 401 unauthenticated smoke; safe fail closed.
**Persist:** Merge verified source and publish the remaining LIVE acceptance/restore gates.

### Gates not waived
Full G2b enterprise ingestion (VYNDI OS, VEDM, VIBPE), document signature/version attestation, semantic conflict resolution, independent backup and restore, and live signed-in end-to-end graph read. G3 engineering/financial production forecasting remains sandbox-only until source and recovery qualification.
