// Read-only configuration gate. Passing this gate NEVER verifies receipt by Grafana.
// Grafana credentials must stay in Cloudflare destinations; never return them.
export const GRAFANA_DESTINATIONS = Object.freeze({
  logs: 'vaos-grafana-logs',
  traces: 'vaos-grafana-traces',
});

function report(status, reason, logsReady = false, tracesReady = false) {
  return Object.freeze({
    providerId: 'grafana',
    worker: 'vaos',
    status, reason, logsReady, tracesReady,
    liveVerified: false,
    productionQualified: false,
  });
}

function validEndpoint(value, signal) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && /(^|\.)grafana\.net$/.test(url.hostname)
      && url.pathname === '/otlp/v1/' + signal
      && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function validDestination(destination, signal) {
  const conf = destination?.configuration;
  return destination?.name === GRAFANA_DESTINATIONS[signal]
    && destination.enabled === true
    && conf?.type === 'logpush'
    && conf?.logpushDataset === 'opentelemetry-' + signal
    && validEndpoint(conf?.url, signal)
    && typeof conf.headers?.Authorization === 'string'
    && /^(Basic|Bearer)\s+\S+$/.test(conf.headers.Authorization);
}

function validSignalConfig(signal, config) {
  return config?.enabled === true
    && config.persist === false
    && Number.isFinite(config.head_sampling_rate)
    && config.head_sampling_rate > 0
    && config.head_sampling_rate <= (signal === 'logs' ? 0.25 : 0.1)
    && Array.isArray(config.destinations)
    && config.destinations.includes(GRAFANA_DESTINATIONS[signal]);
}

export function assessGrafanaCloudflareReadiness({ destinations, workerSettings } = {}) {
  if (!Array.isArray(destinations)) return report('HOLD', 'GRAFANA_DESTINATION_READBACK_MISSING');
  const found = Object.values(GRAFANA_DESTINATIONS)
    .map(name => destinations.find(d => d?.name === name));
  if (found.some(d => !d)) return report('HOLD', 'GRAFANA_OTLP_DESTINATIONS_MISSING');
  if (!validDestination(found[0], 'logs') || !validDestination(found[1], 'traces')) {
    return report('HOLD', 'GRAFANA_OTLP_DESTINATION_INVALID');
  }
  const observation = workerSettings?.observability;
  if (!observation || !validSignalConfig('logs', observation.logs)
    || !validSignalConfig('traces', observation.traces)) {
    return report('HOLD', 'GRAFANA_WORKER_EXPORT_NOT_ENABLED');
  }
  if (observation.redact_query_string !== true) {
    return report('HOLD', 'GRAFANA_QUERY_REDACTION_REQUIRED');
  }
  return report('CONFIGURED_NOT_VERIFIED', 'GRAFANA_INDEPENDENT_READBACK_REQUIRED', true, true);
}

// Generates only a proposed Wrangler observability stanza; never mutates production.
export function planGrafanaCloudflareExport(destinations) {
  if (!Array.isArray(destinations)
    || !Object.values(GRAFANA_DESTINATIONS).every(name => destinations.some(d => d?.name === name))) {
    return report('HOLD', 'GRAFANA_OTLP_DESTINATIONS_MISSING');
  }
  if (!validDestination(destinations.find(d => d.name === GRAFANA_DESTINATIONS.logs), 'logs')
    || !validDestination(destinations.find(d => d.name === GRAFANA_DESTINATIONS.traces), 'traces')) {
    return report('HOLD', 'GRAFANA_OTLP_DESTINATION_INVALID');
  }
  return Object.freeze({
    status: 'READY_TO_APPLY',
    liveVerified: false,
    productionQualified: false,
    observability: Object.freeze({
      enabled: true,
      redact_query_string: true,
      logs: Object.freeze({
        enabled: true, invocation_logs: true, persist: false,
        head_sampling_rate: 0.25,
        destinations: Object.freeze([GRAFANA_DESTINATIONS.logs]),
      }),
      traces: Object.freeze({
        enabled: true, persist: false,
        head_sampling_rate: 0.1,
        destinations: Object.freeze([GRAFANA_DESTINATIONS.traces]),
      }),
    }),
  });
}
