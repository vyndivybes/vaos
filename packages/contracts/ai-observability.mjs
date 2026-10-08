const STATUS=new Set(['started','succeeded','failed','unknown']);
function fail(field){const e=new Error(`AI_OBSERVATION_INVALID:${field}`);e.code='AI_OBSERVATION_INVALID';e.retryable=false;return e}
function req(input,key){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw fail(key);return v.trim()}
function optText(input,key){const v=input?.[key];return typeof v==='string'&&v.trim()?v.trim():undefined}
function optNumber(v,key,{min=0}={}){if(v===undefined)return undefined;const n=Number(v);if(!Number.isFinite(n)||n<min)throw fail(key);return n}
export function createAiObservation(input={}){
  const occurredAt=req(input,'occurredAt');const time=new Date(occurredAt);if(Number.isNaN(time.getTime()))throw fail('occurredAt');
  const status=req(input,'status').toLowerCase();if(!STATUS.has(status))throw fail('status');
  const missionId=req(input,'missionId'),intentId=req(input,'intentId'),executionJobId=req(input,'executionJobId');
  const agentId=req(input,'agentId'),operation=req(input,'operation'),model=req(input,'model');
  const durationMs=optNumber(input.durationMs,'durationMs');
  const inputTokens=optNumber(input.inputTokens,'inputTokens');
  const outputTokens=optNumber(input.outputTokens,'outputTokens');
  const totalCostUsd=optNumber(input.totalCostUsd,'totalCostUsd');
  const inputHash=optText(input,'inputHash'),outputHash=optText(input,'outputHash'),errorType=optText(input,'errorType');

  const attributes={
    'vaos.mission.id':missionId,
    'vaos.intent.id':intentId,
    'vaos.execution.job.id':executionJobId,
    'vaos.agent.id':agentId,
    'vaos.ai.status':status,
    'gen_ai.operation.name':operation,
    'gen_ai.request.model':model,
    'langfuse.observation.type':operation==='generation'?'generation':operation==='tool'?'tool':'span',
  };
  if(durationMs!==undefined)attributes['vaos.ai.duration_ms']=durationMs;
  if(inputTokens!==undefined)attributes['gen_ai.usage.input_tokens']=inputTokens;
  if(outputTokens!==undefined)attributes['gen_ai.usage.output_tokens']=outputTokens;
  if(totalCostUsd!==undefined)attributes['gen_ai.usage.cost']=totalCostUsd;
  if(inputHash)attributes['vaos.ai.input.sha256']=inputHash;
  if(outputHash)attributes['vaos.ai.output.sha256']=outputHash;
  if(errorType)attributes['error.type']=errorType;

  return Object.freeze({
    schemaVersion:'vaos.ai.observation.v1',
    name:'vaos.ai.observation',
    occurredAt:time.toISOString(),
    attributes:Object.freeze(attributes),
  });
}
