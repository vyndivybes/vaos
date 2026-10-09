const SCRIPT='f/vaos/qualification_ping';
const REPO='vyndivybes/vaos';
const runId=value=>typeof value==='string'&&/^[0-9]{6,20}$/.test(value);
const jobId=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{8,90}$/.test(value);
const cleanRun=value=>runId(value)?value:null;

/**
 * Independent evidence reconciliation, not authority to enable Windmill.
 * An input-side PASS field alone cannot satisfy a gate. Each required proof
 * must be in its own schema, from a separate run, cross-linked to its peers.
 * Production activation is always human-gated after this assessment.
 */
export function evaluateWindmillFinalSignoff({
  synthetic,independent,cloudflare,manifest,cancellation,eviction,productionAudit,
  sources={},
}={}){
  const sourceRuns={
    synthetic:cleanRun(sources.syntheticRunId),
    verifier:cleanRun(sources.verifierRunId),
    cloudflare:cleanRun(sources.cloudflareRunId),
  };
  const authorizedDisabled=manifest?.providerId==='windmill'&&
    manifest.enabled===false&&manifest.qualification?.state==='evaluation';
  const syntheticValid=synthetic?.schemaVersion==='vaos.windmill.synthetic-qualification.v1'&&
    synthetic.providerId==='windmill'&&synthetic.status==='PASS'&&
    synthetic.productionActivation===false&&synthetic.scriptExecuted===true&&
    synthetic.scriptPath===SCRIPT&&jobId(synthetic.jobId)&&
    synthetic.source?.repository===REPO&&
    /^[a-f0-9]{40}$/.test(synthetic.source?.commitSha||'')&&
    synthetic.source.runId===sourceRuns.synthetic;
  const independentValid=independent?.schemaVersion==='vaos.windmill.independent-verification.v1'&&
    independent.providerId==='windmill'&&independent.status==='PASS'&&
    independent.productionActivation===false&&independent.scriptExecuted===false&&
    independent.verifier==='separate-read-only-Windmill-token'&&
    independent.jobId===synthetic?.jobId&&independent.scriptPath===SCRIPT&&
    independent.sourceCommitSha===synthetic?.source?.commitSha&&
    independent.sourceRunId===sourceRuns.synthetic&&runId(sourceRuns.verifier)&&
    sourceRuns.verifier!==sourceRuns.synthetic;
  const cloudflareValid=cloudflare?.schemaVersion==='vaos.windmill.cloud-do-live.v1'&&
    cloudflare.qualification==='PASS'&&cloudflare.productionActivation===false&&
    cloudflare.concurrentAdmission==='PASS'&&
    cloudflare.persistedAcrossHttpRequests==='PASS'&&
    cloudflare.timeoutQuarantine==='PASS'&&
    cloudflare.cloudflareAlarmCallback==='PASS'&&
    cloudflare.cloudflareAuthenticatedBy==='github-oidc-rs256-scoped'&&
    cloudflare.auditEvents>=3&&cloudflare.windmillCalls===0&&
    cloudflare.githubRunId===sourceRuns.cloudflare;
  const provenance=authorizedDisabled&&syntheticValid&&independentValid&&
    cloudflareValid&&new Set(Object.values(sourceRuns)).size===3;
  const cancellationValid=cancellation?.schemaVersion==='vaos.windmill.cancellation-drill.v1'&&
    cancellation.status==='PASS'&&cancellation.productionActivation===false&&
    cancellation.scriptPath==='f/vaos/qualification_hold'&&
    jobId(cancellation.jobId)&&cancellation.jobId===cancellation.providerJobId&&
    cancellation.terminalState==='CANCELLED'&&
    cancellation.independentReadback===true&&cancellation.runningBeforeCancellation===true&&
    cancellation.dispatchPostAttemptCount===1&&cancellation.distinctCredentialRoles===true&&
    /^[a-f0-9]{40}$/.test(cancellation.sourceCommitSha||'')&&
    cancellation.providerScriptHash==='92dd4d9b9bff2d1d'&&
    cancellation.reservation?.durable===true&&cancellation.reservation.maxConcurrentRuns===1&&
    cancellation.reservation.queuedRuns===0&&cancellation.reservation.expirySeconds===60&&cancellation.reservation.released===true&&
    cancellation.cancelPostAttemptCount===1&&runId(cancellation.evidenceRunId)&&
    !Object.values(sourceRuns).includes(cancellation.evidenceRunId);
  const evictionValid=eviction?.schemaVersion==='vaos.windmill.restart-recovery.v1'&&
    eviction.status==='PASS'&&eviction.productionActivation===false&&
    eviction.instanceChanged===true&&eviction.sameDurableObject===true&&
    eviction.previouslyReservedSlotStillBlocked===true&&
    eviction.providerDispatchCount===0&&runId(eviction.evidenceRunId)&&
    !Object.values(sourceRuns).includes(eviction.evidenceRunId)&&
    eviction.evidenceRunId!==cancellation?.evidenceRunId;
  const auditValid=cancellationValid&&evictionValid&&
    productionAudit?.schemaVersion==='vaos.windmill.separate-auditor.v1'&&
    productionAudit.status==='PASS'&&productionAudit.independent===true&&
    productionAudit.productionActivation===false&&
    productionAudit.cancellationRunId===cancellation.evidenceRunId&&
    productionAudit.evictionRunId===eviction.evidenceRunId&&
    runId(productionAudit.examinerRunId)&&
    ![...Object.values(sourceRuns),cancellation.evidenceRunId,eviction.evidenceRunId]
      .includes(productionAudit.examinerRunId);
  const gates=Object.freeze({
    provenance:provenance?'PASS':'FAIL',
    syntheticExecution:syntheticValid?'PASS':'FAIL',
    independentWindmillReadback:independentValid?'PASS':'FAIL',
    cloudflareLiveAdmissionAndAlarm:cloudflareValid?'PASS':'FAIL',
    liveCancellation:cancellationValid?'PASS':'MISSING',
    forcedEvictionRecovery:evictionValid?'PASS':'MISSING',
    independentProductionAudit:auditValid?'PASS':'BLOCKED',
  });
  const ready=Object.values(gates).every(x=>x==='PASS');
  return Object.freeze({
    schemaVersion:'vaos.windmill.final-independent-assessment.v1',
    decision:ready?'READY_FOR_HUMAN_APPROVAL':'HOLD',
    productionAuthorization:false,
    providerManifestMustRemainDisabled:true,
    sourceRuns:Object.freeze(sourceRuns),
    gates,
  });
}
