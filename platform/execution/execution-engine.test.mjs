import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecutionEngine } from './execution-engine.mjs';

function makeStore(jobs = []) {
  const queue = [...jobs];
  const completed = [];
  const failed = [];
  return {
    completed, failed,
    async claimExecution() { return queue.shift() || null; },
    async completeExecution(job, result) {
      completed.push({ job, result });
      return { outcome: 'SUCCEEDED', jobId: job.id };
    },
    async failExecution(job, error) {
      failed.push({ job, error });
      return { outcome: 'RETRY_SCHEDULED', jobId: job.id };
    },
  };
}

function makeRegistry(adapter) {
  return {
    get(type) { return type === 'QA.OPEN_CAPA' ? adapter : null; },
  };
}

test('engine claims, executes, verifies and completes one durable job', async () => {
  const store = makeStore([{
    id: 'job-1',
    intentId: 'intent-1',
    actionType: 'QA.OPEN_CAPA',
    payload: { capaId: 'CAPA-024' },
    leaseToken: 'lease-1',
  }]);
  const registry = makeRegistry({
    async execute() {
      return {
        adapterId: 'qa.v1',
        effect: { resourceId: 'CAPA-024' },
        verification: { verified: true, resourceId: 'CAPA-024' },
      };
    },
  });
  const engine = createExecutionEngine({ store, registry });
  const result = await engine.processOne();

  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(store.completed.length, 1);
  assert.equal(store.failed.length, 0);
  assert.equal(store.completed[0].result.verification.verified, true);
});

test('engine records retryable failure without losing the leased job', async () => {
  const store = makeStore([{
    id: 'job-2',
    intentId: 'intent-2',
    actionType: 'QA.OPEN_CAPA',
    payload: { capaId: 'CAPA-025' },
    leaseToken: 'lease-2',
  }]);
  const registry = makeRegistry({
    async execute() { throw new Error('DEPENDENCY_TIMEOUT'); },
  });
  const engine = createExecutionEngine({ store, registry });
  const result = await engine.processOne();

  assert.equal(result.status, 'RETRY_SCHEDULED');
  assert.equal(store.completed.length, 0);
  assert.equal(store.failed.length, 1);
  assert.equal(store.failed[0].error.code, 'ADAPTER_EXECUTION_FAILED');
});

test('engine dead-letters unsupported action rather than executing an unknown effect', async () => {
  const store = makeStore([{
    id: 'job-3',
    intentId: 'intent-3',
    actionType: 'UNKNOWN.ACTION',
    payload: {},
    leaseToken: 'lease-3',
  }]);
  store.failExecution = async (job, error) => {
    store.failed.push({ job, error });
    return { outcome: 'DEAD_LETTER', jobId: job.id };
  };
  const engine = createExecutionEngine({ store, registry: makeRegistry(null) });
  const result = await engine.processOne();

  assert.equal(result.status, 'DEAD_LETTER');
  assert.equal(store.failed[0].error.code, 'EXECUTION_ADAPTER_NOT_FOUND');
});

test('drain stops cleanly when queue becomes empty', async () => {
  const store = makeStore([{
    id: 'job-4',
    intentId: 'intent-4',
    actionType: 'QA.OPEN_CAPA',
    payload: { capaId: 'CAPA-026' },
    leaseToken: 'lease-4',
  }]);
  const engine = createExecutionEngine({
    store,
    registry: makeRegistry({
      async execute() {
        return { adapterId: 'qa.v1', effect: {}, verification: { verified: true } };
      },
    }),
  });

  const result = await engine.drain({ limit: 5 });
  assert.equal(result.processed, 1);
  assert.equal(result.succeeded, 1);
  assert.equal(result.remainingCapacity, 4);
});


test('engine preserves terminal adapter classification so invalid lifecycle transitions dead-letter immediately', async () => {
  const store = makeStore([{
    id: 'job-workforce-1',
    intentId: 'intent-workforce-1',
    actionType: 'QA.OPEN_CAPA',
    payload: {},
    leaseToken: 'lease-workforce-1',
  }]);
  store.failExecution = async (job, error) => {
    store.failed.push({ job, error });
    return { outcome: error.retryable === false ? 'DEAD_LETTER' : 'RETRY_SCHEDULED', jobId: job.id };
  };
  const terminal = new Error('Invalid lifecycle transition');
  terminal.code = 'WORKFORCE_INVALID_TRANSITION';
  terminal.retryable = false;

  const engine = createExecutionEngine({
    store,
    registry: makeRegistry({ async execute() { throw terminal; } }),
  });
  const result = await engine.processOne();

  assert.equal(result.status, 'DEAD_LETTER');
  assert.equal(store.failed[0].error.code, 'WORKFORCE_INVALID_TRANSITION');
  assert.equal(store.failed[0].error.retryable, false);
});

test('engine deterministically re-leases an approved qualification recovery job and completes attempt two', async () => {
  const first = {
    id: 'job-risk-q3',
    intentId: 'intent-risk-q3',
    actionType: 'PROJECT.ESCALATE_RISK',
    payload: { riskId: 'RSK-015', qualificationMode: true, qualificationRecoveryDrill: true },
    attemptCount: 1,
    leaseToken: 'lease-1',
  };
  const second = { ...first, attemptCount: 2, leaseToken: 'lease-2' };
  const store = makeStore([first]);
  store.claimQualificationRecovery = async (job, { workerId }) => {
    assert.equal(job.id, first.id);
    assert.equal(workerId, 'vaos-execution-worker');
    return second;
  };
  const registry = {
    get(actionType) {
      if (actionType !== 'PROJECT.ESCALATE_RISK') return null;
      return {
        async execute(job) {
          if (job.attemptCount === 1) {
            const error = new Error('QUALIFICATION_RECOVERY_DRILL_RETRY');
            error.code = 'QUALIFICATION_RECOVERY_DRILL_RETRY';
            error.retryable = true;
            throw error;
          }
          return {
            adapterId: 'supabase.project-risk.v1',
            effect: { resourceId: 'RSK-015' },
            verification: { verified: true, resourceId: 'RSK-015' },
          };
        },
      };
    },
  };

  const engine = createExecutionEngine({ store, registry });
  const result = await engine.processOne();

  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(store.failed.length, 1);
  assert.equal(store.completed.length, 1);
  assert.equal(store.completed[0].job.attemptCount, 2);
});

test('engine persists only sanitized machine-readable provider failure metadata', async () => {
  const store = makeStore([{
    id: 'job-secret-1',
    intentId: 'intent-secret-1',
    actionType: 'QA.OPEN_CAPA',
    payload: {},
    leaseToken: 'lease-secret-1',
  }]);
  const providerError = new Error('Bearer super-secret at https://provider.example/private');
  providerError.code = 'PROVIDER_OUTCOME_UNKNOWN';
  providerError.retryable = false;
  providerError.outcomeUnknown = true;
  providerError.providerRunId = 'run-77';

  const engine = createExecutionEngine({
    store,
    registry: makeRegistry({ async execute() { throw providerError; } }),
  });
  await engine.processOne();

  const saved = store.failed[0].error;
  assert.deepEqual(saved, {
    code: 'PROVIDER_OUTCOME_UNKNOWN',
    retryable: false,
    outcomeUnknown: true,
    providerRunId: 'run-77',
  });
  assert.equal(JSON.stringify(saved).includes('super-secret'), false);
  assert.equal(JSON.stringify(saved).includes('provider.example'), false);
});


function scopedL5Job(){
 return {id:'l5-job-1',intentId:'l5-intent-1',actionType:'PRODUCTION.OBSERVE_WIP',
  leaseToken:'scoped-lease',payload:{monitoringScope:'PRODUCTION_L5_READ_ONLY_V1',missionId:'VAOS-CARBON-FRAME-S-20261010'}};
}
function signedL5Observation(job){
 const resourceId=job.actionType+':'+job.id;
 const shared={sourceContentSha256:'f'.repeat(64),independentlyReRead:true,observedRows:0};
 return {adapterId:'vyndi.read-bridge.v1',
  effect:{effectType:'VYNDI.DOMAIN_OBSERVED',resourceType:'VYNDI_READ_SNAPSHOT',resourceId,
   state:'OBSERVED',sourceAuthority:'getProductionJobCards',...shared},
  verification:{verified:true,resourceType:'VYNDI_READ_SNAPSHOT',resourceId,expectedState:'OBSERVED',
   actionType:job.actionType,sourceAuthority:'getProductionJobCards',
   evidenceSource:'vyndi:/api/vaos/bridge',nonce:'fresh-local-nonce',bodySha256:'e'.repeat(64),...shared}};
}
test('G9: exact scoped L5 engine returns a bounded source receipt only after completed durable readback',async()=>{
 const job=scopedL5Job(),store=makeStore();
 store.claimProductionObservation=async ({idempotencyKey})=>{
  assert.equal(idempotencyKey,'vaos-production-l5:2026-10-15T08:00:00.000Z');
  return job;
 };
 const registry={get:action=>action===job.actionType?{
  execute:async claimed=>signedL5Observation(claimed)
 }:null};
 const engine=createExecutionEngine({store,registry});
 const result=await engine.processProductionObservation({idempotencyKey:'vaos-production-l5:2026-10-15T08:00:00.000Z'});
 assert.equal(result.status,'SUCCEEDED');
 assert.equal(result.jobId,job.id);
 assert.deepEqual(result.observationReceipt,{
  schemaVersion:'VAOS_L5_SCOPED_OBSERVATION_RECEIPT_V1',
  idempotencyKey:'vaos-production-l5:2026-10-15T08:00:00.000Z',
  jobId:job.id,intentId:job.intentId,actionType:job.actionType,
  adapterId:'vyndi.read-bridge.v1',sourceAuthority:'getProductionJobCards',
  sourceContentSha256:'f'.repeat(64),independentlyReRead:true,observedRows:0,
  verified:true,businessWrites:false,
 });
 assert.equal(store.completed.length,1);
 assert.equal(store.failed.length,0);
});

test('G9: altered scoped readback prevents durable completion despite verified true',async()=>{
 const variants=[
  observation=>{delete observation.verification.sourceContentSha256;},
  observation=>{observation.verification.sourceContentSha256='0'.repeat(64);},
  observation=>{observation.verification.resourceId='PRODUCTION.OBSERVE_WIP:other';},
  observation=>{observation.verification.evidenceSource='client-upload';},
  observation=>{observation.effect.sourceAuthority='invented';},
  observation=>{observation.verification.independentlyReRead=false;},
  observation=>{observation.effect.observedRows=4;},
  observation=>{observation.verification.nonce='';},
 ];
 for(const alter of variants){
  const job=scopedL5Job(),store=makeStore();
  store.claimProductionObservation=async()=>job;
  store.failExecution=async(job,error)=>{store.failed.push({job,error});return {outcome:'DEAD_LETTER'};};
  const engine=createExecutionEngine({store,registry:{get:()=>({
   execute:async()=>{const observation=signedL5Observation(job);alter(observation);return observation;}
  })}});
  const result=await engine.processProductionObservation({idempotencyKey:'vaos-production-l5:2026-10-15T08:00:00.000Z'});
  assert.equal(result.status,'DEAD_LETTER');
  assert.equal(store.completed.length,0);
  assert.equal(store.failed[0].error.code,'PRODUCTION_OBSERVATION_VERIFICATION_UNBOUND');
  assert.equal(store.failed[0].error.retryable,false);
  assert.equal(result.observationReceipt,undefined);
 }
});

test('G9: a database completion conflict cannot return a successful scoped receipt',async()=>{
 const job=scopedL5Job(),store=makeStore();
 store.claimProductionObservation=async()=>job;
 store.completeExecution=async()=>({outcome:'CONFLICT',jobId:job.id});
 const engine=createExecutionEngine({store,registry:{get:()=>({
  execute:async()=>signedL5Observation(job)
 })}});
 const result=await engine.processProductionObservation({idempotencyKey:'vaos-production-l5:2026-10-15T08:00:00.000Z'});
 assert.equal(result.status,'CONFLICT');
 assert.equal(result.observationReceipt,undefined);
});
