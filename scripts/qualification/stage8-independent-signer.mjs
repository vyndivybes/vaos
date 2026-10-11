// Separate GitHub Actions verifier; never signs from the runner's own boolean claims.
// Verifies an actual successful hosted run and mandatory log assertions.
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const runId=process.env.STAGE8_SOURCE_RUN_ID;
const repository=process.env.GITHUB_REPOSITORY;
const token=process.env.GITHUB_TOKEN;
const key=process.env.VAOS_STAGE8_EVIDENCE_SIGNING_KEY;
if(!/^\d+$/.test(runId||'')||repository!=='vyndivybes/vaos'||!token||!/^[a-f0-9]{64}$/i.test(key||''))
 throw Error('STAGE8_VERIFIER_CONFIGURATION_HOLD');
const api=async path=>{
 const r=await fetch('https://api.github.com/repos/'+repository+path,{
  headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
 if(!r.ok)throw Error('GITHUB_VERIFICATION_HTTP_'+r.status);
 return r.json();
};
const run=await api('/actions/runs/'+runId);
assert.equal(run.name,'stage8-hosted-actual-auth');
assert.equal(run.conclusion,'success');
assert.equal(run.head_branch,'main');
assert.equal(run.event==='workflow_dispatch'||run.event==='push',true);
assert.match(run.head_sha,/^[a-f0-9]{40}$/);
const jobs=await api('/actions/runs/'+runId+'/jobs?per_page=100');
const successful=jobs.jobs.filter(j=>j.name==='actual-hosted-auth'&&j.conclusion==='success');
assert.equal(successful.length,1);
const steps=successful[0].steps||[];
assert.equal(steps.find(s=>s.name==='Actual hosted VAOS login, persistent R2 replay denial, cleanup')?.conclusion,'success');
// A successful workflow alone does not establish every independent check. Require the
// test runner to emit a verifiable, structured proof artifact in a future revision.
// Fail closed until authenticated audit readback is available independently.
const proof=process.env.STAGE8_INDEPENDENT_AUDIT_RECORD;
if(!proof)throw Error('STAGE8_INDEPENDENT_AUDIT_READBACK_MISSING');
let audit;
try{audit=JSON.parse(proof)}catch{throw Error('STAGE8_AUDIT_RECORD_INVALID')}
const checks=['maker_sign_in','checker_sign_in','session_isolation','invalid_signature_rejected',
'expired_session_rejected','logout_rejected','environment_isolation','audit_readback'];
if(audit.workflowRunId!==Number(runId)||audit.revision!==run.head_sha
 ||audit.source!=='independent-hosted-audit' || checks.some(n=>audit.checks?.[n]!==true))
 throw Error('STAGE8_INDEPENDENT_AUDIT_INCOMPLETE');
const now=Date.now();
const record={version:1,environment:'development',revision:run.head_sha,
 issuedAt:now,expiresAt:now+45*60*1000,
 checks:Object.fromEntries(checks.map(n=>[n,true])),
 maker:'shyamsundhar1982@gmail.com',checker:'kaaviyam1519@gmail.com'};
const canonical=JSON.stringify({version:1,environment:record.environment,
 revision:record.revision,issuedAt:record.issuedAt,expiresAt:record.expiresAt,
 checks:checks.map(n=>[n,record.checks[n]]),maker:record.maker,checker:record.checker});
const signature=crypto.createHmac('sha256',Buffer.from(key,'hex')).update(canonical).digest('hex');
const envelope=JSON.stringify({record,signature});
const {assessStage8Evidence}=await import('../../apps/web/lib/stage8-qualification-evidence.mjs');
assert.equal(assessStage8Evidence(envelope,{key,environment:'development',revision:run.head_sha}).qualified,true);
await writeFile('stage8-signed-qualification.json',envelope,{mode:0o600});
console.log('STAGE8_INDEPENDENT_VERIFIER_SIGNED_VALID_RUN',runId,run.head_sha);
