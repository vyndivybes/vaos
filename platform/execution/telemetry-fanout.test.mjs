import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelemetryFanout } from './telemetry-fanout.mjs';

function event(){return{schemaVersion:'vaos.execution.telemetry.v1',name:'vaos.integration.execution',occurredAt:'2026-10-08T00:00:00.000Z',attributes:{'vaos.execution.job.id':'job-1','vaos.intent.id':'intent-1','vaos.provider.id':'n8n','vaos.capability':'workflow.orchestrate','vaos.execution.status':'started'}}}

test('fanout sends same sanitized event to all enabled sinks',async()=>{
 const received=[];
 const f=createTelemetryFanout({sinks:[
  {id:'otlp',required:true,emit:async e=>received.push(['otlp',e])},
  {id:'langfuse',required:false,emit:async e=>received.push(['langfuse',e])},
 ]});
 const r=await f.emit(event());
 assert.equal(r.delivered,2);
 assert.deepEqual(received.map(x=>x[0]),['otlp','langfuse']);
});

test('optional sink failure is reported but does not fail primary execution telemetry',async()=>{
 const f=createTelemetryFanout({sinks:[
  {id:'otlp',required:true,emit:async()=>{}},
  {id:'langfuse',required:false,emit:async()=>{throw new Error('down')}},
 ]});
 const r=await f.emit(event());
 assert.equal(r.delivered,1);
 assert.deepEqual(r.failed,[{id:'langfuse',required:false}]);
});

test('required sink failure fails explicitly without leaking sink error message',async()=>{
 const f=createTelemetryFanout({sinks:[
  {id:'otlp',required:true,emit:async()=>{throw new Error('Bearer secret backend error')}},
 ]});
 await assert.rejects(async()=>{try{await f.emit(event())}catch(e){assert.equal(e.code,'TELEMETRY_REQUIRED_SINK_FAILED');assert.equal(e.message.includes('secret'),false);throw e}},/TELEMETRY_REQUIRED_SINK_FAILED/);
});

test('fanout accepts only VAOS sanitized execution telemetry contract',async()=>{
 const f=createTelemetryFanout({sinks:[{id:'otlp',required:true,emit:async()=>{}}]});
 await assert.rejects(()=>f.emit({...event(),payload:{secret:'x'}}),/TELEMETRY_EVENT_UNSAFE_FIELD/);
 await assert.rejects(()=>f.emit({...event(),schemaVersion:'wrong'}),/TELEMETRY_EVENT_INVALID/);
});
