# Provider Qualification Wave 1

## Purpose

Wave 1 validates low-risk/self-hosted provider boundaries without production credentials or business data.

Providers:
- Playwright — `browser.automate`
- Node-RED — `event.edge` (qualification flow is observation-only; no physical side effects)
- OpenTelemetry Collector — `telemetry.observe`

This wave **does not activate production routing**.

## Qualification model

Each provider progresses through four evidence stages:

1. **contract** — manifest/interface/unit-security evidence;
2. **ephemeral-live** — real provider runtime in isolated CI;
3. **staging** — deployment-specific auth, egress, callbacks, kill-switch, and artifact policy;
4. **production** — rollback/canary/owner approval and any provider-specific operating limits.

A provider is not eligible for `QUALIFIED` until every required check across all four stages is satisfied.

Qualification and activation remain separate:
- `qualified` means the capability passed its evidence profile;
- `enabled` means an authorized operator has additionally activated routing while health is fresh.

## Ephemeral-live environment

The trigger-gated workflow `.github/workflows/provider-wave1-live-qualification.yml` runs one Ubuntu job and exercises:

### Playwright

Pinned qualification runtime: `@playwright/test 1.64.0`.

Live checks:
- Chromium launches and reports a version;
- read-only navigation to a local approved target succeeds;
- intentional HTTP failure is observed correctly.

No user session or production credential is used.

### Node-RED

Pinned qualification runtime: `node-red 4.1.7`.

Live checks:
- runtime starts on localhost;
- a preinstalled observation-only flow processes an approved synthetic event;
- an unknown route returns 404.

No flow deployment API, external device, or physical-effect node is used.

### OpenTelemetry Collector

Pinned qualification runtime: `otel/opentelemetry-collector 0.162.0`.

Live checks:
- Collector health endpoint becomes ready;
- OTLP/HTTP accepts a valid trace payload;
- malformed OTLP JSON is rejected.

No production observability backend is configured.

## Evidence

On a successful live workflow run, three immutable JSON evidence bundles are uploaded as the GitHub Actions artifact:

`provider-wave1-live-evidence`

Each bundle includes:
- provider ID;
- capability;
- runtime version;
- GitHub run ID and URL;
- exact commit SHA;
- live check results;
- evidence refs.

The bundle contract explicitly sets:

```text
productionActivation = false
```

and the ingestion boundary rejects any CI bundle claiming otherwise.

## Current release rules

Before merge of this qualification framework:
- full repository tests must pass;
- live workflow must pass on the PR head;
- provider manifests remain `enabled=false`, `evaluation`, zero qualified capabilities;
- no production secret is added;
- no production routing is enabled.

After merge, staging qualification can continue provider-by-provider without changing the common qualification semantics.
