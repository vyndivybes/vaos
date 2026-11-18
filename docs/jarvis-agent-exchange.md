# JARVIS Agent Exchange (JIX) — VAOS-native reporting

## Status
Implemented on a feature branch for qualification. **Not production qualified or deployed.**
This is a private, founder-read-only observation exchange. It does **not** certify AI-agent speech, autonomous learning, cognitive improvement, production business writes, or multimodal comprehension.

## Architecture
- UI: /agent-exchange.html, routed through the standard VAOS shell.
- API: GET /api/agent-exchange?period=daily|weekly|monthly (founder-authenticated).
- Collector: platform/execution/jarvis-agent-exchange.mjs.
- VAOS source: existing governed PostgreSQL workforce overview -> existing workforce analytics validation.
- VYNDI source: existing authenticated service binding + signed ORCHESTRATOR.OBSERVE_ENTERPRISE_BI (read-only).
- Archive: existing private VAOS_ARTIFACTS R2 bucket. History and latest pointer per period.
- Memory: reports are review candidates; no memory promotion is performed by JIX v1.

## Reporting windows — Asia/Kolkata
- 08:05 IST every day (Cloudflare 02:35 UTC): previous India calendar day.
- 08:15 IST Monday (Cloudflare 02:45 UTC): previous Monday through Sunday.
- 08:35 IST on the 1st (Cloudflare 03:05 UTC): previous calendar month.

JIX reuses VAOS's existing 5,15,25,35,45,55-minute cron trigger. Its asynchronous task is isolated from the existing mission, watchdog and market jobs, and adds zero Cloudflare Cron Trigger slots. Do not add extra account-level triggers on the Workers Free plan.

## Reporting truthfulness
A source record is not a direct agent-authored submission or proof of runtime liveness. A report packet explicitly records its observation provenance. Unavailable data is a HOLD, never a zero or a green status. Stored output is allowlisted metadata only: no raw ledger, personal, CRM, audio, image, or document rows.

Not included in this first increment: authenticated agent-origin inbox/webhooks, semantic knowledge promotions, proven improvement in reasoning, verified multimodal ingestion, historical report browsing in UI, or delivery/acknowledgement by an independent JARVIS runtime. These require additional commissioning and acceptance tests before claims of autonomous intelligence can be made.

## Qualification
On a checkout of this feature branch, before merging or deploying:

1. Run focused local tests without remote CI:
   node --test intelligence/agent-intelligence-exchange.test.mjs platform/execution/jarvis-agent-exchange.test.mjs apps/web/api/agent-exchange.test.mjs apps/web/agent-exchange-ui.test.mjs
2. Run npm run lint and npm run test:web; then the existing full repo gates as capacity allows. Do not bypass pre-existing security failures to turn the pipeline green.
3. Verify the new page on mobile and desktop, session denial, missing archive HOLD, signed VYNDI qualification, duplicate-cron idempotency, R2 permissions, and Cloudflare free-tier trigger and storage quotas.
4. Deploy only when qualified and authorized. Confirm the existing cron expression is active and that each period produces a correctly dated immutable archive and latest pointer.

## Operational safeguards
- No new paid services, secrets, API tokens, or storage buckets are introduced.
- No business mutations, agent execution, self-training, or automatic memory promotions.
- Any unavailable signed source remains HOLD. Read-only signatures and existing IAM gates are unchanged.
- Run-specific reports use runtime/jarvis-exchange/v1/<period>/<report-date>.json; latest pointers use runtime/jarvis-exchange/v1/latest/<period>.json.
- Do not describe the observation timeline as a live agent-to-agent chat until an authenticated message transport and JARVIS acknowledgement ledger exist.
