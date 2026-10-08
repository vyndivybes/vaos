import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrafanaOperationsSink } from './operations-sink.mjs';

function event(status='succeeded'){
  return {
    schemaVersion:'vaos.execution.telemetry.v1',
    name:'vaos.integration.execution',
    occurredAt:'2026-10-08T00:00:00.000Z',
    attributes:{
      'vaos.intent.id':'intent-1',
      'vaos.execution.job.id':'job-1',
      'vaos.provider.id':'n8n',
      'vaos.capability':'workflow.orchestrate',
      'vaos.execution.status':status,
    },
  };
}

test('Grafana operations sink exports only sanitized execution telemetry through OTLP boundary',async()=>{
  const calls=[];
  const sink=createGrafanaOperationsSink({
    exporter:{async exportExecutionEvent(input){calls.push(input);return{accepted:true,exportId:'otlp-1'}}},
  });
  const result=await sink.emit(event());
  assert.equal(result.status,'EXPORTED');
  assert.equal(result.exportId,'otlp-1');
  assert.equal(calls[0].schemaVersion,'vaos.execution.telemetry.v1');
});

test('unsafe outer fields are rejected before exporter access',async()=>{
  let touched=false;
  const sink=createGrafanaOperationsSink({
    exporter:{async exportExecutionEvent(){touched=true}},
  });
  await assert.rejects(()=>sink.emit({...event(),secret:'do-not-export'}),/GRAFANA_EVENT_UNSAFE_FIELD/);
  assert.equal(touched,false);
});

test('raw prompt/completion style attributes are rejected from operations telemetry',async()=>{
  let touched=false;
  const sink=createGrafanaOperationsSink({
    exporter:{async exportExecutionEvent(){touched=true}},
  });
  const e=event();e.attributes['gen_ai.prompt.0']='secret prompt';
  await assert.rejects(()=>sink.emit(e),/GRAFANA_EVENT_UNSAFE_ATTRIBUTE/);
  assert.equal(touched,false);
});

test('exporter failure is surfaced without embedding backend error text',async()=>{
  const sink=createGrafanaOperationsSink({
    exporter:{async exportExecutionEvent(){throw new Error('Bearer secret backend unavailable')}},
  });
  await assert.rejects(async()=>{try{await sink.emit(event())}catch(e){
    assert.equal(e.code,'GRAFANA_EXPORT_FAILED');
    assert.equal(e.message.includes('secret'),false);
    throw e;
  }},/GRAFANA_EXPORT_FAILED/);
});
