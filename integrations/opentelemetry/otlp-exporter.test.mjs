import test from 'node:test';
import assert from 'node:assert/strict';
import { createOtlpExecutionExporter } from './otlp-exporter.mjs';

function event(status='succeeded'){
  return {
    schemaVersion:'vaos.execution.telemetry.v1',
    name:'vaos.integration.execution',
    occurredAt:'2026-10-08T00:00:00.420Z',
    attributes:{
      'vaos.intent.id':'intent-1',
      'vaos.execution.job.id':'job-1',
      'vaos.provider.id':'n8n',
      'vaos.capability':'workflow.orchestrate',
      'vaos.execution.status':status,
      'vaos.execution.duration_ms':420,
    },
  };
}

test('OTLP exporter maps sanitized execution event to one span record',async()=>{
  const batches=[];
  const exporter=createOtlpExecutionExporter({
    client:{async exportSpans(spans){batches.push(spans);return{accepted:true,exportId:'batch-1'}}},
  });
  const result=await exporter.exportExecutionEvent(event());
  assert.equal(result.accepted,true);
  assert.equal(result.exportId,'batch-1');
  assert.equal(batches.length,1);
  assert.equal(batches[0][0].name,'vaos.integration.execution');
  assert.equal(batches[0][0].attributes['vaos.execution.job.id'],'job-1');
});

test('OTLP exporter rejects unsafe outer fields',async()=>{
  let touched=false;
  const exporter=createOtlpExecutionExporter({client:{async exportSpans(){touched=true}}});
  await assert.rejects(()=>exporter.exportExecutionEvent({...event(),payload:{secret:'x'}}),/OTLP_EVENT_UNSAFE_FIELD/);
  assert.equal(touched,false);
});

test('OTLP exporter rejects raw prompt/completion attributes',async()=>{
  let touched=false;
  const e=event();e.attributes['gen_ai.prompt.0']='secret';
  const exporter=createOtlpExecutionExporter({client:{async exportSpans(){touched=true}}});
  await assert.rejects(()=>exporter.exportExecutionEvent(e),/OTLP_EVENT_UNSAFE_ATTRIBUTE/);
  assert.equal(touched,false);
});

test('client failure returns safe exporter error without backend message leakage',async()=>{
  const exporter=createOtlpExecutionExporter({
    client:{async exportSpans(){throw new Error('Authorization Bearer secret-token failed')}},
  });
  await assert.rejects(async()=>{try{await exporter.exportExecutionEvent(event())}catch(e){
    assert.equal(e.code,'OTLP_EXPORT_FAILED');
    assert.equal(e.message.includes('secret-token'),false);
    throw e;
  }},/OTLP_EXPORT_FAILED/);
});
