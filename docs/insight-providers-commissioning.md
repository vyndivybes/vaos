# VAOS insight-provider integration — controlled preparation (3 November 2026)

## Scope and release status

This branch replaces six catalog-only listings with **four read-only protocol adapters** and **two offline evidence-interoperability bridges**. All provider manifests remain `enabled: false`, `candidate`, with zero qualified capabilities. There is **no service deployment, connection credential, production activation, schema migration, canonical VYNDI OS mutation, paid subscription, or new scheduled task**.

| Provider | Function | Prepared boundary | Production |
| --- | --- | --- | --- |
| Metabase | BI | Allowlisted saved-card `POST /api/card/{id}/query` result rows; dedicated-tenant instance, database read-only principal | OFF |
| Qdrant | Semantic retrieval | Allowlisted collection / **exact configured vector dimension** / mandatory tenant filter | OFF |
| Meilisearch | Full text | Allowlisted index / tenant filter / read-only search key | OFF |
| Typesense | Full text | Allowlisted collection / tenant filter / search-only key | OFF |
| Apromore | Process mining | **Offline CSV event log export**, *not* live API integration | OFF |
| Great Expectations | Data quality | **External GX result summary import**, *not* GX execution | OFF |

## Coding contract

`createInsightReadAdapter({providerId, capabilityRegistry, credentialBroker, transport, config})` is an opt-in service port in `integrations/insight-providers/read-only-adapters.mjs`. Supported providers: `metabase`, `qdrant`, `meilisearch`, `typesense`.

- **Admission:** the exact v1-form registry must show `enabled: true`, state `qualified` and the exact qualified capability. Release approval and qualified evidence are separate tasks. The checked-in v2 manifests are intentionally disabled.
- **Transport:** pass `createGovernedHttpTransport({allowedOrigins:[config.baseUrl], ...})`, enforcing HTTPS, non-redirecting requests, request/response limits and timeouts.
- **Secrets:** use `createCredentialBroker()` with per-provider and per-capability scoped encrypted bindings. API keys never enter the frontend, source code or result object.
- **Metabase compatibility:** use authenticated `POST /api/card/{card-id}/query` with an empty `parameters` array. Parse `data.cols` and `data.rows` into allowlisted records; never call free-form SQL. A read-only DB identity and tenant-dedicated saved question must be independently verified against the actual pinned Metabase API version before deployment.
- **Qdrant compatibility:** the embedding model must produce exactly `vectorDimensions` values for each pinned collection; model/vector metadata and tenant payload index must be validated with a real synthetic query.
- **Tenant isolation:** every operation pins a `resourceKey` to configured `tenantId` and `remoteId`. Search filters are added server-side and returned tenant IDs are checked. Metabase cards *must* be dedicated-tenant, read-only saved questions; never allow arbitrary SQL or shared cards.
- **Output:** at most 20 results, configured scalar fields only, declared `sourceAuthority`, `canonicalStateUpdated: false`, and `independentlyVerified: false`. The `verification.verified: true` flag means only that the selected provider response, shape and tenant scope passed validation; it **never** certifies independently verified enterprise truth.
- **Governed runtime:** opt-in `createInsightProviderFactories({configurations,credentialBroker})` returns adapter factories for the existing `createProviderRuntime` selected-provider interface. That runtime first checks the authoritative v2 provider control plane, qualifications, current health and explicit enablement. The factory does not register itself and cannot activate the provider. `createGovernedHttpTransport` is the default transport, pinned to each provider's HTTPS origin. It accepts only the exact read capability. No public API route is added here.
- **No writes:** no create/upsert/index mutations, scans, arbitrary queries, bulk data ingestion or multi-tenant metadata leakage. The read-only provider runtime is separate from the business-effect execution registry.

Minimal call, once a service is independently commissioned:

```js
const adapter = createInsightReadAdapter({
  providerId: 'qdrant',
  capabilityRegistry, credentialBroker,
  transport: createGovernedHttpTransport({ allowedOrigins: ['https://your-approved-host'] }),
  config: {
    baseUrl: 'https://your-approved-host',
    secretBindingRef: 'secret:qdrant:read-only',
    resources: {
      engineering: { tenantId: 'approved-tenant', remoteId: 'approved_collection', vectorDimensions: 2,
        fields: ['tenant_id','title'] }
    }
  }
});
const observation = await adapter.execute({
  id: 'approved-job', intentId: 'approved-intent', tenantId: 'approved-tenant',
  actionType: 'READ.INSIGHT',
  payload: {resourceKey:'engineering', vector:[0.1,0.2] }
});
```

This demonstrates the adapter interface only; the credentials, service origin, canonical data mapping, approval context, dimensional compatibility, schema ownership, tenant-scoped index and source evidence must be commissioned separately.

## Offline boundaries

### Apromore
`exportApromoreEventLog` creates bounded, spreadsheet-safe CSV rows (`case_id,activity,timestamp`) from explicitly sourced process events. Only curated non-PII event IDs and activity names are accepted. The source SHA-256 is a provenance claim supplied by the caller and **must be independently checked** before consuming export. There is no upload call or licensed Enterprise connector. Apromore Core public source is deprecated; Enterprise-only process mining features cannot be assumed free. Do not install a public exposed Apromore server.

### Great Expectations
`ingestGXValidationEvidence` consumes limited summaries from a previously executed GX Core Python validation. It does not run GX, trust a bare `success` boolean as audit evidence, or change canonical data. An external verified, free GX Core runner and immutable file/source hashing are required for production qualification.

## Qualification gates

1. `npm run test:insight-providers` then full `npm test`, exact commit SHA evidence. Test synthetic ProviderRuntime admission and denial independently of business effects.
2. Explicit zero-cost runtime/hosting assessment (not automatically provisioned). Use one full-text engine as primary; the other as optional, to avoid duplicated hosting.
3. Provision each service from a reviewed open-source/free plan and least-privilege identity; ensure encrypted credentials and allowlisted HTTPS origin.
4. Test each provider against synthetic data; negative tests for cross-tenant response, unauthorized resource, failed auth, redirect, 429, large response, data egress, prompt injection and credential leakage.
5. Independent provider readback, source provenance, separate verifier, audit receipt, rollback and kill switch.
6. Obtain explicit owner approval *per capability*, then independently enable the qualified provider. Business data remains governed by VYNDI OS.

## Reference APIs

- Metabase saved questions: https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/metabase-api
- Qdrant points query: https://api.qdrant.tech/api-reference/search/query-points
- Meilisearch search: https://www.meilisearch.com/docs/reference/api/search
- Typesense search: https://typesense.org/docs/latest/api/search.html
- Apromore Core deprecation: https://github.com/apromore/ApromoreCore
- GX Core: https://docs.greatexpectations.io/docs/core/introduction/try_gx/
