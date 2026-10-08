import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWindmillAdmission, qualifyWindmillCancellationEvidence } from './operational-gates.mjs';

const baseline = {
  approvedScript: 'f/vaos/qualification_ping',
  productionEnabled: false,
  killSwitchEnabled: false,
  leaseIsDurable: true,
  activeRuns: 0,
  queuedRuns: 0,
  maxActiveRuns: 1,
  maxQueuedRuns: 0,
  maxRuntimeSeconds: 60,
  requestedRuntimeSeconds: 10,
  snapshotAgeSeconds: 1,
  approvedAction: true,
};
test('admission allows one qualifying synthetic job with fresh durable state only',()=>{
  assert.deepEqual(evaluateWindmillAdmission(baseline),{decision:'ALLOW',maxRuntimeSeconds:60,maxConcurrentRuns:1,maxQueuedRuns:0});
});
test('denies if durable lease, authorization, kill switch or routing guards are unsafe',()=>{
  for(const changes of [
    {productionEnabled:true},{killSwitchEnabled:true},{leaseIsDurable:false},
    {activeRuns:1},{queuedRuns:1},{requestedRuntimeSeconds:61},
    {snapshotAgeSeconds:31},{approvedAction:false},
    {approvedScript:'f/vaos/engineering_mass_estimate'},
  ])assert.equal(evaluateWindmillAdmission({...baseline,...changes}).decision,'DENY');
});
test('rejects invalid, negative and missing queue controls',()=>{
  for (const changes of [{ activeRuns: -1 },{ queuedRuns: undefined },{ maxActiveRuns: 8 },{ maxQueuedRuns: 9 },{ snapshotAgeSeconds: -1 }]){
    assert.equal(evaluateWindmillAdmission({...baseline,...changes}).decision,'DENY');
  }
});
test('requires actual readback for cancellation evidence and never accepts dispatch intent alone',()=>{
  assert.equal(qualifyWindmillCancellationEvidence({
    requestedJobId:'019effff-aaaa-7bbb-8ccc-0123456789ab',
    observedJobId:'019effff-aaaa-7bbb-8ccc-0123456789ab',
    observedCanceled:true,
    observedRunning:false,
    independentReadback:true,
    cancellationRequested:true,
  }).status,'PASS');
  for(const changes of [{observedCanceled:false},{observedRunning:true},{independentReadback:false},{cancellationRequested:false},{observedJobId:'different'}]){
    assert.throws(()=>qualifyWindmillCancellationEvidence({
      requestedJobId:'019effff-aaaa-7bbb-8ccc-0123456789ab',
      observedJobId:'019effff-aaaa-7bbb-8ccc-0123456789ab',
      observedCanceled:true,
      observedRunning:false,
      independentReadback:true,
      cancellationRequested:true,
      ...changes,
    }));
  }
});
