# VAOS Automation & Integration Fabric — Definitive Single-Squash Release Plan

**PR:** #30  
**Branch:** `prep/automation-integration-fabric`  
**Target:** `main`  
**Landing strategy:** one squash merge  
**Intended squash title:** `feat: add governed VAOS Automation & Integration Fabric`

## Non-dilution rule

This document is the authoritative scope contract for PR #30.

No capability, provider family, governance control, failure-mode control or architectural boundary previously accepted for the VAOS Automation & Integration Fabric may be silently removed, narrowed or deferred. If implementation depth differs by provider, the provider/capability must still remain represented in the catalog, manifest model, qualification backlog and interface architecture.

Production activation remains separate from code merge.

## Core architectural invariant

```text
VYNDI / domain authority
  -> governed intent/event
  -> VAOS policy + RBAC/ABAC + capability authority
  -> approval when required
  -> execution job
  -> capability router
  -> provider runtime
  -> credential broker / artifact broker / transport
  -> provider
  -> callback/readback/reconciliation
  -> verified evidence
  -> governed return event
  -> VYNDI canonical linkage
```

Providers are executors, never sources of authority or canonical enterprise truth.

## Mandatory common fabric before release candidate

### F1 — Provider Manifest v2

Must model:
- provider identity and adapter version;
- capability classes;
- enabled/disabled/kill-switch state;
- deployment mode;
- supported data classifications;
- supported execution risk classes;
- data egress;
- authentication and secret-binding;
- idempotency;
- retry/unknown-outcome semantics;
- callback verification;
- verification/evidence contract;
- health/readiness;
- licensing/redistribution;
- data retention/residency;
- cost-control metadata;
- rollback/disable method;
- qualification state and evidence.

### F2 — Capability Router / Provider Runtime

Must enforce:
- enabled state;
- per-capability qualification;
- data classification;
- execution risk class;
- deployment policy;
- licensing policy;
- health/readiness;
- deterministic provider selection;
- provider allow/deny policy;
- fail-closed routing.

### F3 — Provider Qualification Service

Govern:
`CANDIDATE -> EVALUATION -> QUALIFIED -> RESTRICTED -> QUALIFIED/REJECTED`

Must record:
- capability being qualified;
- evidence refs;
- actor/authority reference;
- qualification/restriction/rejection reason;
- validity/requalification metadata;
- complete transition audit.

### F4 — Provider Control / Kill Switch

Must support:
- disable one provider;
- disable one capability on a provider;
- restrict provider by risk/data class;
- emergency stop without deleting evidence/history;
- deterministic recovery.

### F5 — Health / Readiness

Must support:
- provider health probe result;
- freshness timestamp;
- degraded/unhealthy states;
- fail-closed routing when policy requires health;
- health evidence without secrets.

### F6 — Reconciliation + DLQ

Unknown outcomes must enter governed reconciliation:
```text
UNKNOWN
 -> reconcile by provider readback/callback/target readback
 -> SUCCEEDED | FAILED | MANUAL_REVIEW
```

Must preserve providerRunId, intentId, jobId, attempt history and evidence.

### F7 — Governed HTTP Transport

Common provider HTTP boundary:
- HTTPS policy;
- target host allow-list;
- redirect policy;
- timeout/AbortController;
- request/response size limits;
- content-type validation;
- correlation headers;
- SSRF controls;
- safe error classification;
- no secret logging.

### F8 — Callback Gateway / Receipt Store

Required for Zapier and future callbacks:
- one-time callback token;
- token hashing;
- expiry;
- exactly-once consumption;
- replay rejection;
- payload/schema validation;
- provider/job/intent/action correlation;
- audit + evidence.

### F9 — Artifact / Evidence Broker

Cloudflare-first target:
- Cloudflare R2 adapter/port;
- immutable artifact reference;
- SHA-256 hash;
- content type + size;
- source/output lineage;
- signed document / PDF / screenshot / trace support;
- no large binary payloads embedded in execution records.

### F10 — Credential Broker + Infisical

Keep broker vault-neutral and add an Infisical evaluation adapter:
- scoped secret resolution;
- expiry;
- rotation/renewal boundary;
- revoke/lease semantics where provider supports them;
- no permanent secret exposure to agents.

### F11 — Telemetry / Observability

Required:
- vendor-neutral execution telemetry;
- lifecycle recorder;
- OpenTelemetry span mapping;
- OTLP exporter/sink interface;
- Grafana operations boundary;
- Langfuse AI-observability boundary;
- no production backend required for merge.

### F12 — VYNDI ↔ VAOS Governed Contract

Required:
- versioned outbound intent contract;
- governed result/evidence return contract;
- canonical truth remains in VYNDI/domain system;
- correlation IDs;
- idempotency;
- schema validation;
- rejection/quarantine;
- replay semantics.

### F13 — Event Standards

Required:
- CloudEvents-style envelope;
- AsyncAPI contract/documentation for external events;
- provider callback events;
- VYNDI->VAOS intents;
- VAOS->VYNDI result events;
- reconciliation events;
- edge/device events.

### F14 — Execution Error Sanitization

Persist only safe machine-readable failure data:
- error code;
- retryable;
- outcomeUnknown;
- providerRunId;
- safe classification metadata.

Raw provider messages, URLs, tokens, cookies or request bodies must never be persisted by default.

## Provider adapters required before release candidate

### P1 — n8n — `workflow.orchestrate`
Already implemented; complete common-runtime wiring, health, kill-switch and reconciliation.

### P2 — Activepieces — `workflow.orchestrate`
Required provider-replacement/licensing hedge. Baseline governed adapter + evaluation manifest.

### P3 — Zapier — `integration.saas`
Already implemented; complete real callback-gateway integration.

### P4 — Paperwork — document worker
Required capabilities:
- `document.extract`;
- classify/intelligence boundary;
- fill/redact/redline boundaries when provider qualification supports them.

Stirling remains preferred deterministic PDF transformer; Documenso remains formal signature provider.

### P5 — Paperless-ngx — `document.archive`
Archive/OCR/index/search evidence boundary.

### P6 — Stirling PDF — `document.transform`
Allow-listed deterministic transformations only.

### P7 — Documenso — `document.sign`
Governed signature request/completion evidence; no duplicate sends.

### P8 — Playwright — `browser.automate`
Already implemented; wire through common transport/artifact/runtime controls.

### P9 — Power Automate Desktop — `desktop.automate`
Windows/legacy/Excel/no-API RPA boundary. Physical/local execution remains evaluation-only.

### P10 — Windmill — `code.execute`
Already implemented; common-runtime wiring + artifact handoff for large results.

### P11 — Airbyte — `data.replicate`
Already implemented; common-runtime wiring + connection/data classification.

### P12 — Temporal — `workflow.durable`
Approved workflow types only; stable workflow identity; no duplicate start.

### P13 — Camunda — `process.orchestrate`
Approved process definition/version; human tasks cannot bypass VAOS authority.

### P14 — Node-RED — `event.edge`
Approved flows/devices; physical effects require high-assurance policy.

### P15 — Infisical — `secret.broker`
Concrete evaluation adapter behind vault-neutral broker.

## Provider/catalog preservation required in this squash

The following must remain represented in a machine-readable provider catalog and qualification backlog even if a full runtime adapter is intentionally later:

- Google Apps Script — Workspace automation;
- NocoDB — operational tables/forms/views;
- Grafana — operations dashboards;
- Langfuse — AI/agent tracing/evaluation;
- Metabase — BI;
- Apromore — process mining;
- Qdrant — semantic search;
- Meilisearch / Typesense — full-text search;
- Formbricks — forms/feedback;
- Cal.com — scheduling;
- Zammad — service desk;
- GLPI — ITSM/assets;
- OpenProject — project execution;
- Pipedream — long-tail API connectivity;
- Great Expectations — data quality;
- Appsmith / Budibase / Retool — internal tools;
- Kong Gateway — API gateway;
- Bardeen / Gumloop — optional automation candidates.

Provider appearance in the catalog is not production approval.

## Enterprise platform backlog preservation

The following previously-discussed platform capabilities must be captured in the definitive VAOS enterprise backlog so they are not lost:

- Authentik / Keycloak;
- OPA / Cedar / Casbin;
- NATS / Redpanda / RabbitMQ / Kafka;
- Cloudflare R2;
- CloudEvents / AsyncAPI;
- Novu / ntfy;
- Wiki.js / BookStack / Outline;
- Restic / Kopia;
- Sigstore / Cosign / Syft / Grype;
- OpenLineage / Marquez / OpenMetadata;
- Unleash;
- k6;
- incident/status management;
- Ollama / vLLM / LiteLLM.

## Self-improvement loop

Preserve and document:
```text
VAOS/VYNDI activity
 -> telemetry/event/evidence data
 -> process mining (Apromore boundary)
 -> bottleneck discovery
 -> VIBPE recommendation
 -> governed VAOS automation
 -> measured outcome
 -> repeat
```

## Provider state at merge

Every external provider:
```text
state = evaluation
qualifiedCapabilities = []
production credentials = absent
production routing = disabled
```

Unit tests may construct qualified in-memory manifests to prove behavior; committed real manifests stay evaluation-only.

## Final release sequence

### Gate A — Complete F1–F14 and P1–P15
Use RED -> GREEN -> REFACTOR.

### Gate B — Machine-readable catalog completeness
Every discussed provider/tool family must be represented or explicitly mapped to the enterprise backlog.

### Gate C — Freeze branch scope
No new unrelated features after definitive checklist completion.

### Gate D — Reconcile once with latest main
Resolve conflicts against current architecture; do not repeatedly rebase during parallel work.

### Gate E — Cloudflare-only audit
- no Vercel runtime/config/workflow/documentation dependency;
- repository homepage must no longer point to Vercel;
- Cloudflare remains deployment target.

### Gate F — Full qualification
Run authoritative `npm test`, all fabric tests, Cloudflare smoke checks and reconciliation/security tests on reconciled head.

### Gate G — Security/governance audit
Verify authority, secret, retry, callback, evidence, artifact, data-classification, risk, health, qualification and canonical-truth rules.

### Gate H — Definitive release matrix
Every F1–F14 and P1–P15 row must be PASS/evaluation as appropriate. Catalog/backlog preservation must be PASS.

### Gate I — One squash merge
- PR #30 Ready only after all previous gates pass;
- merge method: squash;
- expected-head SHA protection;
- title: `feat: add governed VAOS Automation & Integration Fabric`;
- verify exactly one feature commit on `main`.

## User intervention boundary

Autonomous work does **not** require user intervention for:
- repository code;
- tests;
- schemas/contracts;
- provider manifests/catalog;
- documentation;
- architecture;
- adapters with injected/mock transports;
- security hardening;
- branch/PR preparation;
- reconciliation and merge when GitHub permissions/checks allow it.

User intervention is required only for:
- supplying or authorizing real third-party credentials;
- external-provider account setup/consent;
- manual account/repository settings unavailable through connected APIs;
- production activation decisions;
- external commercial/license purchase decisions;
- physical-device access not exposed to the connected tooling.

## Definition of done

PR #30 is complete only when:
- no accepted capability/tool/provider family has silently disappeared;
- F1–F14 are implemented and qualified;
- P1–P15 are implemented to evaluation-grade boundaries;
- catalog and enterprise backlog are complete;
- full reconciliation/qualification/audit is green;
- Vercel cleanup is complete;
- one squash commit lands on `main`;
- no provider is accidentally production-enabled.
