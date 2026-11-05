import test from 'node:test';
import assert from 'node:assert/strict';
import {project13WeekCash} from './cash-scenario.mjs';

const actual={schemaVersion:'VAOS_FINANCIAL_SCORECARD_V1',readOnly:true,
 status:'POSTED_ACTUALS',source:'VYNDI_OS_POSTED_FINANCIAL_STATEMENTS',
 to:'2026-11-05',closingCashInr:1000};
const inputs={weeklyReceiptsInr:100,weeklyOperatingPaymentsInr:150,
 weeklyCapexInr:10,shockPct:20};
test('13-week cash planner is arithmetic on explicitly supplied hypotheses, never a certified forecast',()=>{
 const r=project13WeekCash({statement:actual,assumptions:inputs,asOf:'2026-11-05'});
 assert.equal(r.status,'ILLUSTRATIVE_ONLY');
 assert.equal(r.approved,false);
 assert.equal(r.certifiedForecast,false);
 assert.equal(r.openingCashInr,1000);
 assert.deepEqual(r.scenarios.map(x=>x.id),['BASE','DOWNSIDE','UPSIDE']);
 assert.ok(r.scenarios.every(x=>x.rows.length===13));
 assert.deepEqual(r.scenarios.map(x=>x.rows[0].closingInr),[940,890,990]);
 assert.equal(r.scenarios[0].rows[0].weekEnding,'2026-11-12');
 assert.equal(r.scenarios[0].rows[12].closingInr,220);
 assert.equal(r.scenarios[1].firstDeficitWeek,10);
 assert.equal(r.scenarios[2].firstDeficitWeek,null);
});
test('unqualified, missing, stale or future ledger cash is always HOLD, never estimated or zeroed',()=>{
 for(const statement of [null,{...actual,status:'NO_POSTED_ACTIVITY'}, {...actual,closingCashInr:null},
  {...actual,source:'SYNTHETIC'},{...actual,to:'2026-10-01'}]){
  const r=project13WeekCash({statement,assumptions:inputs,asOf:'2026-11-05'});
  assert.equal(r.status,'HOLD');
  assert.deepEqual(r.scenarios,[]);
  assert.equal(Object.hasOwn(r,'openingCashInr'),false);
 }
 assert.equal(project13WeekCash({statement:{...actual,to:'2026-11-06'},assumptions:inputs,asOf:'2026-11-05'}).status,'HOLD');
});
test('invalid money, missing assumptions, non-numbers and extreme shock cannot become projections',()=>{
 for(const a of [null,{}, {...inputs,weeklyReceiptsInr:-1},
  {...inputs,weeklyCapexInr:NaN}, {...inputs,shockPct:101},
  {...inputs,weeklyOperatingPaymentsInr:'100'}, {...inputs,shockPct:Infinity}]){
  assert.throws(()=>project13WeekCash({statement:actual,assumptions:a,asOf:'2026-11-05'}),/CASH_SCENARIO_ASSUMPTIONS/);
 }
});
test('zero-plan and negative signed cash are displayed as hypotheses without asserting solvency',()=>{
 const r=project13WeekCash({statement:{...actual,closingCashInr:-100},
 assumptions:{weeklyReceiptsInr:0,weeklyOperatingPaymentsInr:0,weeklyCapexInr:0,shockPct:0},
 asOf:'2026-11-05'});
 assert.ok(r.scenarios.every(x=>x.endingCashInr===-100&&x.firstDeficitWeek===0));
});
