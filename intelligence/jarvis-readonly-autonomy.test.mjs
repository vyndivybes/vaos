import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyAutonomySourceReport,finishAutonomyReview,claimAutonomyInferenceBudget} from './jarvis-readonly-autonomy.mjs';
const report=(revision=false,available=true)=>({
 schemaVersion:'VAOS_DATA_AGENT_V1',status:available?'OBSERVED':'PARTIAL',
 readOnly:true,actionAuthorized:false,
 sourceCoverage:{requested:2,observed:available?2:1},
 sources:[
  {index:1,domain:'finance',status:'OBSERVED',authority:'ledger-authority',sourceRevisionVerified:revision},
  {index:2,domain:'procurement',status:available?'OBSERVED':'HOLD',authority:available?'shortage-authority':null,sourceRevisionVerified:revision}
 ],
 metrics:[{sourceIndex:1,domain:'finance',value:1},...(available?[{sourceIndex:2,domain:'procurement',value:2}]:[])]
});
const advisory={authority:'ADVISORY_ONLY',actionAuthorized:false,executionEnabled:false,modelInvoked:true,
 recommendation:'PROCEED_WITH_REVIEW',riskPosture:'LOW',summary:'The present observations suggest a bounded review by the founder.'};
test('unverified revision never authorizes a model proceed, even when all sources returned records',()=>{
 const s=qualifyAutonomySourceReport(report());
 const r=finishAutonomyReview({sourceReview:s,advisory});
 assert.equal(r.status,'HOLD');
 assert.equal(r.effectiveRecommendation,'HOLD_FOR_EVIDENCE');
 assert.ok(r.holds.includes('SOURCE_REVISION_UNVERIFIED'));
 assert.ok(r.holds.includes('MODEL_PROCEED_BLOCKED_BY_SOURCE_GATE'));
 assert.equal(r.productionWriteAuthorized,false);
});
test('missing source never gets treated as zero, proof or authorization',()=>{
 const s=qualifyAutonomySourceReport(report(false,false));
 assert.ok(s.holds.includes('SOURCE_UNAVAILABLE'));
 assert.equal(s.sources[1].recordsObserved,null);
});
test('even verified sources produce founder review, not execution',()=>{
 const s=qualifyAutonomySourceReport(report(true));
 const r=finishAutonomyReview({sourceReview:s,advisory});
 assert.equal(r.status,'FOUNDER_REVIEW_REQUIRED');
 assert.equal(r.actionAuthorized,false);
 assert.equal(r.externalActionDispatched,false);
});
test('model claimed tool execution or invalid evidence is rejected before completion',()=>{
 const s=qualifyAutonomySourceReport(report());
 for(const bad of [{...advisory,actionAuthorized:true},{...advisory,modelInvoked:false},
  {...advisory,authority:'L5_AUTONOMOUS'}])
  assert.throws(()=>finishAutonomyReview({sourceReview:s,advisory:bad}),/AUTONOMY_ADVISORY_INVALID/);
 assert.throws(()=>qualifyAutonomySourceReport({...report(),readOnly:false}),/AUTONOMY_REPORT_INVALID/);
});
function bucket(){
 const entries=new Map();
 return {entries,async get(key){const row=entries.get(key);return row?{etag:row.etag,json:async()=>row.value}:null},
 async put(key,body,opts){const row=entries.get(key),condition=opts.onlyIf;
  if(row&&(condition.etagMatches!==row.etag)||!row&&(condition.etagDoesNotMatch!=='*'))return null;
  const next={value:JSON.parse(body),etag:String((row?.value.count||0)+1)};
  entries.set(key,next);return {etag:next.etag};
 }};
}
test('pilot budget permits at most two inference reservations per UTC day',async()=>{
 const b=bucket(),now=()=>Date.parse('2026-11-18T01:00:00Z');
 assert.deepEqual(await claimAutonomyInferenceBudget(b,now),{allowed:true,remaining:1});
 assert.deepEqual(await claimAutonomyInferenceBudget(b,now),{allowed:true,remaining:0});
 assert.deepEqual(await claimAutonomyInferenceBudget(b,now),{allowed:false,remaining:0});
 assert.equal(b.entries.size,1);
});
test('quota store unavailable or race conflict fails closed',async()=>{
 await assert.rejects(claimAutonomyInferenceBudget(null),/AUTONOMY_QUOTA_STORE_UNAVAILABLE/);
 await assert.rejects(claimAutonomyInferenceBudget({get:async()=>null,put:async()=>null}),
  /AUTONOMY_QUOTA_CONFLICT/);
});
