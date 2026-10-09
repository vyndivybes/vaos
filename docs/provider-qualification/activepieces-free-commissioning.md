# VAOS no-new-subscription commissioning: Activepieces + Windmill

Status (2026-10-09): ACCOUNT ACCESS CONFIRMED BY USER SCREENSHOT; NOT COMMISSIONED. User-provided screenshot of the **MCP → Connect** screen at `https://cloud.activepieces.com/mcp-server/connect` explicitly labels `https://cloud.activepieces.com/mcp/platform` as the **MCP server connection URL** to copy into a compatible client. This corrects the earlier mistaken classification of that URL as a management page. Screenshot shows signed-in Personal Project, 1,000 credits, 0% used, next reset 2026-11-09. This is observed tenant information, **not evidence of plan/entitlement, billing or active production integration**. The MCP endpoint URL is identified, but no OAuth client connection, webhook flow, run-readback authorization, independent health evidence or live run has been verified. The screen states **No clients yet**. No provider was enabled by this change.

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
2. The user has supplied the provider-generated **MCP Server URL** `https://cloud.activepieces.com/mcp/platform` on the MCP → Connect screen. This is the URL to configure in an OAuth-capable MCP client. The browser settings page itself is `https://cloud.activepieces.com/mcp-server/connect`. Authenticate the MCP client and verify independent run readback using `ap_list_runs` and `ap_get_run`, then separately inspect whether the Free account includes the **REST run-readback API endpoint and token** required by the existing webhook adapter. Published Free-plan 'API access' is not proof of management API key entitlement; the API reference states that platform-management API keys may be restricted to Platform/Enterprise editions. If readback is unavailable, do not enable the webhook adapter in production. Evaluate the built-in OAuth MCP read-only `ap_get_run` tool as a separate independently authenticated readback boundary without weakening verification.
3. Create an inert test flow, with **Catch Webhook** trigger and a no-side-effects echo/acknowledgment action. The flow must include the VAOS execution job ID and intent ID. Use only synthetic, non-sensitive payloads for qualification.
4. Save the webhook URL as a scoped, confidential binding in Infisical; do NOT paste the hook URL or API credential in ChatGPT, the repository or workflow logs. Suggested logical references: `secret:activepieces:hook` and `secret:activepieces:api`. These are references, not the actual secret values.
5. Provision the guarded callback route and register an approved `flowKey -> flowId, projectId, hookBindingRef, apiBindingRef` mapping. Restrict outbound hosts, redirects, request size, data classification and expiry through VAOS governed HTTP transport. Use **HTTPS**.
6. Run synthetic contract tests, then independent live dispatch and callback receipt, provider-run readback, duplicate delivery, post-send timeout/unknown-outcome, quota exhaustion, replay, kill switch, restart reconciliation, and audit-signoff. Keep production routing **disabled** pending evidence and explicit approval.
7. Verify the **actual account quota and reset cadence from tenant Billing/Usage**, not marketing examples. User screenshot dated 2026-10-09 shows **1,000 credits, 0% used, resetting 2026-11-09**; the currently published Free pricing page instead describes **daily** refresh, so do not enforce an assumed `100/day` limit. Configure a conservative independent credit-spend admission cap and alert based on verified account evidence. Do not use the Free plan for safety-critical missions or workloads requiring guaranteed dispatch. Verify AI-step surcharges or avoid AI steps.

## Activation gates

`ACTIVEPIECES_WORKSPACE_VERIFIED` -> `SECRET_BINDINGS_READY` -> `FREE_API_READBACK_CONFIRMED` -> `SYNTHETIC_LIVE_PASS` -> `INDEPENDENT_VERIFICATION_PASS` -> `HEALTH_FRESH` -> `COST_CAP_ENFORCED` -> `OPERATOR_APPROVAL` -> `CONTROLLED_ACTIVATION`.

No gate may be silently skipped. A green test run is **contract qualification**, not authorization to send production data.

## Free-tier caveat

Activepieces' current published Free plan describes **daily credits** and unlimited flows, while the authenticated user screenshot shows a **1,000-credit pool with a November 9 reset**. Treat account Billing/Usage as the authority and explicitly reconcile the mismatch before enforcing quota caps. Its REST API documentation describes platform API keys as restricted to some platform-admin editions; verify actual tenant entitlement. The existing VAOS webhook adapter requires authenticated REST flow-run readback to mark a run verified. The separate Activepieces built-in OAuth MCP server offers read-only run-discovery tools, but it is NOT an automatic drop-in adapter: VAOS still needs a scoped OAuth connection, tool response validation, independently authenticated readback, durable evidence and authorization/security review. Do not weaken independent verification to accommodate plan limits.

## Activepieces MCP link distinction

- **Correction:** `https://cloud.activepieces.com/mcp/platform` is explicitly the **MCP connection URL** shown in the authenticated Activepieces **MCP → Connect** interface. It is NOT the browser management page; the latter is `https://cloud.activepieces.com/mcp-server/connect`. The generated endpoint has not yet passed an OAuth connection/readback test in VAOS.
- The user's current UI explicitly exposes **MCP → Connect → Copy link** and shows `https://cloud.activepieces.com/mcp/platform`. Use the exact link that UI presents; generic documentation examples such as `https://<instance>/mcp` should not override the observed tenant-specific endpoint. No token appears in the displayed URL.
- The remote MCP endpoint uses OAuth in compatible clients. User screen says **No clients yet**; do not treat endpoint discovery as authenticated commissioning. Never commit OAuth tokens, webhook URLs that act as secrets, or raw authorization codes.
- MCP read-only tools include `ap_list_runs` and `ap_get_run`, which may be used in an independent verification design **only after** VAOS connects and proves the correct project, execution job, run ID and immutable audit evidence.
- Official references: https://www.activepieces.com/docs/mcp/overview ; https://www.activepieces.com/docs/mcp/tools ; https://www.activepieces.com/docs/endpoints/overview ; https://www.activepieces.com/pricing .

## Rollback

Disable the Activepieces provider and its capability in the VAOS provider control plane; revoke the scoped Infisical binding; stop the Activepieces flow; reconcile all unknown outcomes before retries; retain audit and event evidence. The n8n/Zapier optional adapters remain available for a separately approved future policy, not as unreviewed cost-bearing fallbacks.

## VAOS OAuth qualification page — staged implementation

The feature branch for PR #111 adds a **one-time, non-persistent OAuth 2.1 PKCE handshake** backed by a dedicated Cloudflare Durable Object, and a read-only MCP tool-discovery probe. The user-facing page is `https://vaos.vayushastr.workers.dev/api/activepieces-mcp` **only after a verified Cloudflare production deployment**.

- Operator signs into VAOS, opens the commissioning page, clicks **Authorize read-only test**, and approves the Activepieces OAuth dialog in the browser.
- OAuth discovery is pinned to `cloud.activepieces.com`, and DCR, token and authorization endpoints must remain on that origin. Redirect URI is pinned to the VAOS Worker callback; S256 PKCE and a 10-minute one-time nonce are mandatory.
- On callback the Worker uses the short-lived token to initialize MCP and list tools. It verifies presence of `ap_get_run` and `ap_list_runs`, then discards the token and stores only a sanitized `MCP_READBACK_CAPABLE` result with a timestamp. **It does not call a real flow, verify execution output, save OAuth tokens, or grant any production permission.**
- Failed OAuth setup must not silently revert to paid n8n or Zapier. Error/denial leaves the provider disabled.
- The `/api/activepieces-mcp/status` endpoint requires an authenticated VAOS session and reports **connected=false** regardless of a passing one-time probe. Durable credential lifecycle, actual run readback, independent evidence, cost admission and governance gates must be implemented/qualified before persistent production routing can be activated.

**Rollout prerequisite:** Verify the new Worker build is deployed and the Durable Object binding `ACTIVEPIECES_HANDSHAKE` is operational; GitHub green CI or a merged PR does not prove Cloudflare deployment. OAuth registration may differ by hosted plan; if the provider rejects dynamic client registration, record the failure and keep the route fail-closed. No API keys or passwords are to be pasted into chat.
