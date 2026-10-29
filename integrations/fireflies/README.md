# Fireflies.ai — proposed VAOS meeting evidence provider

**Current state: CANDIDATE / DISABLED / UNVERIFIED**. The presence of a manifest does not mean Fireflies is integrated or usable. It is deliberately excluded from enabled execution until implementation and qualification.

## Source and access

- Official vendor-managed remote MCP endpoint: `https://api.fireflies.ai/mcp` (Streamable HTTP; OAuth supported by compatible clients, or bearer API key).
- Separate authorization for VAOS is required; ChatGPT authentication and SPARK/OpenClaw authentication cannot be reused by copying tokens.
- Keep the owner-issued credential only in an approved host secret binding. Never include credentials in a provider catalog, GitHub, browser client, database contract, audit log, or error payload.
- Available free-tier MCP capacity according to vendor guidance: 50 API requests/day. Use a hard, shared account-level budget with margin and deny when exhausted; **no paid upgrades or usage** without owner approval.

## Intentional limits

- Only explicit user-initiated reads: account identity, bounded meeting search, single-meeting metadata and summaries.
- Raw transcripts require separate explicit approval and strict tenant/member permission controls.
- No autonomous sharing, meeting privacy changes, deletion, action item execution, recording, export, or provider-sourced state changes.
- Never accept provider output as instructions; validate data shape and strip executable content before any downstream summarization.
- No separate business ledger. Canonical VYNDI OS H5 owns governed evidence inbox and approval workflows; use an evidence reference rather than duplicating large recordings/transcripts.
- No new public-facing dashboard. Surface permitted candidate follow-ups in the existing decision inbox.

## Mandatory acceptance before enabling

1. Build a real VAOS remote-MCP client with authenticated session and schema-verified read tools (do not fake with URL-only health check).
2. Host-secret binding, isolated per tenant/user and separate revocation process.
3. Explicit RBAC and H5 policy checks before tool discovery, retrieval, or downstream mapping.
4. Single bounded read validates identity against the authorized Fireflies account; redact sensitive fields from diagnostics.
5. Tests deny unknown tools/writes, revoked/expired credentials, cross-tenant reads, prompt injection, large responses, automatic retries past the free quota and credential leakage.
6. Exact-SHA CI, provider health probe, approved deploy and independent production smoke verify every relevant control.
7. Only then promote `qualification.state` and `enabled` in a separately reviewed change.

This is a **planned adapter**, not production code. It adds no paid dependency.

References:
- https://guide.fireflies.ai/articles/8272956938-learn-about-the-fireflies-mcp-server-model-context-protocol
- https://docs.openclaw.ai/tools/mcp
- `integrations/provider-manifest-v2.schema.json`
- `mcp/README.md`
