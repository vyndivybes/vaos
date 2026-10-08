# VAOS Automation & Integration Fabric

This directory is the preparation boundary for external automation, office, document, browser, data and specialist execution providers.

## Purpose

VAOS should expose **capabilities**, not vendor-specific workflow concepts.

Examples:

- `workflow.orchestrate`
- `integration.saas`
- `document.extract`
- `document.archive`
- `document.sign`
- `browser.automate`
- `desktop.automate`
- `code.execute`
- `data.replicate`
- `workflow.durable`
- `process.orchestrate`
- `event.edge`
- `secret.broker`
- `telemetry.observe`

A governed VAOS execution job is routed to a qualified provider only after policy and authority checks.

## Initial provider map

| Capability | Primary candidate | Secondary / later candidate |
| --- | --- | --- |
| workflow.orchestrate | n8n | Activepieces |
| integration.saas | Zapier | Pipedream |
| document.extract | Paperwork | provider-specific fallback |
| document.archive | Paperless-ngx | object-store integration |
| document.transform | Stirling PDF | Paperwork |
| document.sign | Documenso | external e-sign provider |
| browser.automate | Playwright | Bardeen-style provider |
| desktop.automate | Power Automate Desktop | future RPA provider |
| code.execute | Windmill | VAOS sandbox compute |
| data.replicate | Airbyte | provider-native connector |
| workflow.durable | Temporal | VAOS durable workflow runtime |
| process.orchestrate | Camunda | VAOS workflow runtime |
| event.edge | Node-RED | direct device adapter |
| secret.broker | Infisical | future enterprise vault |
| telemetry.observe | OpenTelemetry | provider-native telemetry |
| ai.observe | Langfuse | OpenTelemetry-derived traces |
| analytics.bi | Metabase | domain dashboards |
| process.mine | Apromore | future process intelligence |
| search.semantic | Qdrant | future vector provider |
| search.fulltext | Meilisearch / Typesense | database-native search |
| forms.collect | Formbricks | VAOS native forms |
| scheduling.coordinate | Cal.com | calendar-native provider |
| service.manage | Zammad / GLPI | future ITSM connector |
| project.manage | OpenProject | external PM connector |

## Provider lifecycle

```text
CANDIDATE
  -> EVALUATION
  -> QUALIFIED
  -> RESTRICTED (when degraded or policy-limited)
  -> QUALIFIED (after remediation)
  -> REJECTED (when unsuitable)
```

Qualification is per capability. A provider qualified for one capability is not automatically qualified for every feature it exposes.

## Required qualification evidence

Before a provider may execute production effects, record evidence for:

1. authentication and secret handling;
2. network/data egress;
3. input/output schema validation;
4. idempotency and duplicate delivery behavior;
5. timeout/unknown-outcome behavior;
6. retry and dead-letter semantics;
7. callback/webhook authenticity;
8. independent verification/readback;
9. audit/evidence completeness;
10. rate limits and backpressure;
11. outage/degraded-mode behavior;
12. licensing and redistribution constraints;
13. data retention/residency;
14. cost controls;
15. rollback/disable procedure.

## Non-authority rule

Providers are executors. They do not grant authority, approve actions, or write canonical enterprise truth merely because an external action succeeded.

## Secret rule

Provider manifests contain secret-binding references only. Plaintext secrets, API keys, refresh tokens, passwords and private keys must never be committed here.

## Parallel-work rule

Preparation in this branch is additive and must not alter:

- the existing execution adapter registry;
- current action routing;
- digital-employee authority;
- existing Supabase persistence;
- production deployment configuration.

Runtime integration begins only after the preparation ADR and provider contract are reviewed.
