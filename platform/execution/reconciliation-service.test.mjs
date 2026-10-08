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
        return {status:'succeeded',evidenceRefs:['evidence:callback'],verification:{verified:true}};
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
  const svc=createReconciliationService({store,resolvers:{}});
  await svc.enqueue(unknown());
  const now='2026-10-08T00:00:00.000Z';
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
