import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryReconciliationStore, createReconciliationService } from './reconciliation-service.mjs';

function unknown(overrides={}) {
  return {
    reconciliationId:'recon-1',
    providerId:'zapier',
    capability:'integration.saas',
    executionJobId:'job-1',
    intentId:'intent-1',
    providerRunId:'run-1',
    evidenceRefs:['evidence:dispatch'],
    reasonCode:'ZAPIER_OUTCOME_UNKNOWN',
    ...overrides,
  };
}

test('unknown execution reconciles to succeeded without redispatching the provider', async()=>{
  const store=createInMemoryReconciliationStore();
  let resolverCalls=0;
  const svc=createReconciliationService({
    store,
    resolvers:{
      zapier: async record=>{
        resolverCalls+=1;
        assert.equal(record.providerRunId,'run-1');
        return {status:'succeeded',evidenceRefs:['evidence:callback'],verification:{verified:true,providerId:'zapier',capability:'integration.saas',executionJobId:'job-1',intentId:'intent-1',providerRunId:'run-1',evidenceSource:'PROVIDER_RUN_READBACK',evidenceRef:'evidence:callback'}};
      },
    },
    now:()=>new Date('2026-10-08T00:00:00.000Z'),
  });

  await svc.enqueue(unknown());
  const result=await svc.reconcileOne();

  assert.equal(result.status,'SUCCEEDED');
  assert.equal(resolverCalls,1);
  const row=store.get('recon-1');
  assert.equal(row.state,'SUCCEEDED');
  assert.deepEqual(row.evidenceRefs,['evidence:dispatch','evidence:callback']);
});

test('pending provider readback is deferred and preserves provider run identity', async()=>{
  const store=createInMemoryReconciliationStore();
  const svc=createReconciliationService({
    store,
    resolvers:{
      zapier: async()=>({status:'pending',retryAfterSeconds:60,evidenceRefs:[]}),
    },
    now:()=>new Date('2026-10-08T00:00:00.000Z'),
  });
  await svc.enqueue(unknown());
  const result=await svc.reconcileOne();

  assert.equal(result.status,'DEFERRED');
  const row=store.get('recon-1');
  assert.equal(row.state,'PENDING');
  assert.equal(row.providerRunId,'run-1');
  assert.equal(row.nextAttemptAt,'2026-10-08T00:01:00.000Z');
});

test('terminal provider failure resolves to FAILED with safe machine-readable evidence only', async()=>{
  const store=createInMemoryReconciliationStore();
  const svc=createReconciliationService({
    store,
    resolvers:{
      zapier: async()=>({
        status:'failed',
        errorType:'DESTINATION_REJECTED',
        errorMessage:'Bearer secret-do-not-store',
        evidenceRefs:['evidence:failure'],
        verification:{verified:true,providerId:'zapier',capability:'integration.saas',executionJobId:'job-1',intentId:'intent-1',providerRunId:'run-1',evidenceSource:'PROVIDER_RUN_READBACK',evidenceRef:'evidence:failure'},
      }),
    },
  });
  await svc.enqueue(unknown());
  await svc.reconcileOne();
  const row=store.get('recon-1');

  assert.equal(row.state,'FAILED');
  assert.equal(row.errorType,'DESTINATION_REJECTED');
  assert.equal(JSON.stringify(row).includes('secret-do-not-store'),false);
});

test('missing resolver routes to manual review instead of guessing success or failure', async()=>{
  const store=createInMemoryReconciliationStore();
  const svc=createReconciliationService({store,resolvers:{}});
  await svc.enqueue(unknown({providerId:'unknown-provider'}));
  const result=await svc.reconcileOne();
  assert.equal(result.status,'MANUAL_REVIEW');
  assert.equal(store.get('recon-1').state,'MANUAL_REVIEW');
});

test('attempt ceiling routes unresolved work to manual review', async()=>{
  const store=createInMemoryReconciliationStore();
  const svc=createReconciliationService({
    store,
    maxAttempts:2,
    resolvers:{zapier:async()=>({status:'pending',retryAfterSeconds:0})},
  });
  await svc.enqueue(unknown());
  await svc.reconcileOne();
  await svc.reconcileOne({includeNotDue:true});
  const row=store.get('recon-1');
  assert.equal(row.state,'MANUAL_REVIEW');
  assert.equal(row.attempts,2);
});

test('duplicate reconciliation IDs are idempotent only when the immutable identity matches', async()=>{
  const store=createInMemoryReconciliationStore();
  const svc=createReconciliationService({store,resolvers:{}});
  const first=await svc.enqueue(unknown());
  const replay=await svc.enqueue(unknown());
  assert.equal(first.outcome,'CREATED');
  assert.equal(replay.outcome,'REPLAY');

  await assert.rejects(
    ()=>svc.enqueue(unknown({providerRunId:'different-run'})),
    /RECONCILIATION_IDEMPOTENCY_CONFLICT/,
  );
});

test('malformed unknown records fail before persistence', async()=>{
  const store=createInMemoryReconciliationStore();
  const svc=createReconciliationService({store,resolvers:{}});
  await assert.rejects(()=>svc.enqueue(unknown({executionJobId:''})),/RECONCILIATION_INVALID:executionJobId/);
  assert.equal(store.list().length,0);
});


test('reconciliation store claims are leased so concurrent workers cannot claim the same record', async()=>{
  const store=createInMemoryReconciliationStore();
  const now='2026-10-08T00:00:00.000Z';
  const svc=createReconciliationService({
    store,
    resolvers:{},
    now:()=>new Date(now),
  });
  await svc.enqueue(unknown());
  const [a,b]=await Promise.all([
    store.claim({now,workerId:'worker-a',leaseSeconds:120}),
    store.claim({now,workerId:'worker-b',leaseSeconds:120}),
  ]);
  assert.equal([a,b].filter(Boolean).length,1);
  const claimed=a||b;
  assert.equal(claimed.state,'LEASED');
  assert.match(claimed.leaseToken,/^lease:/);
  assert.equal(['worker-a','worker-b'].includes(claimed.leasedBy),true);
});


test('G8: a success flag without run-bound identity must never reconcile an unknown effect as succeeded',async()=>{
 const store=createInMemoryReconciliationStore(),audits=[];
 const svc=createReconciliationService({store,recordAudit:async e=>audits.push(e),
  resolvers:{zapier:async()=>({status:'succeeded',evidenceRefs:['evidence:unbound'],
   verification:{verified:true}})}});
 await svc.enqueue(unknown());
 const result=await svc.reconcileOne();
 assert.equal(result.status,'MANUAL_REVIEW');
 const saved=store.get('recon-1');
 assert.equal(saved.state,'MANUAL_REVIEW');
 assert.equal(saved.errorType,'RECONCILIATION_EVIDENCE_UNBOUND');
 assert.deepEqual(saved.evidenceRefs,['evidence:dispatch'],'forged readback evidence must not be stored');
 assert.equal(audits.some(e=>e.type==='RECONCILIATION.RESOLVED'&&e.state==='SUCCEEDED'),false);
});

test('G8: a different provider run, job or intent cannot close the original reconciliation',async()=>{
 for(const override of [
  {providerRunId:'run-other'},
  {executionJobId:'job-other'},
  {intentId:'intent-other'},
  {providerId:'different-provider'},
  {capability:'billing.charge'},
  {evidenceRef:'evidence:unrelated'},
  {evidenceSource:'CLIENT_DECLARED'},
 ]){
  const store=createInMemoryReconciliationStore();
  const svc=createReconciliationService({store,resolvers:{
   zapier:async()=>({status:'succeeded',evidenceRefs:['evidence:verified-result'],
    verification:{verified:true,providerId:'zapier',capability:'integration.saas',
     executionJobId:'job-1',intentId:'intent-1',providerRunId:'run-1',
     evidenceSource:'PROVIDER_RUN_READBACK',evidenceRef:'evidence:verified-result',...override}})
  }});
  await svc.enqueue(unknown());
  const result=await svc.reconcileOne();
  assert.equal(result.status,'MANUAL_REVIEW',JSON.stringify(override));
  assert.deepEqual(store.get('recon-1').evidenceRefs,['evidence:dispatch']);
 }
});

test('G8: verified terminal provider failure is bound to same immutable job and carries no private error text',async()=>{
 const store=createInMemoryReconciliationStore();
 const svc=createReconciliationService({store,resolvers:{
  zapier:async()=>({status:'failed',errorType:'DESTINATION_REJECTED',
   errorMessage:'Bearer sensitive material',
   evidenceRefs:['evidence:provider-readback-failed'],
   verification:{verified:true,providerId:'zapier',capability:'integration.saas',
    executionJobId:'job-1',intentId:'intent-1',providerRunId:'run-1',
    evidenceSource:'PROVIDER_RUN_READBACK',evidenceRef:'evidence:provider-readback-failed'}})
 }});
 await svc.enqueue(unknown());
 const r=await svc.reconcileOne();
 assert.equal(r.status,'FAILED');
 const row=store.get('recon-1');
 assert.deepEqual(row.evidenceRefs,['evidence:dispatch','evidence:provider-readback-failed']);
 assert.equal(JSON.stringify(row).includes('Bearer sensitive'),false);
});

test('G8: unknown resolver outcome remains retryable and never starts a second execution',async()=>{
 const store=createInMemoryReconciliationStore(),calls=[];
 const svc=createReconciliationService({store,resolvers:{
  zapier:async record=>{calls.push(record);return {status:'pending',retryAfterSeconds:30,evidenceRefs:[]};}
 },now:()=>new Date('2026-10-15T10:00:00.000Z')});
 await svc.enqueue(unknown());
 const result=await svc.reconcileOne();
 assert.equal(result.status,'DEFERRED');
 assert.equal(calls.length,1);
 assert.equal(calls[0].executionJobId,'job-1');
 assert.equal(store.get('recon-1').state,'PENDING');
 assert.equal(store.get('recon-1').nextAttemptAt,'2026-10-15T10:00:30.000Z');
});
