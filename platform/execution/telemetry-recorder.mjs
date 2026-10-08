import { createExecutionTelemetryEvent } from '../../packages/contracts/execution-telemetry.mjs';

function terminalError(code) {
  const error=new Error(code);
  error.code=code;
  error.retryable=false;
  return error;
}

function requiredText(input,key) {
  const value=input?.[key];
  if(typeof value!=='string'||!value.trim()) throw terminalError(`EXECUTION_TELEMETRY_INVALID:${key}`);
  return value.trim();
}

function optionalText(input,key) {
  const value=input?.[key];
  return typeof value==='string'&&value.trim()?value.trim():undefined;
}

function normalizeBase(input) {
  return Object.freeze({
    missionId: optionalText(input,'missionId'),
    intentId: requiredText(input,'intentId'),
    approvalId: optionalText(input,'approvalId'),
    executionJobId: requiredText(input,'executionJobId'),
    providerId: requiredText(input,'providerId'),
    capability: requiredText(input,'capability'),
  });
}

export function createExecutionTelemetryRecorder({ emit, now=()=>new Date() }={}) {
  if(typeof emit!=='function') throw terminalError('EXECUTION_TELEMETRY_EMITTER_REQUIRED');
  if(typeof now!=='function') throw terminalError('EXECUTION_TELEMETRY_CLOCK_INVALID');

  async function start(input) {
    const base=normalizeBase(input);
    const startedAt=now();
    if(!(startedAt instanceof Date)||Number.isNaN(startedAt.getTime())) throw terminalError('EXECUTION_TELEMETRY_CLOCK_INVALID');

    await emit(createExecutionTelemetryEvent({
      ...base,
      status:'started',
      occurredAt:startedAt.toISOString(),
    }));

    let terminal=false;

    async function finish(status, details={}) {
      if(terminal) throw terminalError('EXECUTION_TELEMETRY_ALREADY_TERMINAL');
      const finishedAt=now();
      if(!(finishedAt instanceof Date)||Number.isNaN(finishedAt.getTime())) throw terminalError('EXECUTION_TELEMETRY_CLOCK_INVALID');
      const durationMs=Math.max(0,finishedAt.getTime()-startedAt.getTime());

      const event=createExecutionTelemetryEvent({
        ...base,
        status,
        occurredAt:finishedAt.toISOString(),
        durationMs,
        providerRunId: optionalText(details,'providerRunId'),
        evidenceRef: optionalText(details,'evidenceRef'),
        errorType: optionalText(details,'errorType'),
        retryable: details.retryable,
        outcomeUnknown: status==='unknown' ? true : details.outcomeUnknown,
      });

      await emit(event);
      terminal=true;
      return event;
    }

    return Object.freeze({
      succeed(details={}) { return finish('succeeded',details); },
      fail(details={}) { return finish('failed',details); },
      unknown(details={}) { return finish('unknown',details); },
    });
  }

  return Object.freeze({ start });
}
