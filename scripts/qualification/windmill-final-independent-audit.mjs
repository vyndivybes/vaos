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
  const decision=evaluateWindmillFinalSignoff({
    synthetic,independent,cloudflare,manifest,sources:SOURCES,
    // No self-asserted cancellation, eviction or external audit proof accepted.
  });
  fs.mkdirSync('qualification-evidence/windmill',{recursive:true});
  const evidence={
    ...decision,
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
  if(decision.decision!=='HOLD')throw fail('WINDMILL_AUDIT_UNEXPECTED_SELF_CERTIFICATION');
}
try{await main();}
catch(e){
  const code=/^WINDMILL_[A-Z0-9_]+$/.test(e?.code||'')?e.code:'WINDMILL_AUDIT_FAILED';
  console.error('::error::'+code);
  process.exitCode=1;
}
