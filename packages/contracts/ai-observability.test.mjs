import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiObservation } from './ai-observability.mjs';

test('AI observation contains correlation, model, usage and hashes but no raw prompts or completions',()=>{
 const e=createAiObservation({
  occurredAt:'2026-10-08T00:00:00.000Z',durationMs:820,
  missionId:'m1',intentId:'i1',executionJobId:'j1',agentId:'vibpe-copilot',
  operation:'generation',model:'gpt-5.6',status:'succeeded',
  inputHash:'sha256:in',outputHash:'sha256:out',
  inputTokens:120,outputTokens:48,totalCostUsd:0.0123,
  prompt:'secret prompt',completion:'secret output',
 });
 assert.equal(e.schemaVersion,'vaos.ai.observation.v1');
 assert.equal(e.attributes['gen_ai.operation.name'],'generation');
 assert.equal(e.attributes['gen_ai.request.model'],'gpt-5.6');
 assert.equal(e.attributes['gen_ai.usage.input_tokens'],120);
 assert.equal(e.attributes['gen_ai.usage.output_tokens'],48);
 assert.equal(e.attributes['gen_ai.usage.cost'],0.0123);
 const serialized=JSON.stringify(e);
 assert.equal(serialized.includes('secret prompt'),false);
 assert.equal(serialized.includes('secret output'),false);
});

test('raw input/output fields are never accepted as observation attributes',()=>{
 const e=createAiObservation({
  occurredAt:'2026-10-08T00:00:00.000Z',missionId:'m',intentId:'i',executionJobId:'j',
  agentId:'a',operation:'tool',model:'local-model',status:'failed',
  errorType:'MODEL_TIMEOUT',input:{secret:'x'},output:{secret:'y'},
 });
 assert.equal(JSON.stringify(e).includes('"secret":"x"'),false);
 assert.equal(e.attributes['error.type'],'MODEL_TIMEOUT');
});

test('invalid status or missing correlation fails closed',()=>{
 const base={occurredAt:'2026-10-08T00:00:00.000Z',missionId:'m',intentId:'i',executionJobId:'j',agentId:'a',operation:'generation',model:'m',status:'succeeded'};
 assert.throws(()=>createAiObservation({...base,status:'maybe'}),/AI_OBSERVATION_INVALID:status/);
 assert.throws(()=>createAiObservation({...base,intentId:''}),/AI_OBSERVATION_INVALID:intentId/);
});
