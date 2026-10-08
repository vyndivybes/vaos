const VALID_STATUS=new Set(['started','succeeded','failed','unknown']);

function invalid(field){
  const error=new Error(`EXECUTION_TELEMETRY_INVALID:${field}`);
  error.code='EXECUTION_TELEMETRY_INVALID';
  error.retryable=false;
  return error;
}
function requiredText(input,key){
  const value=input?.[key];
  if(typeof value!=='string'||!value.trim())throw invalid(key);
  return value.trim();
}
function optionalText(input,key){
  const value=input?.[key];
  return typeof value==='string'&&value.trim()?value.trim():undefined;
}
function optionalBoolean(value,key){
  if(value===undefined)return undefined;
  if(typeof value!=='boolean')throw invalid(key);
  return value;
}
function optionalDuration(value){
  if(value===undefined)return undefined;
  const number=Number(value);
  if(!Number.isFinite(number)||number<0)throw invalid('durationMs');
  return number;
}

export function createExecutionTelemetryEvent(input={}){
  const status=requiredText(input,'status');
  if(!VALID_STATUS.has(status))throw invalid('status');

  const occurredAt=requiredText(input,'occurredAt');
  const timestamp=new Date(occurredAt);
  if(Number.isNaN(timestamp.getTime()))throw invalid('occurredAt');

  const intentId=requiredText(input,'intentId');
  const executionJobId=requiredText(input,'executionJobId');
  const providerId=requiredText(input,'providerId');
  const capability=requiredText(input,'capability');

  const missionId=optionalText(input,'missionId');
  const approvalId=optionalText(input,'approvalId');
  const providerRunId=optionalText(input,'providerRunId');
  const evidenceRef=optionalText(input,'evidenceRef');
  const errorType=optionalText(input,'errorType');
  const retryable=optionalBoolean(input.retryable,'retryable');
  const outcomeUnknown=optionalBoolean(input.outcomeUnknown,'outcomeUnknown');
  const durationMs=optionalDuration(input.durationMs);

  const attributes={
    'vaos.intent.id':intentId,
    'vaos.execution.job.id':executionJobId,
    'vaos.provider.id':providerId,
    'vaos.capability':capability,
    'vaos.execution.status':status,
  };

  if(missionId)attributes['vaos.mission.id']=missionId;
  if(approvalId)attributes['vaos.approval.id']=approvalId;
  if(providerRunId)attributes['vaos.provider.run.id']=providerRunId;
  if(evidenceRef)attributes['vaos.evidence.ref']=evidenceRef;
  if(errorType)attributes['error.type']=errorType;
  if(retryable!==undefined)attributes['vaos.execution.retryable']=retryable;
  if(outcomeUnknown!==undefined)attributes['vaos.execution.outcome_unknown']=outcomeUnknown;
  if(durationMs!==undefined)attributes['vaos.execution.duration_ms']=durationMs;

  return Object.freeze({
    schemaVersion:'vaos.execution.telemetry.v1',
    name:'vaos.integration.execution',
    occurredAt:timestamp.toISOString(),
    attributes:Object.freeze(attributes),
  });
}
