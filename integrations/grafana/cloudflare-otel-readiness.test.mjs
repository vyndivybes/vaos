import test from 'node:test';
import assert from 'node:assert/strict';
import { assessGrafanaCloudflareReadiness, planGrafanaCloudflareExport } from './cloudflare-otel-readiness.mjs';

const makeDestination = signal => ({
  name: 'grafana-' + signal,
  enabled: true,
  configuration: {
    type: 'logpush',
    logpushDataset: 'opentelemetry-' + signal,
    url: 'https://otlp-gateway-prod-ap-south-1.grafana.net/otlp/v1/' + signal,
    headers: { Authorization: 'Basic secret-never-show' },
  },
});
const settings = () => ({
  observability: {
    redact_query_string: true,
    logs: {
      enabled: true, persist: false, head_sampling_rate: 0.25,
      destinations: ['grafana-logs'],
    },
    traces: {
      enabled: true, persist: false, head_sampling_rate: 0.1,
      destinations: ['grafana-traces'],
    },
  },
});
const configured = () => ({
  destinations: [makeDestination('logs'), makeDestination('traces')],
  workerSettings: settings(),
});

test('missing destinations remain HOLD, never qualified', () => {
  const result = assessGrafanaCloudflareReadiness({ destinations: [], workerSettings: settings() });
  assert.equal(result.status, 'HOLD');
  assert.equal(result.reason, 'GRAFANA_OTLP_DESTINATIONS_MISSING');
  assert.equal(result.liveVerified, false);
});

test('configured Cloudflare export still requires independent Grafana readback', () => {
  const result = assessGrafanaCloudflareReadiness(configured());
  assert.equal(result.status, 'CONFIGURED_NOT_VERIFIED');
  assert.equal(result.liveVerified, false);
  assert.equal(result.logsReady, true);
  assert.equal(result.tracesReady, true);
  assert.equal(JSON.stringify(result).includes('secret-never-show'), false);
});

test('disabled destination cannot pass', () => {
  const c = configured();
  c.destinations[0].enabled = false;
  assert.equal(assessGrafanaCloudflareReadiness(c).reason, 'GRAFANA_OTLP_DESTINATION_INVALID');
});

test('reject wrong datasets, unsafe URLs and absent auth metadata', () => {
  for (const change of [
    d => { d.configuration.logpushDataset = 'opentelemetry-metrics'; },
    d => { d.configuration.url = 'http://otlp-gateway.grafana.net/otlp/v1/logs'; },
    d => { d.configuration.url = 'https://grafana.net.evil.example/otlp/v1/logs'; },
    d => { d.configuration.url = 'https://otlp-gateway.grafana.net/otlp/v1/traces'; },
    d => { d.configuration.headers = {}; },
  ]) {
    const c = configured();
    change(c.destinations[0]);
    assert.equal(assessGrafanaCloudflareReadiness(c).status, 'HOLD');
  }
});

test('destination existence alone does not activate Worker', () => {
  const c = configured();
  c.workerSettings.observability.traces.enabled = false;
  assert.equal(assessGrafanaCloudflareReadiness(c).reason, 'GRAFANA_WORKER_EXPORT_NOT_ENABLED');
});

test('free-tier and privacy controls must be present', () => {
  for (const change of [
    s => { s.observability.redact_query_string = false; },
    s => { s.observability.logs.persist = true; },
    s => { s.observability.traces.persist = true; },
    s => { s.observability.logs.head_sampling_rate = 1; },
    s => { s.observability.traces.head_sampling_rate = 1; },
    s => { s.observability.logs.destinations = ['wrong']; },
  ]) {
    const c = configured();
    change(c.workerSettings);
    assert.equal(assessGrafanaCloudflareReadiness(c).status, 'HOLD');
  }
});

test('no Worker settings means HOLD', () => {
  const c = configured();
  delete c.workerSettings;
  assert.equal(assessGrafanaCloudflareReadiness(c).status, 'HOLD');
});

test('activation plan is bounded and omits all credentials', () => {
  const plan = planGrafanaCloudflareExport(configured().destinations);
  assert.equal(plan.status, 'READY_TO_APPLY');
  assert.equal(plan.observability.redact_query_string, true);
  assert.equal(plan.observability.logs.head_sampling_rate, 0.25);
  assert.equal(plan.observability.traces.head_sampling_rate, 0.1);
  assert.equal(JSON.stringify(plan).includes('secret-never-show'), false);
  assert.equal(plan.productionQualified, false);
});

test('activation plan fails closed until both authenticated destinations exist', () => {
  assert.equal(planGrafanaCloudflareExport([]).status, 'HOLD');
  const c = configured();
  c.destinations[1].configuration.headers.Authorization = '';
  assert.equal(planGrafanaCloudflareExport(c.destinations).status, 'HOLD');
});
