# VAOS historical source indexing commissioning

The encrypted history index is an incremental, manually initiated founder feature in the existing Neural Intelligence workspace. It supports source-specific Gmail messages and Google Drive files through Google's actual OAuth consent, not through ChatGPT's connected-account token.

## Boundaries

- The only storage destination is VAOS's private Cloudflare R2 bucket. Records and the page checkpoint are authenticated-encrypted with the existing non-extractable AES-256-GCM vault key; the encrypted corpus is not committed to GitHub.
- The index records Gmail text/plain (up to 10,000 characters) and selected Drive text. It does not extract PDFs, spreadsheets, attachments, images, scanned documents, or all HTML messages. Counts represent observed records, not certified full-text coverage.
- An explicit button fetches at most 12 items per operation. The checkpoint advances only after the records are written. LISTING_COMPLETE means the Google API list was exhausted; it does not certify content completeness.
- For cost control, sync stops before 12,000 indexed records per source. Additional free-tier consumption and the account's other R2 usage must be checked before raising that cap.
- Historical search scans at most 20 stored records per request and up to three pages per user query. Search coverage is bounded and explicitly not the entire archive.
- The Knowledge Universe can display source labels returned by the encrypted search without automatically copying mail or file content into other graph services.
- All endpoints require founder identity; POST requires same-origin browser requests. No agent writes or releases are authorized.

## Commissioning

1. Verify VAOS Cloudflare deployment of the exact merged SHA and the existing bound private R2 store and vault key.
2. Sign in to VAOS as founder and open /neural-knowledge.html.
3. Use **Authorize Gmail + Drive read access** and explicitly consent to the Gmail readonly and Drive readonly scopes. Calendar-only permissions are insufficient.
4. Choose **Index next Gmail page** or **Index next Drive page**. Repeat while PARTIAL, inspecting processed and skipped counts; do not treat HOLD as a complete archive.
5. Use encrypted archive search. Compare selected results against actual source records, and verify no tokens or raw source bodies appear in logs.
6. Graphify access requires a separately selected Graphify workspace. This repository cannot create one from a missing Graphify account membership.
7. Graphiti's embedded SPARK Kuzu database and Obsidian vault are local to SPARK's host, and were not sent to Cloudflare. They require an explicitly authorized private export, reviewed snapshot, or a securely deployed sync reader.
8. Full ChatGPT conversation bodies require a separate user-provided export and governed import process; the current local graph importer is metadata only.

## Remaining qualification

The endpoint and unit contracts passing CI demonstrate code behavior, not that Google granted scope, that a historical archive has finished indexing, or that an actual production Graphiti/Obsidian database has been commissioned. Record exact source cursors, source counts, skipped records, index/attachment coverage, and production session evidence before treating them as operational.
