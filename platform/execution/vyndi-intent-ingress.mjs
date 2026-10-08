import { validateVyndiIntentEvent } from '../../packages/contracts/vyndi-vaos-events.mjs';

function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function req(input,key,code){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw fail(code||'VYNDI_INGRESS_INVALID',`${code||'VYNDI_INGRESS_INVALID'}:${key}`);return v.trim()}
function clone(v){return structuredClone(v)}
function safeReason(error){return typeof error?.code==='string'&&error.code?error.code:'VYNDI_EVENT_INVALID'}
function identity(data){return [data.intentId,data.missionId,data.actionType,data.capability].join('|')}
function nowIso(now){const d=now();if(!(d instanceof Date)||Number.isNaN(d.getTime()))throw fail('VYNDI_INGRESS_CLOCK_INVALID');return d.toISOString()}

export function createInMemoryVyndiIngressStore(){
  const acceptedByIdempotency=new Map();
  const quarantine=new Map();
  return Object.freeze({
    accept({event,data}){
      const key=data.idempotencyKey;
      const existing=acceptedByIdempotency.get(key);
      if(existing){
        if(existing.identity!==identity(data))return {outcome:'CONFLICT',existing:clone(existing)};
        return {outcome:'REPLAY',record:clone(existing)};
      }
      const record={identity:identity(data),eventId:event.id,data:clone(data),acceptedAt:event.time};
      acceptedByIdempotency.set(key,record);
      return {outcome:'CREATED',record:clone(record)};
    },
    putQuarantine(record){
      if(quarantine.has(record.quarantineId))throw fail('VYNDI_QUARANTINE_DUPLICATE');
      quarantine.set(record.quarantineId,clone(record));
      return clone(record);
    },
    getQuarantine(id){const row=quarantine.get(id);return row?clone(row):null},
    markReplayed(id,patch){
      const row=quarantine.get(id);if(!row)throw fail('VYNDI_QUARANTINE_NOT_FOUND');
      const next={...row,replayed:true,...clone(patch)};quarantine.set(id,next);return clone(next);
    },
    listAccepted(){return [...acceptedByIdempotency.values()].map(clone)},
    listQuarantine(){return [...quarantine.values()].map(clone)},
  });
}

export function createVyndiIntentIngress({
  store,
  recordAudit=async()=>{},
  now=()=>new Date(),
  idFactory=()=>globalThis.crypto?.randomUUID?.()||`q-${Date.now()}`,
}={}){
  if(!store||typeof store.accept!=='function'||typeof store.putQuarantine!=='function'||typeof store.getQuarantine!=='function'||typeof store.markReplayed!=='function')throw fail('VYNDI_INGRESS_STORE_REQUIRED');
  if(typeof recordAudit!=='function'||typeof now!=='function'||typeof idFactory!=='function')throw fail('VYNDI_INGRESS_CONFIG_INVALID');

  async function quarantineEvent(event,reasonCode){
    const quarantineId=idFactory();
    const createdAt=nowIso(now);
    store.putQuarantine({
      quarantineId,
      eventId:typeof event?.id==='string'?event.id:null,
      reasonCode,
      event:clone(event),
      replayed:false,
      createdAt,
    });
    await recordAudit({type:'VYNDI.INTENT.QUARANTINED',quarantineId,eventId:typeof event?.id==='string'?event.id:null,reasonCode,occurredAt:createdAt});
    return {status:'QUARANTINED',quarantineId,reasonCode};
  }

  async function receive(event){
    let data;
    try{data=validateVyndiIntentEvent(event)}
    catch(error){return quarantineEvent(event,safeReason(error))}
    const result=store.accept({event,data});
    if(result.outcome==='CONFLICT')return quarantineEvent(event,'VYNDI_IDEMPOTENCY_CONFLICT');
    const status=result.outcome==='REPLAY'?'REPLAY':'ACCEPTED';
    await recordAudit({
      type:'VYNDI.INTENT.'+status,
      eventId:event.id,
      intentId:data.intentId,
      missionId:data.missionId,
      idempotencyKey:data.idempotencyKey,
      occurredAt:nowIso(now),
    });
    return Object.freeze({status,intentId:data.intentId,missionId:data.missionId,idempotencyKey:data.idempotencyKey,data});
  }

  async function replay({quarantineId,correctedEvent,authorityRef,reason}={}){
    quarantineId=req({quarantineId},'quarantineId','VYNDI_REPLAY_INVALID');
    authorityRef=req({authorityRef},'authorityRef','VYNDI_REPLAY_AUTHORITY_REQUIRED');
    reason=req({reason},'reason','VYNDI_REPLAY_REASON_REQUIRED');
    const row=store.getQuarantine(quarantineId);
    if(!row)throw fail('VYNDI_QUARANTINE_NOT_FOUND');
    if(row.replayed)throw fail('VYNDI_QUARANTINE_ALREADY_REPLAYED');

    try{validateVyndiIntentEvent(correctedEvent)}
    catch{throw fail('VYNDI_REPLAY_EVENT_INVALID')}

    const result=await receive(correctedEvent);
    if(result.status==='QUARANTINED')throw fail('VYNDI_REPLAY_EVENT_INVALID');
    store.markReplayed(quarantineId,{
      replayedAt:nowIso(now),
      replayAuthorityRef:authorityRef,
      replayReason:reason,
      replayEventId:correctedEvent.id,
    });
    await recordAudit({
      type:'VYNDI.INTENT.REPLAYED',
      quarantineId,
      originalEventId:row.eventId,
      replayEventId:correctedEvent.id,
      authorityRef,
      reason,
      occurredAt:nowIso(now),
    });
    return result;
  }

  return Object.freeze({receive,replay});
}
