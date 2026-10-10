# VAOS Founder Inbox – Stage 2 (record-only)

**Status: code candidate only. Not commissioned.** Stacked after Stage 1 PR #161.
Existing VAOS founder signed-session access is used only by the authenticated Worker API.
POST /api/founder-inbox accepts a strict envelope with UUID idempotency key, selected one of 16 agents, kind and text. GET returns at most 30 previous records scoped to the founder and selected agent.
An off-by-default Worker flag VAOS_FOUNDER_INBOX_CONTROL=record-only-v1 is required; its presence alone is not proof of DB migration or live qualification.

Records are **RECORDED_NOT_ROUTED**: not agent responses, not AI execution, not mission dispatch, not overrides. Changing state requires a separate commissioned routing service with independent verification and approvals.

Protection: cookie auth; founder-only server-side role check; same-Origin and JSON gate on POST; no client actor fields; server-secret Edge RPC; DB server-key assertion and founder identity double-check; private table with RLS and immutable rows; per-founder transactional rate limit 10/minute; idempotent UUID replay with conflict rejection; content never logged; no localStorage/service-worker caching.

## Commissioning gates
- Stage 1 merge or rebase and full regression tests.
- Apply additive DB migration after separate production recovery verification, **not as part of CI**.
- Deploy Edge function with exact RPC routes; keep Worker feature flag OFF.
- Verify RPC ACL and RLS with negative anon/authenticated tests and malformed-role probes.
- Authenticated founder POST, independent DB readback, replay/conflict/rate tests; checker and cross-origin denial.
- Only after PASS enable record-only flag. No automated agent routing until subsequent qualification.
