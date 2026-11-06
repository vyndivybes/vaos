# VAOS Knowledge Universe v1

The Knowledge Universe is an embedded, founder-only, read-only explorer within apps/web/neural-knowledge.html. It does not create another dashboard shell.

## Visualizations
Five modes: Constellation, Lineage, Source lanes, Timeline and Directed relationship matrix. Users may select sources, search records, focus nodes, trace ancestors or descendants through 1–5 hops, and filter time-valid edges. Inspectors show the original source reference, revision, observation timestamp and integrity status. Larger views report their display limits.

## Source commissioning
- VYNDI OS: existing signed VEDM read; no engineering release authority.
- Graphify, Graphiti, Obsidian, LLM Wiki and Brain Atlas: existing reviewed, SHA-256-pinned R2 metadata snapshots. All uncommissioned sources stay on HOLD.
- Dify: existing approved provider reader or metadata snapshot.
- Gmail/Drive: explicit private founder OAuth and on-demand search only. Search-result metadata stays in the active browser session; no mail bodies or Drive document contents are ingested.
- GitHub evidence: existing repository allowlist. Repository inventory: new founder-only read of repositories visible to the configured VAOS GitHub credential; up to 500 entries, no file bodies or permissions copied.
- ChatGPT history: local user-selected conversations.json export. The import creates conversation and reply metadata but discards message content, with no upload.

## Security and integrity
Authenticated, read-only OBSERVED results only. Nodes are namespaced by source; matching names do not merge automatically. Directed source relationships retain lineage and temporal validity. No synthetic records, automatic mailbox export, remote conversation import, approval propagation or permanent private graph cache. GitHub, Gmail, and Drive permissions from ChatGPT do not automatically grant VAOS permissions.

## Acceptance
Run npm run test:neural-knowledge and the Cloudflare Worker bundle and browser verification checks. Verify actual founder permissions and signed source data after deploying an exact reviewed SHA. Do not claim complete ingestion of all Gmail, Drive, repository history or ChatGPT message bodies without dedicated incremental connectors, explicit consent and removal/revocation controls.

Known bounds: at most 500 discovered GitHub repositories; 20 MB local export, 5,000 conversations, 20,000 graph nodes; 180 visible nodes or 30 for the relationship matrix.

## Still required for full historical coverage
Graphify workspace authorization, commissioned Graphiti/Obsidian snapshots, each intended VAOS Google/GitHub account permission, and a separate consented incremental archive indexer with retention, deletion and source-reconciliation policies. No paid services or new credentials are introduced by this feature branch.
