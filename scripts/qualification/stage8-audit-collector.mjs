// Independently read GitHub-hosted job logs. Never accept caller-supplied PASS fields.
import assert from 'node:assert/strict';
export const EVIDENCE_MARKERS=Object.freeze({
 maker_sign_in:'STAGE8_MAKER_LOGIN_PASS',
 checker_sign_in:'STAGE8_CHECKER_LOGIN_PASS',
 session_isolation:'STAGE8_ROLE_SESSION_ISOLATION_PASS',
 invalid_signature_rejected:'STAGE8_FORGED_SIGNATURE_REJECTED',
 expired_session_rejected:'STAGE8_EXPIRED_SESSION_REJECTED',
 logout_rejected:'STAGE8_HOSTED_ACTUAL_HANDLERS_REVOKE_REDEPLOY_PASS',
 environment_isolation:'STAGE8_HOSTED_ROLLBACK_SIGNER_ROTATION_PASS',
 audit_readback:'STAGE8_EPHEMERAL_WORKER_DELETED_AND_VERIFIED'
});
export async function collectStage8Audit({runId,repository,token,fetcher=fetch}){
 assert.match(String(runId),/^\d+$/);
 assert.equal(repository,'vyndivybes/vaos');
 assert.ok(token);
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28'};
 const base='https://api.github.com/repos/'+repository;
 async function getJson(path){
  const r=await fetcher(base+path,{headers});
  if(!r.ok)throw Error('AUDIT_GITHUB_READ_FAILED_'+r.status);
  return r.json();
 }
 const run=await getJson('/actions/runs/'+runId);
 assert.equal(run.name,'stage8-hosted-actual-auth');
 assert.equal(run.conclusion,'success');
 assert.equal(run.head_branch,'main');
 assert.match(run.head_sha,/^[a-f0-9]{40}$/);
 const jobs=await getJson('/actions/runs/'+runId+'/jobs?per_page=100');
 const matches=jobs.jobs.filter(j=>j.name==='actual-hosted-auth'&&j.conclusion==='success');
 assert.equal(matches.length,1);
 const job=matches[0];
 assert.equal(job.steps?.find(s=>s.name==='Actual hosted VAOS login, persistent R2 replay denial, cleanup')?.conclusion,'success');
 const response=await fetcher(base+'/actions/jobs/'+job.id+'/logs',{headers});
 if(!response.ok)throw Error('AUDIT_LOG_READ_FAILED_'+response.status);
 const log=await response.text();
 if(log.length>10_000_000)throw Error('AUDIT_LOG_OVERSIZE');
 const lines=log.split(/\r?\n/);
 const checks={};
 for(const [check,marker] of Object.entries(EVIDENCE_MARKERS)){
  checks[check]=lines.some(line=>line.includes(marker)&&!line.includes('console.log(')&&!line.includes('echo '));
 }
 if(Object.values(checks).some(value=>value!==true))throw Error('AUDIT_REQUIRED_MARKERS_MISSING');
 return Object.freeze({source:'independent-hosted-audit',workflowRunId:Number(runId),
  revision:run.head_sha,checks,jobId:job.id,verifiedAt:new Date().toISOString()});
}
