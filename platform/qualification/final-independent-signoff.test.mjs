import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateWindmillFinalSignoff} from './final-independent-signoff.mjs';

const synthetic={
  schemaVersion:'vaos.windmill.synthetic-qualification.v1', providerId:'windmill',
  status:'PASS', productionActivation:false,scriptExecuted:true,
  scriptPath:'f/vaos/qualification_ping',jobId:'019effff-aaaa-7bbb-8ccc-0123456789ab',
  source:{repository:'vyndivybes/vaos',commitSha:'a'.repeat(40),runId:'37847337453'},
};
const independent={
  schemaVersion:'vaos.windmill.independent-verification.v1',
  providerId:'windmill',status:'PASS',sourceRunId:'37847337453',
  sourceCommitSha:'a'.repeat(40),jobId:synthetic.jobId,
  scriptPath:synthetic.scriptPath,productionActivation:false,
  verifier:'separate-read-only-Windmill-token',scriptExecuted:false,
};
const cloudflare={
  schemaVersion:'vaos.windmill.cloud-do-live.v1',
  qualification:'PASS',cloudflareAuthenticatedBy:'github-oidc-rs256-scoped',
  concurrentAdmission:'PASS',persistedAcrossHttpRequests:'PASS',
  timeoutQuarantine:'PASS',cloudflareAlarmCallback:'PASS',auditEvents:3,
  windmillCalls:0,actualDurableObjectEvictionQualified:false,
  liveWindmillCancellationQualified:false,productionActivation:false,
  githubRunId:'37860222073',
};
const manifest={providerId:'windmill',enabled:false,qualification:{state:'evaluation'}};
const base={synthetic,independent,cloudflare,manifest,
  sources:{syntheticRunId:'37847337453',verifierRunId:'37849719120',cloudflareRunId:'37860222073'}};
test('real existing proof is HOLD and identifies each incomplete gate precisely',()=>{
  const x=evaluateWindmillFinalSignoff(base);
  assert.equal(x.decision,'HOLD');
  assert.equal(x.productionAuthorization,false);
  assert.equal(x.gates.syntheticExecution,'PASS');
  assert.equal(x.gates.independentWindmillReadback,'PASS');
  assert.equal(x.gates.cloudflareLiveAdmissionAndAlarm,'PASS');
  assert.equal(x.gates.liveCancellation,'MISSING');
  assert.equal(x.gates.forcedEvictionRecovery,'MISSING');
  assert.equal(x.gates.independentProductionAudit,'BLOCKED');
  assert.equal(x.sourceRuns.cloudflare,'37860222073');
});
test('a forged live cancellation flag embedded in Cloudflare artifact is rejected',()=>{
  const x=evaluateWindmillFinalSignoff({
    ...base,cloudflare:{...cloudflare,liveWindmillCancellationQualified:true},
  });
  assert.equal(x.decision,'HOLD');
  assert.equal(x.gates.liveCancellation,'MISSING');
});
test('source job mismatch, wrong verifier source, or disabled provider change fails closed',()=>{
  for(const data of [
    {...base,independent:{...independent,jobId:'019aaaab-bbbb-cccc-dddd-eeeeeeeeeeee'}},
    {...base,independent:{...independent,sourceRunId:'99999999'}},
    {...base,manifest:{...manifest,enabled:true}},
    {...base,cloudflare:{...cloudflare,windmillCalls:1}},
  ]){
    const x=evaluateWindmillFinalSignoff(data);
    assert.equal(x.productionAuthorization,false);
    assert.equal(x.decision,'HOLD');
    assert.notEqual(x.gates.provenance,'PASS');
  }
});
test('only separate independently verified cancellation, eviction and audit evidence can satisfy readiness',()=>{
  const a=evaluateWindmillFinalSignoff({
    ...base,
    cancellation:{schemaVersion:'vaos.windmill.cancellation-drill.v1',status:'PASS',
      jobId:'019aaaaa-aaaa-aaaa-aaaa-0123456789ab',
      scriptPath:'f/vaos/qualification_hold',terminalState:'CANCELLED',
      independentReadback:true,cancelPostAttemptCount:1,
      providerJobId:'019aaaaa-aaaa-aaaa-aaaa-0123456789ab',
      evidenceRunId:'37880000001',productionActivation:false},
    eviction:{schemaVersion:'vaos.windmill.restart-recovery.v1',status:'PASS',
      instanceChanged:true,sameDurableObject:true,
      previouslyReservedSlotStillBlocked:true,providerDispatchCount:0,
      evidenceRunId:'37880000002',productionActivation:false},
    productionAudit:{schemaVersion:'vaos.windmill.separate-auditor.v1',
      status:'PASS',independent:true,
      cancellationRunId:'37880000001',evictionRunId:'37880000002',
      examinerRunId:'37880000003',productionActivation:false},
  });
  assert.equal(a.decision,'READY_FOR_HUMAN_APPROVAL');
  assert.equal(a.productionAuthorization,false);
});
test('rejects self-certification and missing independent auditor identity',()=>{
  const x=evaluateWindmillFinalSignoff({...base,productionAudit:{
    status:'PASS',independent:false,
  }});
  assert.equal(x.decision,'HOLD');
  assert.equal(x.gates.independentProductionAudit,'BLOCKED');
});
