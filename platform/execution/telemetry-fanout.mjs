function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function validateEvent(event){
  if(!event||typeof event!=='object'||Array.isArray(event))throw fail('TELEMETRY_EVENT_INVALID');
  if(event.schemaVersion!=='vaos.execution.telemetry.v1'||event.name!=='vaos.integration.execution')throw fail('TELEMETRY_EVENT_INVALID');
  const allowed=new Set(['schemaVersion','name','occurredAt','attributes']);
  for(const key of Object.keys(event))if(!allowed.has(key))throw fail('TELEMETRY_EVENT_UNSAFE_FIELD');
  if(!event.attributes||typeof event.attributes!=='object'||Array.isArray(event.attributes))throw fail('TELEMETRY_EVENT_INVALID');
  return Object.freeze({schemaVersion:event.schemaVersion,name:event.name,occurredAt:event.occurredAt,attributes:Object.freeze({...event.attributes})});
}
export function createTelemetryFanout({sinks=[]}={}){
  if(!Array.isArray(sinks)||!sinks.length)throw fail('TELEMETRY_SINKS_REQUIRED');
  const normalized=sinks.map(s=>{
    if(!s||typeof s.id!=='string'||!s.id.trim()||typeof s.required!=='boolean'||typeof s.emit!=='function')throw fail('TELEMETRY_SINK_INVALID');
    return Object.freeze({id:s.id.trim(),required:s.required,emit:s.emit});
  });
  if(new Set(normalized.map(s=>s.id)).size!==normalized.length)throw fail('TELEMETRY_SINK_DUPLICATE');

  async function emit(input){
    const event=validateEvent(input);
    let delivered=0;const failed=[];
    for(const sink of normalized){
      try{await sink.emit(event);delivered+=1}
      catch{
        failed.push({id:sink.id,required:sink.required});
        if(sink.required)throw fail('TELEMETRY_REQUIRED_SINK_FAILED');
      }
    }
    return Object.freeze({delivered,failed:Object.freeze(failed.map(x=>Object.freeze({...x})))});
  }
  return Object.freeze({emit});
}
