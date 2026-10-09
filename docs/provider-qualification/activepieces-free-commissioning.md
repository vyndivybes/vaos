# VAOS no-new-subscription commissioning: Activepieces + Windmill

Status (2026-10-09): PREPARED, NOT COMISSIONED. No Activepieces tenant, webhook URL, API key, health evidence or live independent readback has been verified. No external provider is enabled by this change.

## Operating decision

- Prefer Activepieces **Free Cloud** for `workflow.orchestrate`, subject to qualification and quota.
- Retain the existing Windmill integration for `code.execute`; do not change its execution or independent-verifier tokens.
- No automatic SaaS fallback to Zapier and no automatic workflow fallback to paid n8n hosting.
- Keep the n8n and Zapier adapter files and manifests, but leave both disabled. The `integration.saas` capability deliberately fails closed until a no-additional-subscription provider is specifically qualified.
- Every provider retains VAOS approvals, independent verification, health freshness, secret brokering, reconciliation and immutable evidence. A provider never becomes its own approval authority.

## Route profile

The opt-in `createNoSubscriptionRoutingPolicy()` is in `platform/execution/no-subscription-routing.mjs`. Inject it as `routingPolicy` into `createDurableAutomationFabric` or `createProviderRuntime`. It constrains the provider allow-list BEFORE the control plane's normal state, health and qualification checks. It does not enable any provider or override operator approval.

## Commissioning prerequisites (operator login required)

1. Create or sign in to an **Activepieces Free Cloud** workspace at https://cloud.activepieces.com . Do not select or authorize a paid subscription.
2. Record the tenant's actual workspace URL and inspect whether the Free account includes the **specific run-readback API endpoint and token** required by the existing adapter. Free product-page 'API access' is not proof of programmatic flow-run readback entitlement. If readback is unavailable, do not enable this adapter in production; use a readback-capable free architecture or seek a reviewed alternative.
3. Create an inert test flow, with **Catch Webhook** trigger and a no-side-effects echo/acknowledgment action. The flow must include the VAOS execution job ID and intent ID. Use only synthetic, non-sensitive payloads for qualification.
4. Save the webhook URL as a scoped, confidential binding in Infisical; do NOT paste the hook URL or API credential in ChatGPT, the repository or workflow logs. Suggested logical references: `secret:activepieces:hook` and `secret:activepieces:api`. These are references, not the actual secret values.
5. Provision the guarded callback route and register an approved `flowKey -> flowId, projectId, hookBindingRef, apiBindingRef` mapping. Restrict outbound hosts, redirects, request size, data classification and expiry through VAOS governed HTTP transport. Use **HTTPS**.
6. Run synthetic contract tests, then independent live dispatch and callback receipt, provider-run readback, duplicate delivery, post-send timeout/unknown-outcome, quota exhaustion, replay, kill switch, restart reconciliation, and audit-signoff. Keep production routing **disabled** pending evidence and explicit approval.
7. Confirm the 100-credits/day Free plan limit and the exact reset behavior in the tenant. Configure an independent credit-spend admission cap and alert *before* 100/day to protect mission reliability. Do not use the Free plan for safety-critical missions or workloads that require guaranteed dispatch; when exhausted, jobs may not run until credits renew. Verify AI-step surcharges or avoid all AI pieces.

## Activation gates

`ACTIVEPIECES_WORKSPACE_VERIFIED` -> `SECRET_BINDINGS_READY` -> `FREE_API_READBACK_CONFIRMED` -> `SYNTHETIC_LIVE_PASS` -> `INDEPENDENT_VERIFICATION_PASS` -> `HEALTH_FRESH` -> `COST_CAP_ENFORCED` -> `OPERATOR_APPROVAL` -> `CONTROLLED_ACTIVATION`.

No gate may be silently skipped. A green test run is **contract qualification**, not authorization to send production data.

## Free-tier caveat

Activepieces' published Free plan offers 100 credits/day and unlimited flows. Its separate API documentation has previously described management API keys as restricted to platform-admin editions; therefore confirm exact tenant entitlement rather than infer access from marketing. The existing VAOS adapter requires authenticated flow-run readback to mark a run verified. Do not weaken independent verification to accommodate plan limits.

## Rollback

Disable the Activepieces provider and its capability in the VAOS provider control plane; revoke the scoped Infisical binding; stop the Activepieces flow; reconcile all unknown outcomes before retries; retain audit and event evidence. The n8n/Zapier optional adapters remain available for a separately approved future policy, not as unreviewed cost-bearing fallbacks.
