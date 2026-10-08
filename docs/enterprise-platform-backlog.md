# VAOS Enterprise Platform Backlog — Preserved Architecture

This backlog preserves enterprise capabilities discussed alongside the Automation & Integration Fabric. Items here are not silently discarded when they are outside PR #30 runtime implementation.

## Identity and policy

- Authentik / Keycloak — workforce/service identity and federation.
- OPA / Cedar / Casbin — externalized policy evaluation where VAOS policy requires richer ABAC/relationship rules.

## Event and messaging backbone

- NATS / Redpanda / RabbitMQ / Kafka — durable event transport candidates.
- CloudEvents — canonical external event envelope.
- AsyncAPI — event-channel contract/documentation.

## Evidence, storage and continuity

- Cloudflare R2 — artifact/evidence object store and backup target.
- Restic / Kopia — encrypted backup and restore workflows.
- Restore validation must be evidence-producing, not merely scheduled.

## Notifications and knowledge

- Novu / ntfy — governed notification delivery.
- Wiki.js / BookStack / Outline — knowledge publishing/documentation candidates.

## Software supply chain

- Sigstore / Cosign — signing/attestation.
- Syft — SBOM generation.
- Grype — vulnerability scanning.
- Release evidence should bind artifact -> SBOM -> scan -> signature.

## Data lineage and metadata

- OpenLineage / Marquez / OpenMetadata — lineage/catalog candidates.
- Great Expectations — data quality controls.
- Airbyte replication evidence should be linkable into lineage.

## Feature / release controls

- Unleash — feature flags / controlled rollout.
- k6 — synthetic/load/performance qualification.
- Incident/status management — provider/runtime incident communication and recovery governance.

## Local/private AI

- Ollama / vLLM / LiteLLM — local/private model execution/routing candidates.
- Any future model router remains subordinate to VAOS authority, audit and data-classification policy.

## Internal application tooling

- Appsmith / Budibase / Retool — internal operations UIs.
- NocoDB — governed operational tables/forms/views.
- Google Apps Script — Workspace-native automation.

## Process intelligence self-improvement loop

```text
VAOS/VYNDI activity
  -> CloudEvents + execution telemetry + evidence
  -> process mining / Apromore boundary
  -> bottleneck/conformance discovery
  -> VIBPE recommendation
  -> governed approval
  -> VAOS automation/change
  -> measured result
  -> repeat
```

The analysis/recommendation layer never gains execution authority merely by discovering a process improvement.

## Preservation rule

A tool may be:
- implemented now;
- represented by an adapter boundary;
- represented in the provider catalog;
- or retained here as enterprise backlog.

It may not silently disappear from architecture without an explicit governance decision.
