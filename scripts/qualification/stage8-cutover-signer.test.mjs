import test from 'node:test';
import assert from 'node:assert/strict';
import {issueCutover,verifyHostedCutover,REQUIRED_EMERGENCY_MARKER} from './stage8-cutover-signer.mjs';
import {EVIDENCE_MARKERS} from './stage8-audit-collector.mjs';
import {assessStage8Cutover} from '../../apps/web/lib/stage8-cutover-approval.mjs';
const key='aa'.repeat(32),sha='ab'.repeat(20),runId='1234',repo='vyndivybes/vaos';
function provider(omit=''){
 const logs=[...Object.values(EVIDENCE_MARKERS),REQUIRED_EMERGENCY_MARKER]
  .filter(x=>x!==omit).map(x=>'2026-10-12T01:00:00Z '+x).join('\n');
 return async url=>{
  if(url.includes('/jobs?per_page='))return {ok:true,json:async()=>({jobs:[{
   id:987,name:'actual-hosted-auth',conclusion:'success',
   steps:[{name:'Actual hosted VAOS login, persistent R2 replay denial, cleanup',conclusion:'success'}]}]})};
  if(url.includes('/actions/runs/'))return {ok:true,json:async()=>({
   name:'stage8-hosted-actual-auth',head_branch:'main',head_sha:sha,conclusion:'success'})};
  if(url.includes('/actions/jobs/987/logs'))return {ok:true,text:async()=>logs};
  throw Error('unexpected URL '+url);
 };
}
test('signed cutover is 15-min, narrow and verifies',()=>{
 const v=issueCutover({key,revision:sha});
 assert.equal(assessStage8Cutover(v,{key,revision:sha}).authorized,true);
 assert.equal(assessStage8Cutover(v,{key,revision:'cd'.repeat(20)}).authorized,false);
 assert.equal(JSON.parse(v).record.businessWritesAllowed,false);
});
test('independent evidence and emergency recovery must both pass',async()=>{
 const x=await verifyHostedCutover({runId,repository:repo,token:'synthetic',fetcher:provider()});
 assert.equal(x.revision,sha);
 await assert.rejects(()=>verifyHostedCutover({runId,repository:repo,token:'synthetic',
  fetcher:provider(REQUIRED_EMERGENCY_MARKER)}),/CUTOVER_EMERGENCY_RESTORATION_EVIDENCE_MISSING/);
 await assert.rejects(()=>verifyHostedCutover({runId,repository:repo,token:'synthetic',
  fetcher:provider(EVIDENCE_MARKERS.audit_readback)}),/AUDIT_REQUIRED_MARKERS_MISSING/);
});
