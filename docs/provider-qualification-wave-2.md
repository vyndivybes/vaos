# Provider Qualification Wave 2

## Purpose

Wave 2 qualifies workflow, document, code, and data providers behind the governed VAOS Automation & Integration Fabric.

Providers:
- n8n — `workflow.orchestrate`
- Activepieces — `workflow.orchestrate`
- Paperwork — `document.extract`
- Paperless-ngx — `document.archive`
- Stirling PDF — `document.transform`
- Windmill — `code.execute`
- Airbyte — `data.replicate`

Qualification remains separate from activation. No Wave-2 workflow or evidence bundle may enable production routing.

## Four-stage model

Every provider must satisfy:
1. **contract** — manifest/interface/security/failure semantics;
2. **ephemeral-live** — isolated runtime or sandbox behavior with synthetic data;
3. **staging** — deployment-specific authentication, egress, reconciliation, artifact and kill-switch controls;
4. **production** — reversible canary/rollback plus explicit owner approval.

A provider cannot become `qualified` until all required checks in all four stages pass. A qualified provider cannot become `enabled` until health is fresh and activation is separately authorized.

## Autonomous qualification boundary

The following can be prepared and executed without production credentials:

- all contract checks for every Wave-2 provider;
- self-hosted ephemeral runtime checks for n8n, Activepieces, Paperless-ngx, Stirling PDF, Windmill, and Airbyte when a deterministic local runtime is available;
- synthetic-document/data/script/flow fixtures;
- failure-mode, idempotency, duplicate, and readback drills;
- kill-switch and reconciliation drills;
- immutable GitHub Actions evidence bundles.

Paperwork is treated as a managed-provider sandbox boundary. Its live stages must remain pending until a real approved sandbox/API credential is available.

## No-dilution controls

Wave 2 must not:
- route business intents directly to provider-native concepts;
- place plaintext secrets in CI artifacts, logs, evidence, manifests, or source;
- qualify a provider merely because its process started;
- substitute unit tests for required live evidence;
- treat a live CI pass as production activation;
- downgrade manual owner approval to automated evidence.

## Evidence

Wave-2 evidence must bind:
- provider ID and capability;
- exact commit SHA;
- workflow run ID/URL;
- pinned runtime/version where applicable;
- check ID and outcome;
- artifact digest when a bundle is uploaded;
- `productionActivation=false`.

## Current state

- qualification profiles: implemented on `qualification/provider-wave-2`;
- profile validation: implemented;
- production routing: disabled;
- production credentials: absent;
- contract/live/staging/production evidence: pending execution.
