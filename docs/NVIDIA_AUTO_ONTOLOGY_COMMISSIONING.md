# NVIDIA Auto Ontology commissioning for VAOS

## Commissioned boundary

This is a **read-only** commissioning preflight, not production inference or data ingestion.

VAOS exposes a founder-only **readiness probe** in the existing BI Studio and
`GET /api/nvidia/ontology/readiness`. It uses the authenticated VAOS session
and existing `VAOS_ONTOLOGY_SOURCE_CONTROL=founder-readonly-v1` feature control.
The optional explicit `VAOS_NVIDIA_ONTOLOGY_CONTROL` flag overrides this
source control if configured in the existing feature-flag bundle.

The probe uses **only** the official authenticated Next.js HTTPS API gateway.
It checks:

1. `GET /api/semantic-compilation/status` — `calculated===true`;
2. `GET /api/connections` — `count>0`;
3. `GET /api/datasources/dbs` — at least one ingested catalog entry.

All calls are GET, with explicit no-cache, no redirects, a bounded response,
and a short timeout. VAOS does not send VYNDI records, SQL, user prompts,
source rows, cookies, or source credentials to Auto Ontology. No answer or
model inference is executed by this phase. If an endpoint, auth, permission,
connection, catalog or network requirement fails, report **HOLD**. The UI
distinguishes a READY *service preflight* from a verified business answer.

The source of business data remains the signed VYNDI OS read bridge. Its
existing origin, training-data exclusions, provisional states, and provenance
rules remain authoritative. Do not create SQL access to VYNDI production
tables from an external service or replicate company data into Auto Ontology
until a scoped dataset, storage, retention, access, and consent review is
completed and independently qualified.

## Infrastructure prerequisite

Per [NVIDIA Auto Ontology](https://github.com/NVIDIA/auto-ontology),
a complete runtime needs the separate Next.js gateway, Python FastAPI service,
ingestion worker, Postgres with pgvector, and inference configuration (normally
NVIDIA NIM). Cloudflare Workers cannot host that stack. No extra paid
infrastructure is permitted. **Skills do not install or run a server.**

The official `nvidia-ontology-setup` skill is installed in
`.agents/skills/nvidia-ontology-setup` for Helm/Kubernetes or Docker Compose
commissioning. Installation still requires choosing an existing, compliant
hosting target; the live service has **not** been provisioned by this change.

Configuring an existing deployment requires two secure Cloudflare Worker
secrets/bindings (never commit their values):

- `NVIDIA_AUTO_ONTOLOGY_URL` — exact public HTTPS origin of Auto Ontology's
  Next.js *web application*, not internal FastAPI;
- `NVIDIA_AUTO_ONTOLOGY_API_TOKEN` — scoped token created inside Auto Ontology,
  with permission to read the compilation status, connections, and catalog.

Use Cloudflare's secrets UI or a secure secret manager to set these values.
Do not paste credentials into chat, GitHub, scripts, source control, or PR
comments. An admin-only read scope may be needed for `GET /api/connections`;
if unavailable, VAOS deliberately returns HOLD instead of inferring a working
database connection. External Auto Ontology admin users and the NIM key must
be configured **inside the independent service**, not in VAOS.

## Qualification gates

```sh
node --test integrations/nvidia-auto-ontology/readiness.test.mjs
node --test apps/web/api/nvidia-ontology-readiness.test.mjs
npm run test:bi
npm run test:web
npm run verify:web
npm run lint
```

Validate an authenticated founder session in a real browser: navigate to the
existing BI Studio, click **Check NVIDIA ontology readiness**, verify HOLD
against missing credentials, verify the three remote checks only after proper
configuration, and confirm no source records, tokens, or raw SQL are exposed
in the response. A service READY verdict does **not** prove that the live
datasets, trained model answers, full lineage or visualization are correct.

Only after a signed, reversible, independently approved semantic-model
publication and a verified source read should live question answering be
commissioned. Do not silently call `POST /api/model/import` with
`replace=true`, semantic-compilation reset, or any purchase, accounting,
HR, inventory or manufacturing write.

## Verified limits

- Zero new runtime dependencies, hosting plans, secrets or billing changes.
- No production dataset replication, no unlocked write API, no GPU requirement.
- NIM/API credit availability and the user's external hosting resources
  remain separately unverified; no assumption of unlimited free usage.
- No readiness probe can replace an end-to-end authenticated business query
  and reconciliation against the original signed source.
