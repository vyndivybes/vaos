// Issue only from independently verified ephemeral-hosted rollback evidence.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {collectStage8Audit} from './stage8-audit-collector.mjs';
import {assessStage8Cutover} from '../../apps/web/lib/stage8-cutover-approval.mjs';
export const REQUIRED_EMERGENCY_MARKER='STAGE8_ISOLATED_EMERGENCY_DISABLE_RESTORE_PASS';
export async function verifyHostedCutover({runId,repository,token,fetcher=fetch}){
 const audit=await collectStage8Audit({runId,repository,token,fetcher});
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28'};
 const base='https://api.github.com/repos/'+repository;
 const r=await fetcher(base+'/actions/jobs/'+audit.jobId+'/logs',{headers});
 if(!r.ok)throw Error('CUTOVER_EMERGENCY_LOG_UNAVAILABLE');
 const log=await r.text();
 assert.ok(log.length<=10_000_000);
 assert.ok(log.split(/\r?\n/).some(line=>line.includes(REQUIRED_EMERGENCY_MARKER)
  &&!line.includes('console.log(')&&!line.includes('echo ')),
  'CUTOVER_EMERGENCY_RESTORATION_EVIDENCE_MISSING');
 return audit;
}
export function issueCutover({key,revision,now=Date.now()}){
 assert.match(key||'',/^[a-f0-9]{64}$/i);
 assert.match(revision||'',/^[a-f0-9]{40}$/i);
 const record={version:1,revision,issuedAt:now,expiresAt:now+15*60*1000,
  founderAuthorized:true,rollbackQualified:true,emergencyDisableQualified:true,
  businessWritesAllowed:false};
 const canonical=JSON.stringify(record);
 const signature=crypto.createHmac('sha256',Buffer.from(key,'hex')).update(canonical).digest('hex');
 const envelope=JSON.stringify({record,signature});
 assert.equal(assessStage8Cutover(envelope,{key,revision,now}).authorized,true);
 return envelope;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const {STAGE8_SOURCE_RUN_ID:runId,GITHUB_REPOSITORY:repository,GITHUB_TOKEN:token,
  VAOS_STAGE8_CUTOVER_APPROVAL_SIGNING_KEY:key,STAGE8_FOUNDER_AUTHORIZED:approval}=process.env;
 assert.equal(approval,'approved','FOUNDER_AUTHORIZATION_REQUIRED');
 const audit=await verifyHostedCutover({runId,repository,token});
 const signed=issueCutover({key,revision:audit.revision});
 await writeFile('stage8-signed-cutover.json',signed,{mode:0o600});
 console.log('STAGE8_CUTOVER_APPROVAL_ISSUED',audit.workflowRunId,audit.revision);
}
