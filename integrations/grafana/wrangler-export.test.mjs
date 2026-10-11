import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GRAFANA_DESTINATIONS, assessGrafanaCloudflareReadiness } from './cloudflare-otel-readiness.mjs';

const wrangler = JSON.parse(readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8'));

test('VAOS export matches the two independently created Cloudflare destination names', () => {
  assert.deepEqual(GRAFANA_DESTINATIONS, { logs: 'grafana-logs', traces: 'grafana-traces' });
  assert.deepEqual(wrangler.observability.logs.destinations, ['grafana-logs']);
  assert.deepEqual(wrangler.observability.traces.destinations, ['grafana-traces']);
});

test('VAOS enables low-volume, externally exported telemetry with URL redaction', () => {
  const cfg = wrangler.observability;
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.redact_query_string, true);
  for (const signal of ['logs', 'traces']) {
    assert.equal(cfg[signal].enabled, true);
    assert.equal(cfg[signal].persist, false);
    assert.ok(cfg[signal].head_sampling_rate > 0);
    assert.ok(cfg[signal].head_sampling_rate <= (signal === 'logs' ? 0.25 : 0.1));
  }
  assert.equal(cfg.logs.invocation_logs, true);
});

test('Worker deployment preserves cron, infrastructure bindings and the deployed entry point', () => {
  assert.equal(wrangler.main, './apps/web/cloudflare-entry.mjs');
  assert.deepEqual(wrangler.triggers.crons, ['0 * * * *']);
  assert.ok(wrangler.durable_objects.bindings.some(b => b.name === 'WINDMILL_ADMISSION'));
  assert.ok(wrangler.durable_objects.bindings.some(b => b.name === 'ACTIVEPIECES_HANDSHAKE'));
  assert.ok(wrangler.r2_buckets.some(b => b.binding === 'VAOS_ARTIFACTS'));
  assert.equal(wrangler.keep_vars, true);
});

test('Configuration alone does not imply live Grafana delivery', () => {
  assert.equal(assessGrafanaCloudflareReadiness({destinations: [], workerSettings: wrangler}).productionQualified, false);
});
