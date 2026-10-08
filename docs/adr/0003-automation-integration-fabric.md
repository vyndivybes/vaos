# ADR 0003: VAOS Automation & Integration Fabric

- **Status:** Proposed
- **Date:** 2026-10-08
- **Scope:** VAOS execution/integration boundary
- **Decision owner:** VAOS governance

## Context

VAOS already defines governed execution through policy, authority, execution adapters, verification, evidence and audit. The next stage introduces external automation and office-execution providers such as n8n, Zapier, Paperwork, Windmill, Playwright and related specialist services.

Directly wiring these providers into agents or domain applications would create vendor coupling, duplicate authorization paths, credential sprawl and uncontrolled side effects.

## Decision

VAOS will introduce an **Automation & Integration Fabric** as a governed provider abstraction behind the existing execution path.

The canonical path remains:

```text
Human / Event / Mission
  -> Intent
  -> Policy + RBAC/ABAC + capability authority
  -> Approval when required
  -> Execution job
  -> VAOS capability router
  -> Provider adapter
  -> External provider/tool
  -> Independent verification
  -> Evidence + audit + digital thread
```

Providers are subordinate execution mechanisms. They do not become sources of enterprise authority.

## Boundary rules

1. Agents may request capabilities; they may not call external providers directly.
2. Provider credentials are never embedded in prompts, agent state, source manifests or business records.
3. Every state-changing provider call must be associated with a governed VAOS execution job.
4. External responses are untrusted until validated at the provider boundary.
5. State-changing execution must use stable idempotency semantics.
6. Provider timeouts are treated as an unknown outcome until reconciliation proves success or failure.
7. Verification evidence must be produced before VAOS records a successful effect.
8. Provider-specific identifiers are stored as execution evidence, not canonical business identity.
9. A provider may be replaced without changing the business intent contract.
10. VYNDI/domain systems remain systems of record where they are authoritative; VAOS remains the governed execution/control plane.

## Capability classes

The initial registry will classify providers by capability rather than by vendor:

- workflow.orchestrate
- integration.saas
- document.extract
- document.archive
- document.transform
- document.sign
- browser.automate
- desktop.automate
- code.execute
- data.replicate
- process.orchestrate
- workflow.durable
- event.edge
- secret.broker
- telemetry.observe
- ai.observe
- search.semantic
- search.fulltext
- analytics.bi
- process.mine
- forms.collect
- scheduling.coordinate
- service.manage
- project.manage

## Initial provider candidates

### Phase A — foundation

- n8n — general workflow orchestration
- Zapier — long-tail SaaS connectivity
- Paperwork — document intelligence
- Windmill — governed script/code execution
- Playwright — browser automation
- Infisical — machine/agent secret brokering
- OpenTelemetry — execution telemetry

### Phase B — specialist execution

- Paperless-ngx — document archive/OCR/DMS
- Documenso — e-signature
- Stirling PDF — deterministic PDF processing
- Airbyte — governed data replication
- Power Automate Desktop — Windows/legacy RPA
- Temporal — durable long-running execution
- Node-RED — edge/IoT integration
- Grafana — operational observability
- Langfuse — AI/agent tracing and evaluation
- Metabase — BI/self-service analytics

### Phase C — advanced enterprise capability

- Activepieces — alternative open automation provider
- Camunda — BPMN/process orchestration
- Apromore — process mining
- Qdrant — semantic retrieval
- Meilisearch/Typesense — full-text application search
- Formbricks — forms/surveys/feedback
- Cal.com — scheduling infrastructure
- Zammad — service/help desk
- GLPI — ITSM/asset management
- OpenProject — project execution
- Pipedream — broad API/MCP connectivity
- Great Expectations — data quality controls

Candidates are not approved dependencies merely by appearing here. Each provider requires security, licensing, data-residency, failure-mode and cost qualification before activation.

## Provider contract

A provider manifest must declare:

- provider identity and version
- capability classes
- deployment mode
- data egress classification
- secret-binding method
- supported authentication modes
- idempotency support
- callback/webhook verification method
- retry semantics
- verification strategy
- evidence returned
- health/readiness probe
- licensing/redistribution constraints
- qualification state

Provider implementations must expose a stable VAOS-facing contract. Business actions must not depend on provider-native workflow IDs, task IDs or UI concepts.

## Routing policy

The capability router selects only from providers that are:

1. enabled,
2. qualified for the requested capability,
3. permitted for the data classification,
4. compatible with the required execution risk class,
5. healthy enough for dispatch,
6. allowed by licensing/deployment policy.

Provider selection is deterministic where governance requires it. Cost/performance optimization may be introduced later only within an approved policy envelope.

## Secrets

VAOS will use secret-binding references rather than storing plaintext provider credentials in manifests or business records.

Target pattern:

```text
Execution Job
  -> authorized provider capability
  -> credential broker
  -> short-lived/scoped credential or provider session
  -> execution
```

Agents should see capabilities and authorization context, not permanent secrets.

## VYNDI interoperability

VYNDI communicates with VAOS through governed contracts/events. VYNDI does not need direct n8n, Zapier or Paperwork dependencies.

VYNDI remains responsible for domain authority and canonical business truth. VAOS is responsible for governed external execution and returning verified evidence/results.

## Non-goals for this preparation branch

This branch does **not**:

- deploy any third-party service,
- add provider credentials,
- change production routing,
- grant new execution authority,
- alter existing execution adapters,
- modify canonical domain state,
- enable autonomous external side effects.

It only establishes the architectural boundary, provider contract and staged backlog so implementation can proceed independently of other active VAOS work.

## Consequences

### Positive

- provider lock-in is reduced;
- external tools remain replaceable;
- governance remains centralized;
- credentials can be brokered consistently;
- qualification can be performed per provider/capability;
- provider failures do not redefine business truth;
- new integrations can be added without changing agent contracts.

### Trade-offs

- an additional routing/adapter layer must be maintained;
- provider qualification becomes a formal release activity;
- some provider-native features may intentionally remain inaccessible if they bypass VAOS governance.

## Follow-up implementation sequence

1. capability/provider manifest schema;
2. capability registry;
3. provider qualification state machine;
4. secret-binding interface;
5. n8n adapter;
6. Paperwork adapter;
7. Zapier adapter;
8. Playwright execution adapter;
9. observability hooks;
10. provider health/reconciliation;
11. VYNDI ↔ VAOS governed integration contract;
12. production qualification and staged activation.
