# VAOS Grafana Cloud Worker telemetry

Status: deployment pending independent Grafana readback.

Cloudflare has two account-level OpenTelemetry destinations:

- `grafana-logs` for Worker logs
- `grafana-traces` for Worker traces

VAOS builds from the `main` branch of `vyndivybes/vaos` using `wrangler.jsonc`.

The Worker exports a sample of invocation logs (25%) and traces (10%) with URL-query redaction. External export is preferred over local telemetry persistence to reduce costs.

## Acceptance gates

1. Confirm both Cloudflare destinations exist and are enabled.
2. Run GitHub Grafana and Cloudflare bundle checks.
3. Confirm Cloudflare Workers Builds deployed the new `main` config.
4. Confirm both signals are visible inside Grafana Cloud's Loki and Tempo views.
5. Verify audit records and the existing watchdog are unaffected.
6. Complete incident, cost, security, and retention review.

Destination existence and a successful deployment are not by themselves proof of Grafana receipt. Keep the Grafana provider in evaluation mode until independently verified.

## Recovery

Restore the previously deployed observability configuration while preserving the VAOS cron, Worker bindings, service bindings, and authentication configuration.

## Official references

- https://developers.cloudflare.com/workers/observability/opentelemetry-export/
- https://developers.cloudflare.com/observability/export/opentelemetry/grafana-cloud/
