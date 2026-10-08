function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function validateEvent(event){
  if(!event||event.schemaVersion!=='vaos.ai.observation.v1'||event.name!=='vaos.ai.observation'||!event.attributes||typeof event.attributes!=='object'||Array.isArray(event.attributes))throw fail('LANGFUSE_AI_EVENT_INVALID');
  for(const key of Object.keys(event.attributes)){
    if(key==='langfuse.observation.input'||key==='langfuse.observation.output'||key.startsWith('gen_ai.prompt')||key.startsWith('gen_ai.completion'))throw fail('LANGFUSE_AI_UNSAFE_ATTRIBUTE');
  }
  const end=new Date(event.occurredAt);if(Number.isNaN(end.getTime()))throw fail('LANGFUSE_AI_EVENT_INVALID');
  const duration=Number(event.attributes['vaos.ai.duration_ms']??0);
  if(!Number.isFinite(duration)||duration<0)throw fail('LANGFUSE_AI_EVENT_INVALID');
  return {end,start:new Date(end.getTime()-duration),attributes:Object.freeze({...event.attributes})};
}
export function createLangfuseAiSpanSink({tracer}={}){
  if(!tracer||typeof tracer.startSpan!=='function')throw fail('LANGFUSE_TRACER_REQUIRED');
  async function emit(event){
    const validated=validateEvent(event);
    const operation=typeof validated.attributes['gen_ai.operation.name']==='string'?validated.attributes['gen_ai.operation.name']:'operation';
    const span=tracer.startSpan(`vaos.ai.${operation}`,{
      startTime:validated.start.toISOString(),
      attributes:validated.attributes,
    });
    if(!span||typeof span.setStatus!=='function'||typeof span.end!=='function')throw fail('LANGFUSE_SPAN_INVALID');
    const status=String(validated.attributes['vaos.ai.status']||'').toLowerCase();
    span.setStatus({code:status==='succeeded'?1:2});
    span.end(validated.end.toISOString());
    return Object.freeze({status:'EXPORTED'});
  }
  return Object.freeze({emit});
}
