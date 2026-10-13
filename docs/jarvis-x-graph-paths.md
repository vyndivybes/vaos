# Governed directed graph path queries

Founder-only GET `/api/jarvis-authority-graph?mode=paths&from=QA_CAPA&to=PROJECT_RISK` traverses the existing governed link projection. Domains are QA_CAPA, ENGINEERING_BASELINE and PROJECT_RISK; endpoints must differ. The default GET returns its existing snapshot.

One existing authenticated source read supplies at most 100 links. Traversal follows recorded directions (including RELATED_TO), prevents repeated nodes, stops at the first target-domain node, and limits each path to four hops. Results contain at most ten paths and examine at most 1,000 candidate edges. A detected eleventh path or work-budget exhaustion marks the bounded search incomplete. Deterministic link ordering makes repeated snapshot queries reproducible.

Each path retains only already-approved pseudonymous node/link identifiers, domains, relation types, creation time and governed-job provenance. Conflicting domain labels for one node fail closed. Unknown or duplicate query parameters fail before the source read. Session, founder, control, source configuration and no-store protections remain in force.

NO_PATH_OBSERVED means no path within this bounded projection; it never establishes absence of an enterprise relationship. Enterprise completeness is always false. Held legacy and unprojected link counts remain visible. Link creation does not certify current source freshness, record versions, signatures, causality or engineering release. No action or dispatch is authorized.

This increment supplies metadata traversal for requirements 01/02, not complete semantic GraphRAG or temporal-version acceptance. No database changes, business writes, model calls or new permissions. Independent restore and signed-in production acceptance remain open.

## Founder decision support

With supervised JARVIS investigation selected, type or speak “Show recorded links from quality to project risk.” The existing adaptive-intelligence endpoint also accepts “Trace recorded paths from engineering baseline to quality” in `mode=jarvis-x&eval=v3-readonly`. The bounded deterministic grammar accepts quality/QA CAPA, engineering/engineering baseline and project risk, with distinct endpoints. Broader questions retain their existing adaptive routing.

Matching questions use exactly one existing governed graph read and zero model calls, other domain reads or business writes. Numbered path references retain the corresponding pseudonymous link identifiers and relation types. Display and spoken responses explicitly require independent source review; missing/invalid sources return a sanitized source hold. No path produces HOLD, not an enterprise relationship denial. This is directed metadata retrieval, not semantic GraphRAG or independent consensus.
