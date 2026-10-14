import { executeQualificationRecovery } from './qualification-recovery.mjs';

/**
 * The existing G9 read-only L5 canary must present its exact dual signed
 * source read. Never turn a generic adapter success into a source-verification
 * receipt. This narrow receipt contains no source records or credentials.
 */
function scopedProductionObservationReceipt(job, result) {
 if(job?.actionType!=='PRODUCTION.OBSERVE_WIP'
    ||job?.payload?.monitoringScope!=='PRODUCTION_L5_READ_ONLY_V1')return null;
 const effect=result?.effect,verification=result?.verification;
 const expectedResourceId='PRODUCTION.OBSERVE_WIP:'+job.id;
 const digest=/^[a-f0-9]{64}$/;
 const valid=typeof job?.id==='string'&&job.id.length>0
    &&typeof job.intentId==='string'&&job.intentId.length>0
    &&result?.adapterId==='vyndi.read-bridge.v1'
    &&effect?.effectType==='VYNDI.DOMAIN_OBSERVED'
    &&effect?.resourceType==='VYNDI_READ_SNAPSHOT'
    &&verification?.resourceType==='VYNDI_READ_SNAPSHOT'
    &&effect?.resourceId===expectedResourceId
    &&verification?.resourceId===expectedResourceId
    &&effect?.state==='OBSERVED'
    &&verification?.expectedState==='OBSERVED'
    &&verification?.verified===true
    &&verification?.actionType===job.actionType
    &&effect?.sourceAuthority==='getProductionJobCards'
    &&verification?.sourceAuthority===effect.sourceAuthority
    &&verification?.evidenceSource==='vyndi:/api/vaos/bridge'
    &&typeof verification?.nonce==='string'&&verification.nonce.length>0
    &&digest.test(verification?.bodySha256||'')
    &&digest.test(verification?.sourceContentSha256||'')
    &&effect?.sourceContentSha256===verification.sourceContentSha256
    &&effect?.independentlyReRead===true
    &&verification?.independentlyReRead===true
    &&Number.isInteger(effect?.observedRows)
    &&effect.observedRows>=0
    &&verification?.observedRows===effect.observedRows;
 if(!valid){
  const error=new Error('PRODUCTION_OBSERVATION_VERIFICATION_UNBOUND');
  error.code='PRODUCTION_OBSERVATION_VERIFICATION_UNBOUND';
  error.retryable=false;
  throw error;
 }
 return Object.freeze({
  schemaVersion:'VAOS_L5_SCOPED_OBSERVATION_RECEIPT_V1',
  jobId:job.id,intentId:job.intentId,actionType:job.actionType,
  adapterId:result.adapterId,sourceAuthority:verification.sourceAuthority,
  sourceContentSha256:verification.sourceContentSha256,
  independentlyReRead:true,observedRows:verification.observedRows,
  verified:true,businessWrites:false,
 });
}


function errorEnvelope(error, code = 'ADAPTER_EXECUTION_FAILED', retryable = true) {
  const resolvedCode = typeof error?.code === 'string' && error.code ? error.code : code;
  const resolvedRetryable = typeof error?.retryable === 'boolean' ? error.retryable : retryable;
  const envelope = {
    code: resolvedCode,
    retryable: resolvedRetryable,
  };
  if (typeof error?.outcomeUnknown === 'boolean') envelope.outcomeUnknown = error.outcomeUnknown;
  if (
    (typeof error?.providerRunId === 'string' && error.providerRunId.trim())
    || Number.isFinite(error?.providerRunId)
  ) {
    envelope.providerRunId = String(error.providerRunId);
  }
  return envelope;
}

export function createExecutionEngine({
  store,
  registry,
  workerId = 'vaos-execution-worker',
} = {}) {
  if (!store) throw new Error('EXECUTION_STORE_REQUIRED');
  if (!registry) throw new Error('EXECUTION_REGISTRY_REQUIRED');

  async function processOne(claimer = () => store.claimExecution({ workerId })) {
    const job = await claimer();
    if (!job) return { status: 'EMPTY' };

    const adapter = registry.get(job.actionType);
    if (!adapter) {
      const failed = await store.failExecution(job, {
        code: 'EXECUTION_ADAPTER_NOT_FOUND',
        retryable: false,
      });
      return { status: failed?.outcome || 'DEAD_LETTER', jobId: job.id };
    }

    try {
      const result = await adapter.execute(job);
      if (result?.verification?.verified !== true) {
        const failed = await store.failExecution(job, {
          code: 'EXECUTION_VERIFICATION_FAILED',
          retryable: false,
        });
        return { status: failed?.outcome || 'DEAD_LETTER', jobId: job.id };
      }

      const scopedReceipt=scopedProductionObservationReceipt(job,result);
      const completed = await store.completeExecution(job, result);
      // An unknown/failed durable write is not a successful L5 canary.
      const recordedStatus=completed?.outcome||'UNKNOWN';
      return { status: recordedStatus, jobId: job.id, adapterId: result.adapterId,
        ...(scopedReceipt&&['SUCCEEDED','REPLAY'].includes(recordedStatus)
          &&completed?.jobId===job.id?{observationReceipt:scopedReceipt}:{}) };
    } catch (error) {
      const envelope = errorEnvelope(error);
      const failed = await store.failExecution(job, envelope);
      if (
        envelope.code === 'QUALIFICATION_RECOVERY_DRILL_RETRY'
        && failed?.outcome === 'RETRY_SCHEDULED'
        && Number(job.attemptCount) === 1
      ) {
        const recovered = await executeQualificationRecovery({ store, registry, workerId, failedJob: job });
        if (recovered) return recovered;
      }
      return { status: failed?.outcome || 'RETRY_SCHEDULED', jobId: job.id };
    }
  }

  async function drain({ limit = 5 } = {}) {
    const bounded = Math.max(1, Math.min(10, Number(limit) || 5));
    const outcomes = [];
    for (let index = 0; index < bounded; index += 1) {
      const outcome = await processOne();
      if (outcome.status === 'EMPTY') break;
      outcomes.push(outcome);
    }
    return {
      processed: outcomes.length,
      succeeded: outcomes.filter((item) => ['SUCCEEDED', 'REPLAY'].includes(item.status)).length,
      retryScheduled: outcomes.filter((item) => item.status === 'RETRY_SCHEDULED').length,
      deadLettered: outcomes.filter((item) => item.status === 'DEAD_LETTER').length,
      remainingCapacity: bounded - outcomes.length,
      outcomes,
    };
  }

  async function processProductionObservation({idempotencyKey} = {}) {
    if(typeof idempotencyKey !== 'string' ||
       !/^vaos-production-l5:[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:00:00[.]000Z$/.test(idempotencyKey))
      throw new Error('PRODUCTION_OBSERVATION_KEY_INVALID');
    if(typeof store.claimProductionObservation!=='function')
      throw new Error('PRODUCTION_OBSERVATION_SCOPED_STORE_REQUIRED');
    const result=await processOne(async()=>{
      const job=await store.claimProductionObservation({workerId:'vaos-production-l5-cron',idempotencyKey});
      if(job && (job.actionType!=='PRODUCTION.OBSERVE_WIP' || job.payload?.monitoringScope!=='PRODUCTION_L5_READ_ONLY_V1'))
        throw new Error('PRODUCTION_OBSERVATION_CLAIM_MISMATCH');
      return job;
    });
    return result.observationReceipt
      ? {...result,observationReceipt:{...result.observationReceipt,idempotencyKey}}
      : result;
  }

  return Object.freeze({ processOne, drain, processProductionObservation });
}
