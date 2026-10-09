import fs from 'node:fs';
import crypto from 'node:crypto';

const fail=code=>Object.assign(new Error(code),{code});
const runId=process.env.PROVIDER_RUN_ID||'';
const token=process.env.WINDMILL_VERIFIER_READ_TOKEN||'';
const expectedChallenge=process.env.EXPECTED_CHALLENGE||'';
if(!/^[A-Za-z0-9-]{8,90}$/.test(runId))throw fail('WINDMILL_CANCEL_JOB_ID_INVALID');
if(!token||token.length<16)throw fail('WINDMILL_CANCEL_READ_TOKEN_REQUIRED');
if(!/^[a-f0-9]{32,64}$/.test(expectedChallenge))throw fail('WINDMILL_CANCEL_CHALLENGE_INVALID');
const response=await fetch('https://app.windmill.dev/api/w/vaos/jobs_u/get/'+encodeURIComponent(runId),{
  headers:{Authorization:'Bearer '+token,Accept:'application/json'},
  signal:AbortSignal.timeout(12000),
});
if(response.status!==200)throw fail('WINDMILL_CANCEL_READBACK_FORBIDDEN');
const job=await response.json();
if(job?.id!==runId||job?.script_path!=='f/vaos/qualification_ping')throw fail('WINDMILL_CANCEL_JOB_MISMATCH');
if(job?.canceled!==true||job?.success!==false)throw fail('WINDMILL_CANCEL_TERMINAL_UNVERIFIED');
if(job?.args?.challenge!==expectedChallenge||Number(job?.args?.hold_seconds)!==45)throw fail('WINDMILL_CANCEL_INPUT_MISMATCH');
const evidence={
  schemaVersion:'vaos.windmill.cancellation-drill.v1',status:'PASS',
  providerId:'windmill',jobId:runId,providerJobId:runId,
  scriptPath:'f/vaos/qualification_ping',scriptHash:'e5a4c6c7e4d97748',
  boundedHoldSeconds:45,terminalState:'CANCELLED',
  independentReadback:true,verifier:'separate-read-only-Windmill-token',
  cancellationAuthority:'authenticated-windmill-owner-ui',cancelPostAttemptCount:1,
  challengeSha256:crypto.createHash('sha256').update(expectedChallenge).digest('hex'),
  evidenceRunId:String(process.env.GITHUB_RUN_ID),
  sourceCommitSha:String(process.env.GITHUB_SHA),productionActivation:false,
};
fs.mkdirSync('qualification-evidence/windmill',{recursive:true});
fs.writeFileSync('qualification-evidence/windmill/cancellation-live.json',JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
console.log('WINDMILL_LIVE_CANCELLATION=PASS');
