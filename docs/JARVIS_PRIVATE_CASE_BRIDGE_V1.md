# JARVIS Market Intelligence — Private Case-Study Bridge v1

## Purpose
Make the founder's original, previously saved Business Cases 001 and 002 accessible to VAOS JARVIS Market Intelligence, without publishing private financial research or depending on the ChatGPT Drive session at runtime.

**Source status (6 November 2026):** A one-time, consented, read-only bootstrap from the user's connected personal Google Drive and matching private ChatGPT Library source files has populated the EXISTING Cloudflare R2 bucket `vaos-qualification-artifacts`. Source content never enters GitHub commits, public site assets, logs or query strings.

## Source manifest
- **CASE-001** original Google Drive ZIP: source SHA-256 `fff5d03190e0680d600ab4d3d5f318370a5c72e7ff78a601424070103423a9f4`; 185,932 bytes; five checksum-verified originals (one DOCX, one PDF, three XLSX). Individual *extracted research-text indexes* are stored as R2 `documents/case1-01-docx.json` ... `documents/case1-05-xlsx.json`. Source text and spreadsheet extraction are **not independently reconciled**.
- **CASE-002** original Google Drive PDF: source SHA-256 `5bf9ec36eb244ea5d9f60d55e7e8a4a4dd8274072d1db91042ed4dcbe4c3861b`; 58,134 bytes. Text extraction stored privately at `documents/case2-01-pdf.json`.
- **CASE-003:** repository source `knowledge/business-cases/BUSINESS-CASE-003.md` remains a **repository reference**, not an R2 attachment.

Private object key prefix: `runtime/market-case-bridge/v1/`. Original archives are under `seed/`; text indexes are under `documents/`. A source hash and SHA-256 of each complete text-index object are pinned in the **server-only** `apps/web/api/market-case-bridge.mjs`.

## Access and security guarantees
- **Authentication:** Founder-only, existing VAOS hardened session; nonfounders return 401/403 before any private R2 reads.
- **Storage:** Cloudflare R2 bucket has no enabled r2.dev public endpoint and no custom domain (independently checked). Objects are encrypted at rest by the provider.
- **Integrity:** Each R2 original archive and index must match its exact pinned digest. Missing, replaced, oversized or malformed records are HOLD; search/reader fails closed.
- **Exposure:** GET-only `/api/market-case-bridge`; no arbitrary R2 object keys, raw archive proxy, public unauthenticated endpoint, model-generated quantities or business mutations. Query terms are bounded and never forwarded to external services.
- **UI:** Private source text is inserted with `textContent` only; original file references link to Google Drive, where their original ACL still applies. No embedded instructions are executed.
- **Persistence:** The current private snapshots are durable R2 objects; observed R2 bucket lifecycle only aborts old incomplete multipart uploads, with no stored-object expiration rule. No automated delete task is attached to this version.
- **Explicit provenance:** A founder may elect to include Cases 001/002 as `USER_SUPPLIED` research references when preparing a new scenario; they are NEVER independently verified financial actuals merely because their bytes match.

## API
`GET /api/market-case-bridge` — pinned original and indexed-document status for Cases 001, 002, 003.

`GET /api/market-case-bridge?q=<research term>` — at most 12 bounded, attributed snippets (no generated explanation, no certified forecast).

`GET /api/market-case-bridge?case=BUSINESS-CASE-001&doc=case1-01-docx&offset=0` — 6,000-character window of full original source extraction; nextOffset for paging.

`GET /api/market-case-bridge?case=BUSINESS-CASE-002` — status and source index for one case.

## Important boundary: data persistence is not ongoing Google Drive synchronization
The **current documents are permanently indexed in R2** unless deleted by a person with the Cloudflare account's storage privileges or affected by a future lifecycle change. This is a durable snapshot bridge, not a claim of indefinite external Drive connectivity. The existing VAOS Google OAuth request permits Calendar events only. ChatGPT's Google Drive connector is a different principal and does **not** grant the Worker rights to read later versions.

A future automatic Drive refresh requires **separate, explicit, least-privilege Google Drive authorization** on VAOS, a documented review of Drive API scopes and permissions, safe raw-file extraction, versioned indexes and staged rollback. Do not add unrestricted `drive.readonly` scope to the Calendar OAuth without review. Do not publish private Drive files or Google OAuth tokens to GitHub.

The bridge must continue to serve these pinned, verified snapshots even if the original Google Drive connection is revoked; a revoked account must never be used for future refreshes.

## Tests and release gates
- Focused tests cover founder access denial, checksum tampering, missing original archives, bounded search, document retrieval, browser source rendering and explicit reference inclusion.
- Dedicated `.github/workflows/secure-market-case-bridge.yml`, plus `npm run test:market`, `npm run test:web` and existing Cloudflare/security/recovery CI.
- Production release remains governed by the existing `JARVIS Controlled Release` workflow. Public unauthenticated browser acceptance can demonstrate denial only; end-to-end founder browser/source readback requires an authenticated session.

## Data-quality limitations
- Financial Excel workbooks are parsed as **indexed research text**. No independent formula recalculation, external supplier quotations, audited balance sheets, TAM/SAM/SOM, capital approval or manufacturing clearance is inferred.
- Text content is **untrusted source material**. The retrieval API only quotes with provenance; any LLM summarization must treat excerpts as data, not instructions, with source and context checking.
