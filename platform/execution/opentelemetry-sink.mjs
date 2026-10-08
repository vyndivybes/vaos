const VALID_TERMINAL = new Set(['succeeded', 'failed', 'unknown']);

function terminalError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  error.retryable = false;
  return error;
}

function validateTracer(tracer) {
  if (!tracer || typeof tracer.startSpan !== 'function') {
    throw terminalError('OTEL_TRACER_REQUIRED');
  }
  return tracer;
}

function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw terminalError('OTEL_EVENT_INVALID', 'OTEL_EVENT_INVALID:event');
  }
  if (event.schemaVersion !== 'vaos.execution.telemetry.v1') {
    throw terminalError('OTEL_EVENT_INVALID', 'OTEL_EVENT_INVALID:schemaVersion');
  }
  if (event.name !== 'vaos.integration.execution') {
    throw terminalError('OTEL_EVENT_INVALID', 'OTEL_EVENT_INVALID:name');
  }
  if (typeof event.occurredAt !== 'string' || Number.isNaN(new Date(event.occurredAt).getTime())) {
    throw terminalError('OTEL_EVENT_INVALID', 'OTEL_EVENT_INVALID:occurredAt');
  }
  if (!event.attributes || typeof event.attributes !== 'object' || Array.isArray(event.attributes)) {
    throw terminalError('OTEL_EVENT_INVALID', 'OTEL_EVENT_INVALID:attributes');
  }

  const jobId = event.attributes['vaos.execution.job.id'];
  const status = event.attributes['vaos.execution.status'];
  if (typeof jobId !== 'string' || !jobId.trim()) {
    throw terminalError('OTEL_EVENT_INVALID', 'OTEL_EVENT_INVALID:executionJobId');
  }
  if (!['started', ...VALID_TERMINAL].includes(status)) {
    throw terminalError('OTEL_EVENT_INVALID', 'OTEL_EVENT_INVALID:status');
  }

  return {
    jobId: jobId.trim(),
    status,
    occurredAt: event.occurredAt,
    attributes: Object.freeze({ ...event.attributes }),
  };
}

function validateSpan(span) {
  if (!span
      || typeof span.setAttributes !== 'function'
      || typeof span.setStatus !== 'function'
      || typeof span.end !== 'function') {
    throw terminalError('OTEL_SPAN_INVALID');
  }
  return span;
}

export function createOpenTelemetryExecutionSink({ tracer } = {}) {
  const resolvedTracer = validateTracer(tracer);
  const active = new Map();

  async function emit(inputEvent) {
    const event = validateEvent(inputEvent);

    if (event.status === 'started') {
      if (active.has(event.jobId)) {
        throw terminalError('OTEL_SPAN_ALREADY_STARTED', `OTEL_SPAN_ALREADY_STARTED:${event.jobId}`);
      }

      const span = validateSpan(resolvedTracer.startSpan('vaos.integration.execution', {
        startTime: event.occurredAt,
        attributes: event.attributes,
      }));
      active.set(event.jobId, span);
      return { status: 'STARTED', executionJobId: event.jobId };
    }

    const span = active.get(event.jobId);
    if (!span) {
      throw terminalError('OTEL_SPAN_NOT_STARTED', `OTEL_SPAN_NOT_STARTED:${event.jobId}`);
    }

    span.setAttributes(event.attributes);
    span.setStatus({ code: event.status === 'succeeded' ? 1 : 2 });
    span.end(event.occurredAt);
    active.delete(event.jobId);

    return { status: 'ENDED', executionJobId: event.jobId };
  }

  return Object.freeze({ emit });
}
