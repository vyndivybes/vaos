import fs from 'node:fs';
import {evaluateWindmillFinalSignoff} from '../../platform/qualification/final-independent-signoff.mjs';

const fail=code=>Object.assign(new Error(code),{code});
const INPUT='audit-input';
const SOURCES={syntheticRunId:'37847337453',verifierRunId:'37849719120',cloudflareRunId:'37860222073'};
const file=path=>{
  try{return JSON.parse(fs.readFileSync(path,'utf8'));}
  catch{throw fail('WINDMILL_AUDIT_EVIDENCE_MISSING')}
};
async function verifyRun(runId,workflowFile){
  const auth=process.env.GITHUB_TOKEN;
  if(typeof auth!=='string'||!auth)throw fail('WINDMILL_AUDIT_READ_TOKEN_REQUIRED');
  const response=await fetch(
    'https://api.github.com/repos/vyndivybes/vaos/actions/runs/'+runId,
    {headers:{Authorization:'Bearer '+auth,
      Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
     signal:AbortSignal.timeout(12000)}
  );
  if(!response.ok)throw fail('WINDMILL_AUDIT_SOURCE_RUN_UNAVAILABLE');
  const run=await response.json();
  if(run.id?.toString()!==runId||run.conclusion!=='success'||
    run.head_branch!=='main'||run.path!==workflowFile)
    throw fail('WINDMILL_AUDIT_SOURCE_RUN_INVALID');
  return {runId,sha:run.head_sha,event:run.event};
}
async function main(){
  if(process.env.GITHUB_REPOSITORY!=='vyndivybes/vaos'||
    process.env.GITHUB_REF!=='refs/heads/main')throw fail('WINDMILL_AUDIT_REPO_SCOPE_INVALID');
  const [syntheticRun,independentRun,cloudflareRun]=await Promise.all([
    verifyRun(SOURCES.syntheticRunId,'.github/workflows/windmill-synthetic-live-qualification.yml'),
    verifyRun(SOURCES.verifierRunId,'.github/workflows/windmill-independent-operational-qualification.yml'),
    verifyRun(SOURCES.cloudflareRunId,'.github/workflows/windmill-live-do-qualification.yml'),
  ]);
  if(syntheticRun.event!=='workflow_dispatch'||independentRun.event!=='workflow_dispatch'||
    cloudflareRun.event!=='push')throw fail('WINDMILL_AUDIT_EVENT_ORIGIN_MISMATCH');

  const synthetic=file(INPUT+'/synthetic/synthetic-live.json');
  const independent=file(INPUT+'/independent/independent.json');
  const cloudflare=file(INPUT+'/cloudflare/cloudflare-do-live.json');
  if(synthetic.source?.commitSha!==syntheticRun.sha||
    independent.verifierCommitSha!==independentRun.sha||
    cloudflare.sourceCommit!==cloudflareRun.sha)
    throw fail('WINDMILL_AUDIT_RUN_COMMIT_MISMATCH');

  const manifest=file('integrations/windmill/provider-manifest.json');
  let cancellation,eviction,productionAudit;
  const cancellationRunId=process.env.WINDMILL_CANCELLATION_SOURCE_RUN;
  const evictionRunId=process.env.WINDMILL_EVICTION_SOURCE_RUN;
  if(cancellationRunId||evictionRunId){
    if(!/^[0-9]{6,20}$/.test(cancellationRunId||'')||!/^[0-9]{6,20}$/.test(evictionRunId||'')||
      process.env.GITHUB_EVENT_NAME!=='workflow_dispatch')throw fail('WINDMILL_AUDIT_NEW_SOURCE_INVALID');
    const [cancelRun,evictRun]=await Promise.all([
      verifyRun(cancellationRunId,'.github/workflows/windmill-cancellation-live-qualification.yml'),
      verifyRun(evictionRunId,'.github/workflows/windmill-live-do-qualification.yml'),
    ]);
    cancellation=file(INPUT+'/cancellation/cancellation-live.json');
    eviction=file(INPUT+'/eviction/cloudflare-restart.json');
    if(cancelRun.event!=='workflow_dispatch'||evictRun.event!=='push'||
      cancellation.sourceCommitSha!==cancelRun.sha||cancellation.evidenceRunId!==cancellationRunId||
      cancellation.runningBeforeCancellation!==true||cancellation.dispatchPostAttemptCount!==1||
      cancellation.distinctCredentialRoles!==true||cancellation.reservation?.durable!==true||
      cancellation.reservation.maxConcurrentRuns!==1||cancellation.reservation.queuedRuns!==0||
      cancellation.reservation.expirySeconds>60||cancellation.reservation.released!==true||
      cancellation.providerScriptHash!=='92dd4d9b9bff2d1d'||
      eviction.sourceCommit!==evictRun.sha||eviction.evidenceRunId!==evictionRunId)
      throw fail('WINDMILL_AUDIT_NEW_SOURCE_MISMATCH');
    const token=process.env.WINDMILL_HOLD_READ_TOKEN;
    if(typeof token!=='string'||!token)throw fail('WINDMILL_AUDIT_WINDMILL_READ_TOKEN_REQUIRED');
    if(!/^[A-Za-z0-9-]{8,90}$/.test(cancellation.jobId||''))throw fail('WINDMILL_AUDIT_JOB_ID_INVALID');
    const response=await fetch('https://app.windmill.dev/api/w/vaos/jobs_u/get/'+encodeURIComponent(cancellation.jobId),
      {headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(10000)});
    if(response.status!==200)throw fail('WINDMILL_AUDIT_PROVIDER_READBACK_UNAVAILABLE');
    const job=await response.json();
    if(job.id!==cancellation.jobId||job.script_path!=='f/vaos/qualification_hold'||
      job.script_hash!==cancellation.providerScriptHash||job.canceled!==true||job.success!==false||
      typeof job.started_at!=='string'||!Number.isFinite(Date.parse(job.started_at)))
      throw fail('WINDMILL_AUDIT_PROVIDER_TERMINAL_MISMATCH');
    productionAudit={
      schemaVersion:'vaos.windmill.separate-auditor.v1',status:'PASS',independent:true,
      cancellationRunId,evictionRunId,examinerRunId:String(process.env.GITHUB_RUN_ID),
      providerTerminalReadback:{jobId:job.id,scriptPath:job.script_path,scriptHash:job.script_hash,canceled:true,success:false,startedAt:job.started_at},
      productionActivation:false,
    };
  }
  const decision=evaluateWindmillFinalSignoff({
    synthetic,independent,cloudflare,manifest,cancellation,eviction,productionAudit,sources:SOURCES,
    // No self-asserted cancellation, eviction or external audit proof accepted.
  });
  fs.mkdirSync('qualification-evidence/windmill',{recursive:true});
  const evidence={
    ...decision,
    cancellation,eviction,productionAudit,
    auditedAt:new Date().toISOString(),
    examinerRunId:String(process.env.GITHUB_RUN_ID),
    examinerCommitSha:String(process.env.GITHUB_SHA),
    examinerRole:'read-only-source-reconciliation',
    artifacts:{
      synthetic:'windmill-synthetic-live-evidence',
      independent:'windmill-independent-verification-evidence',
      cloudflare:'windmill-cloudflare-do-live-evidence',
    },
    noProviderMutations:true,
  };
  fs.writeFileSync('qualification-evidence/windmill/final-independent-assessment.json',
    JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
  console.log('WINDMILL_AUDIT_DECISION='+decision.decision);
  console.log('WINDMILL_AUDIT_GATES='+JSON.stringify(decision.gates));
  if(!['HOLD','READY_FOR_HUMAN_APPROVAL'].includes(decision.decision))throw fail('WINDMILL_AUDIT_INVALID_DECISION');
}
try{await main();}
catch(e){
  const code=/^WINDMILL_[A-Z0-9_]+$/.test(e?.code||'')?e.code:'WINDMILL_AUDIT_FAILED';
  console.error('::error::'+code);
  process.exitCode=1;
}
