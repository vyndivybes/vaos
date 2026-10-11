import test from 'node:test';
import assert from 'node:assert/strict';
import {collectStage8Audit,EVIDENCE_MARKERS} from './stage8-audit-collector.mjs';
const sha='a'.repeat(40);
const run={name:'stage8-hosted-actual-auth',conclusion:'success',head_branch:'main',head_sha:sha};
const jobs={jobs:[{id:456,name:'actual-hosted-auth',conclusion:'success',steps:[
 {name:'Actual hosted VAOS login, persistent R2 replay denial, cleanup',conclusion:'success'}]}]};
function mock({missing='',outcome='success'}={}){
 return async url=>{
  if(url.includes('/actions/runs/'))return {ok:true,json:async()=>({...run,conclusion:outcome})};
  if(url.includes('/jobs?'))return {ok:true,json:async()=>jobs};
  if(url.includes('/actions/jobs/456/logs')){
   return {ok:true,text:async()=>Object.values(EVIDENCE_MARKERS).filter(s=>s!==missing)
    .map(s=>'2026-10-12T00:00:00Z '+s).join('\n')};
  }
  throw Error('unexpected '+url);
 };
}
test('all eight authenticated job markers produce independent audit record',async()=>{
 const audit=await collectStage8Audit({runId:'123',repository:'vyndivybes/vaos',token:'synthetic',fetcher:mock()});
 assert.equal(audit.revision,sha);
 assert.equal(Object.values(audit.checks).filter(Boolean).length,8);
});
test('missing individual proof marker fails closed',async()=>{
 await assert.rejects(()=>collectStage8Audit({runId:'123',repository:'vyndivybes/vaos',token:'synthetic',fetcher:mock({missing:EVIDENCE_MARKERS.audit_readback})}),/AUDIT_REQUIRED_MARKERS_MISSING/);
});
test('failed hosted run cannot be certified',async()=>{
 await assert.rejects(()=>collectStage8Audit({runId:'123',repository:'vyndivybes/vaos',token:'synthetic',fetcher:mock({outcome:'failure'})}));
});
