# Automation & Integration Fabric Roadmap

**Branch:** `prep/automation-integration-fabric`  
**Mode:** parallel preparation only  
**Production effects:** disabled

## Objective

Prepare VAOS to use external automation and office-execution providers without coupling agents, business intents or VYNDI domain authority to any provider.

## Work packages

### AF-0 — Architecture freeze

- ADR for provider abstraction and governance boundary.
- Provider manifest schema.
- Capability taxonomy.
- Non-authority and secret-handling rules.
- Definition of provider qualification evidence.

**Exit:** architecture review accepted.

### AF-1 — Capability Registry

Build an additive registry separate from the existing action-type execution adapter registry.

Registry responsibilities:

- list available provider capabilities;
- track provider qualification state;
- resolve capability -> eligible providers;
- reject unqualified/disabled providers;
- enforce data-classification and risk-class constraints;
- expose health/readiness metadata;
- preserve deterministic routing when policy requires it.

Do not route production jobs in AF-1.

**Required tests:** registration, duplicate rejection, capability filtering, qualification filtering, fail-closed routing, immutable provider identity.

### AF-2 — Credential Broker Boundary

Define a secret-binding port so execution adapters request a scoped credential/session by reference.

Rules:

- no plaintext secret in agent context;
- no secret in execution evidence;
- no secret in logs;
- expiry/scoping supported;
- audit records identify the binding reference and capability, never the secret.

Initial candidate: Infisical. Keep the interface vault-neutral.

### AF-3 — n8n Provider Adapter — IMPLEMENTED / EVALUATION

Use n8n as the initial general workflow provider.

Qualification scenarios:

- authenticated dispatch;
- stable idempotency key;
- duplicate dispatch;
- workflow timeout with unknown outcome;
- result readback/reconciliation;
- provider outage;
- callback authenticity;
- rate limiting;
- retry/dead-letter;
- disable/kill switch.

No n8n workflow may become an alternative approval system.

### AF-4 — Paperwork Provider Adapter

Initial document capabilities:

- document.extract;
- document.transform;
- document.sign/redline where approved.

Evidence must bind:

- source artifact reference/hash;
- provider job/run reference;
- output artifact reference/hash;
- extraction/operation result;
- verification status.

### AF-5 — Zapier Provider Adapter

Use Zapier for long-tail SaaS integration where a dedicated connector does not add strategic value.

Keep it optional and replaceable. No business intent contract may mention Zapier-native concepts.

### AF-6 — Browser Automation

Add Playwright behind `browser.automate`.

Controls:

- target allow-list;
- credential broker use;
- download/upload restrictions;
- data classification;
- screenshot/evidence capture where permitted;
- deterministic success verification;
- no bypass of human approval or authorization controls.

### AF-7 — Code / Engineering Execution

Add Windmill or equivalent behind `code.execute`.

Separate:

- deterministic scripts;
- data transformations;
- engineering computation;
- privileged administration.

Privilege escalation requires a different capability and policy.

### AF-8 — Document Operations Stack

Evaluate:

- Paperless-ngx for archive/OCR;
- Stirling PDF for deterministic transformations;
- Documenso for e-signatures.

Document intelligence, storage, transformation and signature remain separate capabilities.

### AF-9 — Data & Observability

Evaluate:

- Airbyte for data replication;
- OpenTelemetry for common traces/metrics;
- Grafana for operations;
- Langfuse for agent/LLM execution assurance.

Every provider execution should eventually correlate:

`missionId -> intentId -> approvalId -> executionJobId -> providerRunId -> verificationEvidenceId`.

### AF-10 — Durable / Formal Process Layer

Evaluate only after core provider routing is stable:

- Temporal for long-running durable execution;
- Camunda for formal BPMN/process orchestration;
- Apromore for process mining.

Do not introduce these merely to duplicate existing VAOS workflow logic.

### AF-11 — Edge / Factory

Evaluate Node-RED and direct device adapters for sensors, test equipment and factory/IoT integration.

Physical effects require a separate high-assurance capability class and explicit safety analysis.

### AF-12 — VYNDI ↔ VAOS Contract

VYNDI should issue governed business intents/events to VAOS, not call providers directly.

Required boundary:

```text
VYNDI canonical decision/approval
  -> governed outbound contract
  -> VAOS intent/execution
  -> provider
  -> VAOS independent verification/evidence
  -> governed return event
  -> VYNDI canonical status/evidence linkage
```

## Recommended implementation order

1. AF-0 Architecture freeze
2. AF-1 Capability Registry
3. AF-2 Credential Broker Boundary
4. AF-3 n8n
5. AF-4 Paperwork
6. AF-5 Zapier
7. AF-6 Playwright
8. AF-9 telemetry foundation
9. AF-7 Windmill
10. AF-8 document stack
11. AF-10 durable/formal process
12. AF-11 edge/factory
13. AF-12 production VYNDI interoperability qualification

## Merge strategy

Keep each runtime provider in its own PR after AF-0/AF-1.

Do **not** make one mega-PR containing all providers.

Suggested sequence:

- PR-AF0: architecture + provider contract
- PR-AF1: capability registry only
- PR-AF2: credential-broker interface
- PR-AF3: n8n adapter
- PR-AF4: Paperwork adapter
- PR-AF5: Zapier adapter
- PR-AF6: Playwright adapter
- later PRs per specialist capability

This gives each provider an independent qualification and rollback boundary.

## Current preparation status

- [x] isolated preparation branch
- [x] architecture ADR
- [x] provider manifest schema
- [x] capability/provider candidate map
- [x] staged implementation roadmap
- [x] capability registry tests
- [x] capability registry implementation
- [x] credential broker interface
- [ ] provider adapters (n8n implemented; Paperwork/Zapier and specialist adapters pending)
- [ ] deployment
- [ ] production activation

The unchecked items intentionally remain deferred until this preparation layer is reviewed against the concurrently evolving VAOS mainline.
