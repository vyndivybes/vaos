function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function requiredText(input,key){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw fail('RECONCILIATION_INVALID',`RECONCILIATION_INVALID:${key}`);return v.trim()}
function clone(v){return structuredClone(v)}
function refs(value){if(value===undefined)return[];if(!Array.isArray(value)||value.some(v=>typeof v!=='string'||!v.trim()))throw fail('RECONCILIATION_INVALID','RECONCILIATION_INVALID:evidenceRefs');return [...new Set(value.map(v=>v.trim()))]}
function identity(record){return [record.providerId,record.capability,record.executionJobId,record.intentId,record.providerRunId||''].join('|')}
function nowDate(fn){const d=fn();if(!(d instanceof Date)||Number.isNaN(d.getTime()))throw fail('RECONCILIATION_CLOCK_INVALID');return d}

export function createInMemoryReconciliationStore(){
  const rows=new Map();
  return Object.freeze({
    async enqueue(record){
      const existing=rows.get(record.reconciliationId);
      if(existing){
        if(existing.identity!==record.identity)throw fail('RECONCILIATION_IDEMPOTENCY_CONFLICT');
        return {outcome:'REPLAY',record:clone(existing)};
      }
      rows.set(record.reconciliationId,clone(record));
      return {outcome:'CREATED',record:clone(record)};
    },
    claim({now,includeNotDue=false}={}){
      const nowMs=new Date(now).getTime();
      const row=[...rows.values()]
        .filter(r=>r.state==='PENDING')
        .filter(r=>includeNotDue||!r.nextAttemptAt||new Date(r.nextAttemptAt).getTime()<=nowMs)
        .sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0];
      return row?clone(row):null;
    },
    save(id,patch){
      const current=rows.get(id);if(!current)throw fail('RECONCILIATION_NOT_FOUND');
      const next={...current,...clone(patch)};
      rows.set(id,next);
      return clone(next);
    },
    get(id){const row=rows.get(id);return row?clone(row):null},
    list(){return [...rows.values()].map(clone)},
  });
}

export function createReconciliationService({
  store,
  resolvers={},
  recordAudit=async()=>{},
  now=()=>new Date(),
  maxAttempts=5,
}={}){
  if(!store||typeof store.enqueue!=='function'||typeof store.claim!=='function'||typeof store.save!=='function')throw fail('RECONCILIATION_STORE_REQUIRED');
  if(!resolvers||typeof resolvers!=='object'||Array.isArray(resolvers))throw fail('RECONCILIATION_RESOLVERS_INVALID');
  if(typeof recordAudit!=='function')throw fail('RECONCILIATION_AUDIT_INVALID');
  if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>100)throw fail('RECONCILIATION_MAX_ATTEMPTS_INVALID');

  async function enqueue(input){
    const reconciliationId=requiredText(input,'reconciliationId');
    const providerId=requiredText(input,'providerId');
    const capability=requiredText(input,'capability');
    const executionJobId=requiredText(input,'executionJobId');
    const intentId=requiredText(input,'intentId');
    const providerRunId=typeof input?.providerRunId==='string'&&input.providerRunId.trim()?input.providerRunId.trim():null;
    const reasonCode=requiredText(input,'reasonCode');
    const evidenceRefs=refs(input?.evidenceRefs);
    const ts=nowDate(now).toISOString();
    const record={
      reconciliationId,providerId,capability,executionJobId,intentId,providerRunId,reasonCode,evidenceRefs,
      state:'PENDING',attempts:0,nextAttemptAt:ts,createdAt:ts,updatedAt:ts,errorType:null,
    };
    record.identity=identity(record);
    const result=await store.enqueue(record);
    await recordAudit({type:'RECONCILIATION.ENQUEUED',reconciliationId,providerId,executionJobId,intentId,outcome:result.outcome,occurredAt:ts});
    return {outcome:result.outcome,reconciliationId};
  }

  async function reconcileOne({includeNotDue=false}={}){
    const clock=nowDate(now);
    const row=await store.claim({now:clock.toISOString(),includeNotDue});
    if(!row)return {status:'EMPTY'};

    const resolver=resolvers[row.providerId];
    if(typeof resolver!=='function'){
      const saved=await store.save(row.reconciliationId,{state:'MANUAL_REVIEW',attempts:row.attempts,updatedAt:clock.toISOString(),errorType:'RECONCILIATION_RESOLVER_NOT_AVAILABLE'});
      await recordAudit({type:'RECONCILIATION.MANUAL_REVIEW',reconciliationId:row.reconciliationId,reason:'RECONCILIATION_RESOLVER_NOT_AVAILABLE',occurredAt:clock.toISOString()});
      return {status:'MANUAL_REVIEW',reconciliationId:saved.reconciliationId};
    }

    const attempts=row.attempts+1;
    let outcome;
    try{
      outcome=await resolver(Object.freeze({
        reconciliationId:row.reconciliationId,
        providerId:row.providerId,
        capability:row.capability,
        executionJobId:row.executionJobId,
        intentId:row.intentId,
        providerRunId:row.providerRunId,
        evidenceRefs:row.evidenceRefs.slice(),
        reasonCode:row.reasonCode,
        attempts,
      }));
    }catch{
      outcome={status:'pending',retryAfterSeconds:60,errorType:'RECONCILIATION_RESOLVER_UNAVAILABLE'};
    }

    const status=typeof outcome?.status==='string'?outcome.status.toLowerCase():'';
    const evidenceRefs=[...new Set([...row.evidenceRefs,...refs(outcome?.evidenceRefs)])];
    const base={attempts,evidenceRefs,updatedAt:clock.toISOString()};

    if(status==='succeeded'&&outcome?.verification?.verified===true){
      await store.save(row.reconciliationId,{...base,state:'SUCCEEDED',nextAttemptAt:null,errorType:null});
      await recordAudit({type:'RECONCILIATION.RESOLVED',reconciliationId:row.reconciliationId,state:'SUCCEEDED',occurredAt:clock.toISOString()});
      return {status:'SUCCEEDED',reconciliationId:row.reconciliationId};
    }

    if(status==='failed'){
      const errorType=typeof outcome?.errorType==='string'&&outcome.errorType.trim()?outcome.errorType.trim():'PROVIDER_RECONCILED_FAILED';
      await store.save(row.reconciliationId,{...base,state:'FAILED',nextAttemptAt:null,errorType});
      await recordAudit({type:'RECONCILIATION.RESOLVED',reconciliationId:row.reconciliationId,state:'FAILED',errorType,occurredAt:clock.toISOString()});
      return {status:'FAILED',reconciliationId:row.reconciliationId};
    }

    if(status==='manual_review'){
      await store.save(row.reconciliationId,{...base,state:'MANUAL_REVIEW',nextAttemptAt:null,errorType:outcome?.errorType||'MANUAL_REVIEW_REQUIRED'});
      return {status:'MANUAL_REVIEW',reconciliationId:row.reconciliationId};
    }

    if(attempts>=maxAttempts){
      await store.save(row.reconciliationId,{...base,state:'MANUAL_REVIEW',nextAttemptAt:null,errorType:outcome?.errorType||'RECONCILIATION_ATTEMPTS_EXHAUSTED'});
      await recordAudit({type:'RECONCILIATION.MANUAL_REVIEW',reconciliationId:row.reconciliationId,reason:'ATTEMPTS_EXHAUSTED',occurredAt:clock.toISOString()});
      return {status:'MANUAL_REVIEW',reconciliationId:row.reconciliationId};
    }

    const retrySeconds=Number.isFinite(Number(outcome?.retryAfterSeconds))&&Number(outcome.retryAfterSeconds)>=0?Number(outcome.retryAfterSeconds):60;
    const nextAttemptAt=new Date(clock.getTime()+retrySeconds*1000).toISOString();
    await store.save(row.reconciliationId,{...base,state:'PENDING',nextAttemptAt,errorType:typeof outcome?.errorType==='string'?outcome.errorType:null});
    await recordAudit({type:'RECONCILIATION.DEFERRED',reconciliationId:row.reconciliationId,nextAttemptAt,attempts,occurredAt:clock.toISOString()});
    return {status:'DEFERRED',reconciliationId:row.reconciliationId,nextAttemptAt};
  }

  return Object.freeze({enqueue,reconcileOne});
}
