import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyForecastHistory,buildPlanningCycle} from './business-planning-cycle.mjs';

const obs=(domain,count,status='OBSERVED')=>({domain,status,
 ...(status==='OBSERVED'?{observation:{recordsObserved:count,summary:count+' '+domain+' recent rows'}}:{})});
test('current 50-row business observations cannot masquerade as an actual time-series forecast',()=>{
 const r=qualifyForecastHistory({monthlyHistory:null,sourceQualified:false});
 assert.equal(r.qualified,false);
 assert.ok(r.holds.includes('VERIFIED_TIME_SERIES_REQUIRED'));
 assert.ok(r.holds.includes('PERIOD_COMPLETENESS_UNVERIFIED'));
 assert.equal(r.projection,null);
});
test('history must be signed, reconciled, 12 complete non-duplicated closed consecutive months',()=>{
 const dates=Array.from({length:12},(_,i)=>new Date(Date.UTC(2025,i+9,1)).toISOString().slice(0,7));
 const months=dates.map((period,i)=>({period,units:3+i}));
 const hold1=qualifyForecastHistory({monthlyHistory:months,sourceQualified:true,reconciled:false,complete:true,asOf:'2026-10-13'});
 assert.equal(hold1.qualified,false);
 assert.ok(hold1.holds.includes('RECONCILIATION_REQUIRED'));
 const withCurrent=[...months];withCurrent[11]={period:'2026-10',units:14};
 const hold2=qualifyForecastHistory({monthlyHistory:withCurrent,sourceQualified:true,reconciled:true,complete:true,asOf:'2026-10-13'});
 assert.equal(hold2.qualified,false); // includes current Oct partial and one missing contiguous period under strict gate
 const approved=Array.from({length:12},(_,i)=>({period:new Date(Date.UTC(2025,i+9,1)).toISOString().slice(0,7),units:3+i}));
 approved[11].period='2026-08'; // duplicated period / missing month must hold
 assert.equal(qualifyForecastHistory({monthlyHistory:approved,sourceQualified:true,reconciled:true,complete:true,asOf:'2026-10-13'}).qualified,false);
});
test('closed, signed, contiguous history enables baseline-only indicative projection with safety limits',()=>{
 const history=Array.from({length:12},(_,i)=>({period:new Date(Date.UTC(2025,9+i,1)).toISOString().slice(0,7),units:2+i%3}));
 const r=qualifyForecastHistory({monthlyHistory:history,sourceQualified:true,reconciled:true,complete:true,asOf:'2026-10-13'});
 assert.equal(r.qualified,true);
 assert.equal(r.projection?.method,'TRAILING_3_MONTH_BASELINE');
 assert.equal(r.projection?.months,6);
 assert.equal(r.projection?.unit,'ordered_units');
 assert.ok(r.projection?.perMonth>=2&&r.projection?.perMonth<=4);
 assert.equal(r.projection?.approved,false);
});
test('negative, duplicate, nonconsecutive, stale and future months fail closed',()=>{
 const baseline=Array.from({length:12},(_,i)=>({period:new Date(Date.UTC(2025,9+i,1)).toISOString().slice(0,7),units:5}));
 const config={sourceQualified:true,reconciled:true,complete:true,asOf:'2026-10-13'};
 for(const mutation of [
  x=>x[4].units=-1,x=>x[5].period=x[4].period,x=>x[5].period='2025-02',
  x=>x[10].units=1.5,x=>x[1].period='2029-01'
 ]){
  const rows=structuredClone(baseline);mutation(rows);
  assert.equal(qualifyForecastHistory({...config,monthlyHistory:rows}).qualified,false);
 }
});
test('planning loop ranks source HOLD before recommendations and never authorizes execution',()=>{
 const r=buildPlanningCycle({question:'Plan our bicycle procurement better',
  observations:[obs('procurement',47),obs('inventory',0,'HOLD'),obs('production',4)]});
 assert.equal(r.authority,'READ_ONLY_ADVISORY');
 assert.equal(r.actionAuthorized,false);
 assert.equal(r.state,'EVIDENCE_INCOMPLETE');
 assert.ok(r.holds.includes('INVENTORY_SOURCE_HOLD'));
 assert.match(r.priority,/reconcile/i);
 assert.equal(r.steps.length,4);
 assert.deepEqual(r.steps.map(x=>x.phase),['VERIFY','DIAGNOSE','COMPARE','DECIDE']);
 assert.ok(r.steps.every(x=>x.owner==='FOUNDER_REVIEW'&&x.mode==='ADVISORY_ONLY'));
 assert.ok(r.risks.includes('SHORTAGES_NOT_QUANTIFIED'));
});
test('production and group plans highlight engineering release and internal elimination',()=>{
 const a=buildPlanningCycle({question:'Recommend better group strategy',
  observations:[obs('finance',6),obs('commercial',5),obs('procurement',47),obs('production',4)]});
 assert.ok(a.holds.includes('GROUP_ELIMINATION_UNVERIFIED'));
 assert.ok(a.holds.includes('CASH_BALANCE_UNVERIFIED'));
 const b=buildPlanningCycle({question:'Better production plan',observations:[obs('production',4),obs('procurement',47)]});
 assert.ok(b.risks.includes('ENGINEERING_RELEASE_UNVERIFIED'));
 assert.equal(b.actionAuthorized,false);
});
test('no evidence returns a plan to source data rather than a confident go-live claim',()=>{
 const r=buildPlanningCycle({question:'Plan finance',observations:[obs('finance',0,'HOLD')]});
 assert.equal(r.state,'EVIDENCE_INCOMPLETE');
 assert.match(r.priority,/source records|verify/i);
 assert.ok(!JSON.stringify(r).includes('qualified forecast'));
});
