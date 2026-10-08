import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecutionTelemetryRecorder } from './telemetry-recorder.mjs';

function base() {
  return {
    missionId: 'mission-7',
    intentId: 'intent-7',
    approvalId: 'approval-7',
    executionJobId: 'job-7',
    providerId: 'n8n',
    capability: 'workflow.orchestrate',
  };
}

test('recorder emits started then succeeded with duration and provider evidence correlation', async () => {
  const emitted=[];
  let now=1_000;
  const recorder=createExecutionTelemetryRecorder({
    emit: async event => emitted.push(event),
    now: () => new Date(now),
  });
  const execution=await recorder.start(base());
  now=1_420;
  await execution.succeed({providerRunId:'run-77',evidenceRef:'evidence-77'});

  assert.equal(emitted.length,2);
  assert.equal(emitted[0].attributes['vaos.execution.status'],'started');
  assert.equal(emitted[1].attributes['vaos.execution.status'],'succeeded');
  assert.equal(emitted[1].attributes['vaos.execution.duration_ms'],420);
  assert.equal(emitted[1].attributes['vaos.provider.run.id'],'run-77');
  assert.equal(emitted[1].attributes['vaos.evidence.ref'],'evidence-77');
});

test('recorder emits failed classification without raw error message', async () => {
  const emitted=[];
  const recorder=createExecutionTelemetryRecorder({
    emit: async event => emitted.push(event),
    now: () => new Date('2026-10-08T00:00:00.000Z'),
  });
  const execution=await recorder.start(base());
  await execution.fail({
    errorType:'N8N_AUTHENTICATION_FAILED',
    retryable:false,
    errorMessage:'Bearer super-secret',
  });
  const final=emitted.at(-1);
  assert.equal(final.attributes['error.type'],'N8N_AUTHENTICATION_FAILED');
  assert.equal(final.attributes['vaos.execution.retryable'],false);
  assert.equal(JSON.stringify(final).includes('super-secret'),false);
});

test('recorder emits unknown outcome as a distinct terminal state', async () => {
  const emitted=[];
  const recorder=createExecutionTelemetryRecorder({
    emit: async event => emitted.push(event),
    now: () => new Date('2026-10-08T00:00:00.000Z'),
  });
  const execution=await recorder.start(base());
  await execution.unknown({errorType:'ZAPIER_OUTCOME_UNKNOWN',retryable:false});
  const final=emitted.at(-1);
  assert.equal(final.attributes['vaos.execution.status'],'unknown');
  assert.equal(final.attributes['vaos.execution.outcome_unknown'],true);
});

test('execution handle allows exactly one terminal outcome', async () => {
  const recorder=createExecutionTelemetryRecorder({
    emit: async () => {},
    now: () => new Date('2026-10-08T00:00:00.000Z'),
  });
  const execution=await recorder.start(base());
  await execution.succeed({});
  await assert.rejects(
    () => execution.fail({errorType:'SHOULD_NOT_EMIT',retryable:false}),
    /EXECUTION_TELEMETRY_ALREADY_TERMINAL/,
  );
});

test('sink failure does not silently mark telemetry as emitted', async () => {
  let calls=0;
  const recorder=createExecutionTelemetryRecorder({
    emit: async () => {
      calls+=1;
      if(calls===2) throw new Error('sink down');
    },
    now: () => new Date('2026-10-08T00:00:00.000Z'),
  });
  const execution=await recorder.start(base());
  await assert.rejects(() => execution.succeed({}),/sink down/);
  await execution.fail({errorType:'PROVIDER_FAILED',retryable:true});
  assert.equal(calls,3);
});
