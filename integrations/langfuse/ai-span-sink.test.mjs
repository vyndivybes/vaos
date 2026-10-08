import test from 'node:test';
import assert from 'node:assert/strict';
import { createLangfuseAiSpanSink } from './ai-span-sink.mjs';

function fakeTracer(){
  const spans=[];
  return {
    spans,
    startSpan(name,options){
      const calls=[];
      const span={
        name,options,calls,
        setStatus(status){calls.push({op:'setStatus',status})},
        end(time){calls.push({op:'end',time})},
      };
      spans.push(span);
      return span;
    },
  };
}
function event(overrides={}){
  return {
    schemaVersion:'vaos.ai.observation.v1',
    name:'vaos.ai.observation',
    occurredAt:'2026-10-08T00:00:01.000Z',
    attributes:{
      'vaos.mission.id':'m1','vaos.intent.id':'i1','vaos.execution.job.id':'j1',
      'vaos.agent.id':'vibpe-copilot','vaos.ai.status':'succeeded','vaos.ai.duration_ms':500,
      'gen_ai.operation.name':'generation','gen_ai.request.model':'gpt-5.6',
      'gen_ai.usage.input_tokens':100,'gen_ai.usage.output_tokens':40,
      'langfuse.observation.type':'generation',
      ...overrides,
    },
  };
}

test('Langfuse sink creates one GenAI OpenTelemetry span with derived start/end times',async()=>{
  const tracer=fakeTracer();
  const sink=createLangfuseAiSpanSink({tracer});
  await sink.emit(event());
  assert.equal(tracer.spans.length,1);
  const span=tracer.spans[0];
  assert.equal(span.name,'vaos.ai.generation');
  assert.equal(span.options.startTime,'2026-10-08T00:00:00.500Z');
  assert.equal(span.options.attributes['langfuse.observation.type'],'generation');
  assert.equal(span.options.attributes['gen_ai.request.model'],'gpt-5.6');
  assert.deepEqual(span.calls.find(x=>x.op==='setStatus').status,{code:1});
  assert.equal(span.calls.at(-1).endTime,'2026-10-08T00:00:01.000Z');
});

test('failed/unknown AI observation maps to OTel ERROR without raw IO',async()=>{
  const tracer=fakeTracer();
  const sink=createLangfuseAiSpanSink({tracer});
  await sink.emit(event({'vaos.ai.status':'failed','error.type':'MODEL_TIMEOUT'}));
  const span=tracer.spans[0];
  assert.deepEqual(span.calls.find(x=>x.op==='setStatus').status,{code:2});
  const serialized=JSON.stringify(span.options);
  assert.equal(serialized.includes('langfuse.observation.input'),false);
  assert.equal(serialized.includes('langfuse.observation.output'),false);
});

test('sink rejects non-VAOS AI observation and unsafe IO attributes',async()=>{
  const sink=createLangfuseAiSpanSink({tracer:fakeTracer()});
  await assert.rejects(()=>sink.emit({...event(),schemaVersion:'wrong'}),/LANGFUSE_AI_EVENT_INVALID/);
  await assert.rejects(()=>sink.emit(event({'langfuse.observation.input':'secret'})),/LANGFUSE_AI_UNSAFE_ATTRIBUTE/);
});
