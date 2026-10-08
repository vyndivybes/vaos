function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function validate(event){
  if(!event||event.schemaVersion!=='vaos.execution.telemetry.v1'||event.name!=='vaos.integration.execution')throw fail('OTLP_EVENT_INVALID');
  const allowed=new Set(['schemaVersion','name','occurredAt','attributes']);
  for(const key of Object.keys(event))if(!allowed.has(key))throw fail('OTLP_EVENT_UNSAFE_FIELD');
  if(!event.attributes||typeof event.attributes!=='object'||Array.isArray(event.attributes))throw fail('OTLP_EVENT_INVALID');
  for(const key of Object.keys(event.attributes)){
    if(key.startsWith('gen_ai.prompt')||key.startsWith('gen_ai.completion')||key==='langfuse.observation.input'||key==='langfuse.observation.output')throw fail('OTLP_EVENT_UNSAFE_ATTRIBUTE');
  }
  const end=new Date(event.occurredAt);if(Number.isNaN(end.getTime()))throw fail('OTLP_EVENT_INVALID');
  const duration=Number(event.attributes['vaos.execution.duration_ms']??0);
  if(!Number.isFinite(duration)||duration<0)throw fail('OTLP_EVENT_INVALID');
  return {
    name:event.name,
    startTime:new Date(end.getTime()-duration).toISOString(),
    endTime:end.toISOString(),
    attributes:Object.freeze({...event.attributes}),
    status:String(event.attributes['vaos.execution.status']||'').toLowerCase(),
  };
}
export function createOtlpExecutionExporter({client}={}){
  if(!client||typeof client.exportSpans!=='function')throw fail('OTLP_CLIENT_REQUIRED');
  async function exportExecutionEvent(event){
    const v=validate(event);
    const span=Object.freeze({
      name:v.name,
      startTime:v.startTime,
      endTime:v.endTime,
      attributes:v.attributes,
      status:v.status==='succeeded'?'OK':'ERROR',
    });
    let result;
    try{result=await client.exportSpans([span])}
    catch{throw fail('OTLP_EXPORT_FAILED')}
    if(!result||result.accepted!==true)throw fail('OTLP_EXPORT_REJECTED');
    return Object.freeze({accepted:true,exportId:typeof result.exportId==='string'?result.exportId:null});
  }
  return Object.freeze({exportExecutionEvent});
}
