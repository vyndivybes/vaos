import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecutionTelemetryEvent } from './execution-telemetry.mjs';

test('execution telemetry emits a stable correlation envelope without business payloads', () => {
  const event=createExecutionTelemetryEvent({
    status:'succeeded',
    occurredAt:'2026-10-08T00:00:00.000Z',
    durationMs:342,
    missionId:'mission-1',
    intentId:'intent-1',
    approvalId:'approval-1',
    executionJobId:'job-1',
    providerId:'paperwork',
    capability:'document.extract',
    providerRunId:'exr_42',
    evidenceRef:'evidence:42',
  });
  assert.equal(event.name,'vaos.integration.execution');
  assert.equal(event.attributes['vaos.execution.job.id'],'job-1');
  assert.equal(event.attributes['vaos.intent.id'],'intent-1');
  assert.equal(event.attributes['vaos.provider.id'],'paperwork');
  assert.equal(event.attributes['vaos.capability'],'document.extract');
  assert.equal(event.attributes['vaos.execution.status'],'succeeded');
  assert.equal(event.attributes['vaos.provider.run.id'],'exr_42');
  assert.equal(event.attributes['vaos.evidence.ref'],'evidence:42');
  assert.equal(event.attributes['vaos.execution.duration_ms'],342);
  assert.equal('payload' in event,false);
});

test('failed telemetry records machine-readable error classification without exception messages or secrets', () => {
  const event=createExecutionTelemetryEvent({
    status:'failed',
    occurredAt:'2026-10-08T00:00:00.000Z',
    intentId:'intent-2',
    executionJobId:'job-2',
    providerId:'zapier',
    capability:'integration.saas',
    errorType:'ZAPIER_HOOK_UNAVAILABLE',
    retryable:false,
    outcomeUnknown:false,
    errorMessage:'https://hooks.zapier.com/secret-hook should never be emitted',
    secret:'do-not-emit',
  });
  assert.equal(event.attributes['error.type'],'ZAPIER_HOOK_UNAVAILABLE');
  assert.equal(event.attributes['vaos.execution.retryable'],false);
  assert.equal(event.attributes['vaos.execution.outcome_unknown'],false);
  const serialized=JSON.stringify(event);
  assert.equal(serialized.includes('secret-hook'),false);
  assert.equal(serialized.includes('do-not-emit'),false);
});

test('unknown outcome is distinct from failed and preserves reconciliation semantics', () => {
  const event=createExecutionTelemetryEvent({
    status:'unknown',
    occurredAt:'2026-10-08T00:00:00.000Z',
    intentId:'intent-3',
    executionJobId:'job-3',
    providerId:'playwright',
    capability:'browser.automate',
    errorType:'PLAYWRIGHT_OUTCOME_UNKNOWN',
    retryable:false,
    outcomeUnknown:true,
  });
  assert.equal(event.attributes['vaos.execution.status'],'unknown');
  assert.equal(event.attributes['vaos.execution.outcome_unknown'],true);
  assert.equal(event.attributes['error.type'],'PLAYWRIGHT_OUTCOME_UNKNOWN');
});

test('invalid status, timestamp or missing correlation fields fail closed', () => {
  const base={status:'started',occurredAt:'2026-10-08T00:00:00.000Z',intentId:'intent',executionJobId:'job',providerId:'n8n',capability:'workflow.orchestrate'};
  assert.throws(()=>createExecutionTelemetryEvent({...base,status:'maybe'}),/EXECUTION_TELEMETRY_INVALID:status/);
  assert.throws(()=>createExecutionTelemetryEvent({...base,occurredAt:'not-a-date'}),/EXECUTION_TELEMETRY_INVALID:occurredAt/);
  assert.throws(()=>createExecutionTelemetryEvent({...base,intentId:''}),/EXECUTION_TELEMETRY_INVALID:intentId/);
});

test('optional IDs are omitted rather than serialized as null or empty strings', () => {
  const event=createExecutionTelemetryEvent({
    status:'started',occurredAt:'2026-10-08T00:00:00.000Z',
    intentId:'intent-4',executionJobId:'job-4',providerId:'n8n',capability:'workflow.orchestrate',
  });
  assert.equal('vaos.mission.id' in event.attributes,false);
  assert.equal('vaos.approval.id' in event.attributes,false);
  assert.equal('vaos.provider.run.id' in event.attributes,false);
  assert.equal('vaos.evidence.ref' in event.attributes,false);
});
