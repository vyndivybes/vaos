import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenTelemetryExecutionSink } from './opentelemetry-sink.mjs';

function event(status, overrides = {}) {
  return {
    schemaVersion: 'vaos.execution.telemetry.v1',
    name: 'vaos.integration.execution',
    occurredAt: status === 'started'
      ? '2026-10-08T00:00:00.000Z'
      : '2026-10-08T00:00:00.420Z',
    attributes: {
      'vaos.intent.id': 'intent-1',
      'vaos.execution.job.id': 'job-1',
      'vaos.provider.id': 'paperwork',
      'vaos.capability': 'document.extract',
      'vaos.execution.status': status,
      ...(status !== 'started' ? {
        'vaos.execution.duration_ms': 420,
        'vaos.provider.run.id': 'run-1',
        'vaos.evidence.ref': 'evidence-1',
      } : {}),
      ...overrides,
    },
  };
}

function fakeTracer() {
  const spans = [];
  return {
    spans,
    startSpan(name, options) {
      const calls = [];
      const span = {
        name,
        options,
        calls,
        setAttributes(attributes) { calls.push({ op: 'setAttributes', attributes }); },
        setStatus(status) { calls.push({ op: 'setStatus', status }); },
        end(endTime) { calls.push({ op: 'end', endTime }); },
      };
      spans.push(span);
      return span;
    },
  };
}

test('OpenTelemetry sink opens one span on started and closes it on success', async () => {
  const tracer = fakeTracer();
  const sink = createOpenTelemetryExecutionSink({ tracer });

  await sink.emit(event('started'));
  await sink.emit(event('succeeded'));

  assert.equal(tracer.spans.length, 1);
  const span = tracer.spans[0];
  assert.equal(span.name, 'vaos.integration.execution');
  assert.equal(span.options.startTime, '2026-10-08T00:00:00.000Z');
  assert.equal(span.options.attributes['vaos.execution.job.id'], 'job-1');

  const attributes = span.calls.find((call) => call.op === 'setAttributes').attributes;
  assert.equal(attributes['vaos.execution.status'], 'succeeded');
  assert.equal(attributes['vaos.provider.run.id'], 'run-1');
  assert.equal(attributes['vaos.evidence.ref'], 'evidence-1');

  const status = span.calls.find((call) => call.op === 'setStatus').status;
  assert.deepEqual(status, { code: 1 });
  assert.equal(span.calls.at(-1).op, 'end');
  assert.equal(span.calls.at(-1).endTime, '2026-10-08T00:00:00.420Z');
});

test('failed and unknown executions map to OpenTelemetry ERROR status', async () => {
  for (const terminal of ['failed', 'unknown']) {
    const tracer = fakeTracer();
    const sink = createOpenTelemetryExecutionSink({ tracer });
    await sink.emit(event('started'));
    await sink.emit(event(terminal, {
      'error.type': terminal === 'failed' ? 'PROVIDER_FAILED' : 'PROVIDER_OUTCOME_UNKNOWN',
      'vaos.execution.outcome_unknown': terminal === 'unknown',
    }));

    const status = tracer.spans[0].calls.find((call) => call.op === 'setStatus').status;
    assert.deepEqual(status, { code: 2 });
  }
});

test('sink rejects terminal telemetry without a matching active span', async () => {
  const sink = createOpenTelemetryExecutionSink({ tracer: fakeTracer() });
  await assert.rejects(
    () => sink.emit(event('succeeded')),
    /OTEL_SPAN_NOT_STARTED:job-1/,
  );
});

test('sink rejects duplicate started events for the same execution job', async () => {
  const sink = createOpenTelemetryExecutionSink({ tracer: fakeTracer() });
  await sink.emit(event('started'));
  await assert.rejects(
    () => sink.emit(event('started')),
    /OTEL_SPAN_ALREADY_STARTED:job-1/,
  );
});

test('sink validates VAOS telemetry contract and does not accept arbitrary events', async () => {
  const sink = createOpenTelemetryExecutionSink({ tracer: fakeTracer() });

  await assert.rejects(
    () => sink.emit({ schemaVersion: 'wrong', name: 'vaos.integration.execution', occurredAt: '2026-10-08T00:00:00.000Z', attributes: {} }),
    /OTEL_EVENT_INVALID:schemaVersion/,
  );
  await assert.rejects(
    () => sink.emit({ ...event('started'), name: 'other.event' }),
    /OTEL_EVENT_INVALID:name/,
  );
});

test('sink forwards only the already-sanitized telemetry attributes and never the outer object', async () => {
  const tracer = fakeTracer();
  const sink = createOpenTelemetryExecutionSink({ tracer });

  const started = {
    ...event('started'),
    secret: 'do-not-forward',
    payload: { supplierQuote: 'confidential' },
  };
  await sink.emit(started);

  const serialized = JSON.stringify(tracer.spans[0].options);
  assert.equal(serialized.includes('do-not-forward'), false);
  assert.equal(serialized.includes('confidential'), false);
});
