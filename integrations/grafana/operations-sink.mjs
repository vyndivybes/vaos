function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function validateEvent(event){
  if(!event||event.schemaVersion!=='vaos.execution.telemetry.v1'||event.name!=='vaos.integration.execution')throw fail('GRAFANA_EVENT_INVALID');
  const allowed=new Set(['schemaVersion','name','occurredAt','attributes']);
  for(const key of Object.keys(event))if(!allowed.has(key))throw fail('GRAFANA_EVENT_UNSAFE_FIELD');
  if(!event.attributes||typeof event.attributes!=='object'||Array.isArray(event.attributes))throw fail('GRAFANA_EVENT_INVALID');
  for(const key of Object.keys(event.attributes)){
    if(key.startsWith('gen_ai.prompt')||key.startsWith('gen_ai.completion')||key==='langfuse.observation.input'||key==='langfuse.observation.output'){
      throw fail('GRAFANA_EVENT_UNSAFE_ATTRIBUTE');
    }
  }
  return Object.freeze({
    schemaVersion:event.schemaVersion,
    name:event.name,
    occurredAt:event.occurredAt,
    attributes:Object.freeze({...event.attributes}),
  });
}
export function createGrafanaOperationsSink({exporter}={}){
  if(!exporter||typeof exporter.exportExecutionEvent!=='function')throw fail('GRAFANA_EXPORTER_REQUIRED');
  async function emit(input){
    const event=validateEvent(input);
    let result;
    try{result=await exporter.exportExecutionEvent(event)}
    catch{throw fail('GRAFANA_EXPORT_FAILED')}
    if(!result||result.accepted!==true)throw fail('GRAFANA_EXPORT_REJECTED');
    return Object.freeze({status:'EXPORTED',exportId:typeof result.exportId==='string'?result.exportId:null});
  }
  return Object.freeze({emit});
}
