const CAPABILITY=/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;
const RISK=new Set(['low','medium','high','critical']);
const DATA_CLASS=new Set(['public','internal','confidential','restricted']);
const RESULT_STATUS=new Set(['SUCCEEDED','FAILED','UNKNOWN','MANUAL_REVIEW','REJECTED']);
function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function req(input,key,prefix='VYNDI_EVENT_INVALID'){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw fail(prefix,`${prefix}:${key}`);return v.trim()}
function date(value,key,prefix='VYNDI_EVENT_INVALID'){const v=req({[key]:value},key,prefix);if(Number.isNaN(new Date(v).getTime()))throw fail(prefix,`${prefix}:${key}`);return new Date(v).toISOString()}
function clone(v){return structuredClone(v)}
function deepFreeze(v){if(!v||typeof v!=='object'||Object.isFrozen(v))return v;for(const c of Object.values(v))deepFreeze(c);return Object.freeze(v)}
function refs(v){if(!Array.isArray(v)||v.some(x=>typeof x!=='string'||!x.trim()))throw fail('VAOS_RESULT_INVALID','VAOS_RESULT_INVALID:evidenceRefs');return [...new Set(v.map(x=>x.trim()))]}
function cloudEvent({eventId,source,occurredAt,type,subject,data}){
  return deepFreeze({
    specversion:'1.0',
    id:req({eventId},'eventId'),
    source:req({source},'source'),
    type,
    subject:req({subject},'subject'),
    time:date(occurredAt,'occurredAt'),
    datacontenttype:'application/json',
    data:clone(data),
  });
}

export function createVyndiIntentEvent(input={}){
  for(const forbidden of ['providerId','providerRunId','providerKey','preferredProviderIds']){
    if(input[forbidden]!==undefined)throw fail('VYNDI_INTENT_PROVIDER_COUPLING_FORBIDDEN');
  }
  const capability=req(input,'capability','VYNDI_INTENT_INVALID');
  if(!CAPABILITY.test(capability))throw fail('VYNDI_INTENT_INVALID','VYNDI_INTENT_INVALID:capability');
  const riskClass=req(input,'riskClass','VYNDI_INTENT_INVALID').toLowerCase();
  if(!RISK.has(riskClass))throw fail('VYNDI_INTENT_INVALID','VYNDI_INTENT_INVALID:riskClass');
  const dataClassification=req(input,'dataClassification','VYNDI_INTENT_INVALID').toLowerCase();
  if(!DATA_CLASS.has(dataClassification))throw fail('VYNDI_INTENT_INVALID','VYNDI_INTENT_INVALID:dataClassification');
  const data={
    contractVersion:'v1',
    missionId:req(input,'missionId','VYNDI_INTENT_INVALID'),
    intentId:req(input,'intentId','VYNDI_INTENT_INVALID'),
    idempotencyKey:req(input,'idempotencyKey','VYNDI_INTENT_INVALID'),
    actionType:req(input,'actionType','VYNDI_INTENT_INVALID'),
    capability,
    riskClass,
    dataClassification,
    authorityRef:req(input,'authorityRef','VYNDI_INTENT_INVALID'),
    approvalRef:typeof input.approvalRef==='string'&&input.approvalRef.trim()?input.approvalRef.trim():null,
    input:input.input&&typeof input.input==='object'&&!Array.isArray(input.input)?clone(input.input):{},
  };
  return cloudEvent({
    eventId:input.eventId,source:input.source,occurredAt:input.occurredAt,
    type:'com.vyndi.vaos.intent.v1',subject:data.intentId,data,
  });
}

export function validateVyndiIntentEvent(event={}){
  if(event.specversion!=='1.0')throw fail('VYNDI_EVENT_INVALID','VYNDI_EVENT_INVALID:specversion');
  if(event.type!=='com.vyndi.vaos.intent.v1')throw fail('VYNDI_EVENT_UNSUPPORTED_TYPE');
  req(event,'id');req(event,'source');date(event.time,'time');
  if(event.datacontenttype!=='application/json')throw fail('VYNDI_EVENT_INVALID','VYNDI_EVENT_INVALID:datacontenttype');
  const d=event.data;
  if(!d||typeof d!=='object'||Array.isArray(d))throw fail('VYNDI_EVENT_INVALID','VYNDI_EVENT_INVALID:data');
  if(d.contractVersion!=='v1')throw fail('VYNDI_EVENT_UNSUPPORTED_VERSION');
  const intentId=req(d,'intentId');
  if(event.subject!==intentId)throw fail('VYNDI_EVENT_INVALID','VYNDI_EVENT_INVALID:subject');
  req(d,'missionId');req(d,'idempotencyKey');req(d,'actionType');req(d,'authorityRef');
  if(typeof d.capability!=='string'||!CAPABILITY.test(d.capability))throw fail('VYNDI_EVENT_INVALID','VYNDI_EVENT_INVALID:capability');
  if(!RISK.has(d.riskClass))throw fail('VYNDI_EVENT_INVALID','VYNDI_EVENT_INVALID:riskClass');
  if(!DATA_CLASS.has(d.dataClassification))throw fail('VYNDI_EVENT_INVALID','VYNDI_EVENT_INVALID:dataClassification');
  if('providerId' in d||'providerRunId' in d||'preferredProviderIds' in d)throw fail('VYNDI_INTENT_PROVIDER_COUPLING_FORBIDDEN');
  return deepFreeze(clone(d));
}

export function createVaosResultEvent(input={}){
  const status=req(input,'status','VAOS_RESULT_INVALID').toUpperCase();
  if(!RESULT_STATUS.has(status))throw fail('VAOS_RESULT_INVALID','VAOS_RESULT_INVALID:status');
  const providerId=typeof input.providerId==='string'&&input.providerId.trim()?input.providerId.trim():null;
  const providerRunId=(typeof input.providerRunId==='string'&&input.providerRunId.trim())||Number.isFinite(input.providerRunId)
    ? String(input.providerRunId).trim():null;
  const data={
    contractVersion:'v1',
    missionId:req(input,'missionId','VAOS_RESULT_INVALID'),
    intentId:req(input,'intentId','VAOS_RESULT_INVALID'),
    executionJobId:req(input,'executionJobId','VAOS_RESULT_INVALID'),
    status,
    providerId,
    providerRunId,
    effectRef:typeof input.effectRef==='string'&&input.effectRef.trim()?input.effectRef.trim():null,
    evidenceRefs:refs(input.evidenceRefs||[]),
    canonicalStateUpdated:false,
  };
  return cloudEvent({
    eventId:input.eventId,source:input.source,occurredAt:input.occurredAt,
    type:'com.vaos.vyndi.result.v1',subject:data.intentId,data,
  });
}
