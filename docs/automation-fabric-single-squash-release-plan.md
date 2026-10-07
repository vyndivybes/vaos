# VAOS Automation & Integration Fabric — Single-Squash Release Plan

**PR:** #30  
**Branch:** `prep/automation-integration-fabric`  
**Target:** `main`  
**Landing strategy:** one squash merge  
**Intended squash title:** `feat: add governed VAOS Automation & Integration Fabric`

## Release objective

Complete the Automation & Integration Fabric as one coherent, additive VAOS capability layer, qualify the complete branch against the latest `main`, and land the entire body of work as **one commit on `main`**.

Development commits may remain granular for diagnosis and rollback while the PR is draft. They are not intended to appear individually in `main`.

## Scope already prepared

- AF-0 architecture + ADR + provider manifest contract
- AF-1 capability registry
- AF-2 credential broker boundary
- AF-3 n8n workflow adapter
- AF-4 Paperwork extraction adapter
- AF-5 Zapier SaaS action adapter
- AF-6 Playwright browser automation adapter
- AF-7 Windmill governed code execution adapter
- AF-9 Airbyte governed replication
- vendor-neutral execution telemetry
- telemetry lifecycle recorder
- OpenTelemetry span mapping

All provider manifests remain **evaluation-only** until separately live-qualified.

## Remaining implementation scope before release candidate

### R1 — Paperless-ngx

Capability: `document.archive`

Required boundary:
- archive by governed intake key;
- source artifact hash/reference retained;
- immutable provider document ID captured as evidence;
- no provider document becomes canonical business truth;
- duplicate intake behavior qualified;
- provider search/index state verified independently where practical.

### R2 — Stirling PDF

Capability: `document.transform`

Required boundary:
- allow-listed deterministic transformation operations only;
- no arbitrary command/file-system execution;
- source + output artifact hashes;
- output size/type constraints;
- transformation evidence;
- no uncontrolled remote fetches.

### R3 — Documenso

Capability: `document.sign`

Required boundary:
- governed template/document key;
- signer identities supplied from authorized VAOS context;
- provider document/envelope ID retained;
- signed artifact hash + completion evidence;
- send/sign side effects treated as unknown on ambiguous post-send failure;
- no automatic duplicate signature request.

### R4 — Temporal

Capability: `workflow.durable`

Required boundary:
- only approved workflow type keys;
- VAOS remains authority plane;
- Temporal owns durable execution state, not business truth;
- workflow ID stable across retries;
- signal/query/termination semantics qualified;
- no duplicate workflow start.

### R5 — Camunda

Capability: `process.orchestrate`

Required boundary:
- approved process definition key/version;
- human-task approvals cannot bypass VAOS authority;
- process instance ID captured;
- BPMN process state treated as execution state, not canonical enterprise truth;
- incident/failure reconciliation.

### R6 — Node-RED

Capability: `event.edge`

Required boundary:
- approved flow/device key;
- ingress/egress allow-list;
- no unrestricted arbitrary node deployment from agents;
- device/event identity validation;
- physical side effects require explicit high-assurance policy;
- edge outage/buffering/replay semantics qualified.

## Explicitly deferred from this squash

The following are **not blockers** for this release unless already required by tests or architecture:

- production activation of any provider;
- real provider credentials;
- production endpoint configuration;
- Grafana backend;
- Langfuse backend;
- OTLP collector deployment;
- Infisical concrete adapter;
- Qdrant / Meilisearch / Metabase / Apromore;
- Activepieces fallback adapter;
- production factory/physical actuator enablement.

These can be activated or added in later governed PRs after this common fabric exists.

## Provider state at merge

Every external provider must satisfy:

```text
manifest.state = evaluation
qualifiedCapabilities = []
production credentials = absent
production routing = disabled
```

The merge introduces **capability and adapter code**, not production authority.

## Final integration sequence

### Gate A — Complete remaining adapters

Implement R1–R6 using RED → GREEN → REFACTOR.

For each adapter:
1. tests committed first;
2. focused tests pass;
3. adapter linted;
4. evaluation manifest added;
5. failure/unknown-outcome semantics proven;
6. no secrets in returned evidence;
7. no production activation.

### Gate B — Freeze branch scope

After R1–R6:
- no new provider categories;
- no unrelated feature work;
- documentation/checklist updates only unless qualification exposes defects.

### Gate C — Reconcile once with latest main

Do this **once**, after implementation is complete.

Required:
- fetch latest `main`;
- reconcile/rebase/merge according to safest conflict path;
- resolve conflicts in favor of current mainline architecture where appropriate;
- re-run all targeted adapter tests after reconciliation.

Do not repeatedly rebase during parallel development.

### Gate D — Cloudflare-only cleanup

Mandatory before merge:
- no Vercel runtime/deployment references;
- no Vercel workflow/config dependency;
- no Vercel documentation references;
- repository homepage metadata must no longer point to Vercel;
- Cloudflare remains the deployment target.

If repository metadata cannot be changed through the available automation API, record that as the only manual pre-merge setting change and do not mark the gate complete until verified.

### Gate E — Full qualification

Run the repository's authoritative qualification path from the reconciled head:

```text
npm test
```

This must include:
- platform tests;
- web tests;
- verify:web;
- lint;
- all integration-fabric tests.

Then run any Cloudflare smoke/production-safe checks required by current `main`.

Required outcome:
- no skipped tests added to bypass failures;
- no obsolete check silently removed;
- no latest-main regression;
- no provider test relying on real credentials.

### Gate F — Security / governance audit

Verify:

- agents cannot call providers directly;
- capability registry is fail-closed;
- unqualified providers are not selectable;
- credentials only pass through broker callbacks;
- no secret value in logs/evidence/manifests;
- state-changing ambiguous outcomes never blindly retry unless provider idempotency makes replay safe;
- provider responses are treated as untrusted;
- evidence IDs/hashes/correlation IDs are preserved;
- provider state is non-authoritative;
- VYNDI remains canonical where applicable;
- Cloudflare-only deployment rule satisfied.

### Gate G — Release-candidate audit

Produce one final status matrix:

| Area | Required state |
| --- | --- |
| Architecture | PASS |
| Capability registry | PASS |
| Credential boundary | PASS |
| n8n | PASS / evaluation |
| Paperwork | PASS / evaluation |
| Zapier | PASS / evaluation |
| Playwright | PASS / evaluation |
| Windmill | PASS / evaluation |
| Airbyte | PASS / evaluation |
| Paperless-ngx | PASS / evaluation |
| Stirling PDF | PASS / evaluation |
| Documenso | PASS / evaluation |
| Temporal | PASS / evaluation |
| Camunda | PASS / evaluation |
| Node-RED | PASS / evaluation |
| Telemetry contract | PASS |
| OpenTelemetry mapping | PASS |
| Cloudflare-only check | PASS |
| Full repo qualification | PASS |
| Security audit | PASS |
| Production activation | DISABLED by design |

Any non-PASS required row blocks merge.

## Final merge

Only after Gates A–G pass:

1. convert PR #30 from Draft to Ready;
2. confirm latest head is still based on current `main`;
3. confirm required checks are green;
4. squash merge PR #30;
5. use title:
   `feat: add governed VAOS Automation & Integration Fabric`
6. verify `main` contains exactly one new squash commit for this feature body;
7. verify provider manifests remain evaluation-only;
8. verify Cloudflare deployment posture remains unchanged unless explicitly qualified.

## Rollback model

Because `main` receives one squash commit, the entire fabric can be reverted with one revert commit if release-level regression is discovered.

Individual provider activation remains independent and can be disabled without reverting the common fabric.

## Definition of done

This initiative is complete when:

- all remaining adapter scopes R1–R6 are implemented and qualified;
- branch is reconciled once with latest `main`;
- full repo qualification passes;
- security/governance audit passes;
- Cloudflare-only gate passes;
- PR #30 is squash-merged;
- `main` contains one feature commit;
- no external provider is production-enabled merely by the merge.
