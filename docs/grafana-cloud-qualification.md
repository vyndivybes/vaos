# VAOS → Grafana Cloud — bounded commissioning

**Status: HOLD** until the Cloudflare OTLP destinations and independent Grafana receipt are verified. This document does not claim a live integration. Grafana is observe-only, not an execution authority.

## Recommended free architecture

VAOS Cloudflare Worker → native Cloudflare Observability OTLP export → Grafana Cloud Loki (logs) and Tempo (traces) → managed Cloudflare Workers dashboard and alerts. No local host, Docker, Alloy or separately managed collector required. Review Grafana Cloud Free quota before enablement. **Worker infrastructure metrics and custom metrics are not exported through Cloudflare OTLP**; retain Cloudflare analytics separately for these.

## Read-only preflight

- Confirm GitHub repository vyndivybes/vaos, production branch main, Worker vaos, wrangler.jsonc and cron */15 * * * *.
- Confirm exactly one enabled logs destination named vaos-grafana-logs (opentelemetry-logs) and one enabled traces destination named vaos-grafana-traces (opentelemetry-traces).
- Require stack-specific HTTPS endpoints ending /otlp/v1/logs and /otlp/v1/traces and a securely stored Authorization header.
- Review the logs for OAuth values, tokens, e-mail addresses, personal data, query strings, request bodies and mission content before sending telemetry to an external service. A redacted URL alone does not sanitize application console output.

## Commissioning

1. Sign into Grafana Cloud Free. Open Connections → Add new connection → OpenTelemetry (OTLP), or the Cloudflare Workers integration. If necessary create the Grafana Cloud stack. Obtain the stack-specific OTLP endpoint and authentication header from Grafana. **Keep the credential in Grafana/Cloudflare; never paste it into chat, GitHub, code, Wrangler or CI logs.**
2. In Cloudflare → Observability → Destinations create two **account-level** destinations:
   - vaos-grafana-logs: type opentelemetry-logs; endpoint ends /otlp/v1/logs.
   - vaos-grafana-traces: type opentelemetry-traces; endpoint ends /otlp/v1/traces.
   Use the Authorization header type and value exactly as supplied by the Grafana Cloud setup wizard. Region and auth scheme must not be guessed.
3. Fetch Cloudflare destinations and Worker settings again. Run assessGrafanaCloudflareReadiness(...) for read-only assessment, and planGrafanaCloudflareExport(destinations) to prepare the config. A plan is READY_TO_APPLY only after both destinations pass validation. This is **not** qualification.
4. After data-egress review, Cloudflare preview dry-run and approval, replace ONLY wrangler.jsonc's observability stanza with the generated observability plan; do not alter secrets, bindings, assets, cron, service bindings or Cloudflare Builds configuration. Use query-string redaction, logs sampling 25%, traces sampling 10%, and persist:false for both. Verify Wrangler compatibility before merging.
5. Merge after CI passes. Cloudflare Workers Builds (not GitHub Actions) deploys main. Read back the Worker settings independently. Ensure watchdog and existing scheduled mission sweep continue functioning.
6. Trigger one authorized read-only synthetic request and find the corresponding sanitized VAOS log in Grafana Cloud Loki and trace in Tempo. Independently verify worker identity, timestamps and outcome; do not use a configuration-only result as evidence of delivery.
7. Install Grafana Cloud's built-in Cloudflare Workers dashboard. Test bounded alerts for Worker failures, cron/watchdog exceptions, error-rate spikes, latency and absence of telemetry.

## States, release gate and rollback

- HOLD: missing or invalid destinations, export off, unredacted URL queries, excessive sampling or persistence enabled.
- CONFIGURED_NOT_VERIFIED: Cloudflare wiring matches but **no provider-side log + trace readback**; not production qualified.
- PASS is possible only after both log and trace receipt, safe alert drill, and independent audit evidence. Do not set Grafana provider-manifest enabled:true while this is unproven.
- Rollback by restoring last-known-good Worker observability configuration and redeploying; leave existing cron, worker bindings, local logging and other integrations unchanged. Revoke the scoped Grafana token separately if appropriate.

References:
- Cloudflare: https://developers.cloudflare.com/observability/export/opentelemetry/grafana-cloud/
- Cloudflare Worker OTLP: https://developers.cloudflare.com/workers/observability/opentelemetry-export/
- Grafana Cloudflare Workers integration: https://grafana.com/docs/grafana-cloud/observe-and-act/monitor-infrastructure/integrations/integration-reference/integration-cloudflare-workers/
