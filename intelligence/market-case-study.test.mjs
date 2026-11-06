import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMarketCaseStudy,renderMarketCaseStudy} from './market-case-study.mjs';

const input=()=>({
 id:'BUSINESS-CASE-003', title:'VYNDI carbon frameset market entry',
 market:'India premium carbon road/endurance bicycles', asOf:'2026-11-06',
 evidence:[
  {title:'Bicycle manufacturing cost benchmark',publisher:'NITI Aayog',published:'2026-03-12',
   url:'https://niti.gov.in/sites/default/files/2026-03/Realising-the-Export-Potential-of-India-Sports-Equipment-Manufacturing-Sector.pdf',
   claim:'Sports bicycle manufacturing in India faces a sector-level 25–30 percent comparative cost disadvantage.',kind:'GOVERNMENT'},
  {title:'German bicycle market update',publisher:'ZIV',published:'2026-09-07',
   url:'https://www.ziv-zweirad.de/en/2026/09/07/ziv-half-year-review-2026/',
   claim:'German bicycle unit sales were up almost ten percent in the first half of 2026 year on year.',kind:'INDUSTRY'}
 ],
 model:{currency:'INR',unit:'framesets',sellingPrice:55000,variableCost:36000,
  monthlyFixedCost:200000,monthlyUnits:{bear:6,base:12,bull:20}}
});
test('analyzes scenario arithmetic and break even without representing estimates as actuals',()=>{
 const report=buildMarketCaseStudy(input());
 assert.equal(report.scenarios.bear.operatingSurplus,-86000);
 assert.equal(report.scenarios.base.operatingSurplus,28000);
 assert.equal(report.scenarios.bull.operatingSurplus,180000);
 assert.equal(report.unitEconomics.breakEvenUnits,11);
 assert.equal(report.unitEconomics.contributionPerUnit,19000);
 assert.equal(report.marketSizing.status,'HOLD');
 assert.equal(report.forecastQualified,false);
 assert.equal(report.actionAuthorized,false);
});
test('renders traceable claims and explicit limitations',()=>{
 const markdown=renderMarketCaseStudy(buildMarketCaseStudy(input()));
 assert.match(markdown,/BUSINESS-CASE-003/);
 assert.match(markdown,/niti.gov.in/);
 assert.match(markdown,/SCENARIO ONLY/);
 assert.match(markdown,/TAM\/SAM\/SOM unavailable/);
 assert.match(markdown,/before taxes, working capital/);
});
test('rejects unsupported dates, unsafe URLs, and stale or future claims',()=>{
 for(const patch of [
  {asOf:'garbage'}, {asOf:'2026-02-01'},
  {evidence:[{...input().evidence[0],url:'http://localhost/admin'}]},
  {evidence:[{...input().evidence[0],url:'https://user:secret@example.com/bad'}]}
 ]) assert.throws(()=>buildMarketCaseStudy({...input(),...patch}),/INVALID/);
});
test('rejects unbounded numbers and negative unit quantities',()=>{
 for(const patch of [
  {sellingPrice:Infinity},{variableCost:-1},{monthlyFixedCost:1e15},
  {monthlyUnits:{bear:3,base:-1,bull:20}}
 ])assert.throws(()=>buildMarketCaseStudy({...input(),model:{...input().model,...patch}}),/INVALID/);
});
test('negative contribution never reports a positive break even',()=>{
 const report=buildMarketCaseStudy({...input(),model:{...input().model,variableCost:60000}});
 assert.equal(report.unitEconomics.breakEvenUnits,null);
 assert.equal(report.scenarios.base.operatingSurplus,-260000);
 assert.equal(report.recommendation.status,'HOLD');
});
test('no sources or input economics does not invent a forecast',()=>{
 const report=buildMarketCaseStudy({...input(),evidence:[],model:null});
 assert.equal(report.evidence.length,0);
 assert.equal(report.modelStatus,'NO_ASSUMPTIONS');
 assert.equal(report.scenarios,null);
 assert.equal(report.recommendation.status,'HOLD');
});

test('zero selling price is invalid and missing sources cannot qualify a pilot',()=>{
 assert.throws(()=>buildMarketCaseStudy({...input(),
  model:{...input().model,sellingPrice:0}}),/INVALID/);
 const report=buildMarketCaseStudy({...input(),evidence:[]});
 assert.equal(report.recommendation.status,'HOLD');
});

test('business continuity stress propagates to archived report without action authority',()=>{
 const report=buildMarketCaseStudy({...input(),continuity:{
  cashReserve:400000,demandDropPct:25,variableCostIncreasePct:20,
  supplierRecoveryDays:15,inventoryCoverDays:5,recoveryCost:50000
 }});
 assert.equal(report.continuityStress.recurringMonthlySurplus,-129200);
 assert.equal(report.continuityStress.firstMonthSurplus,-179200);
 assert.equal(report.continuityStress.cashCoverageMonths,2.71);
 assert.equal(report.recommendation.status,'HOLD');
 assert.equal(report.forecastQualified,false);
 assert.equal(report.actionAuthorized,false);
 const markdown=renderMarketCaseStudy(report);
 assert.match(markdown,/Business continuity and supply-chain stress/);
 assert.match(markdown,/assumptions only/);
 assert.match(markdown,/No forecast certification or autonomous business action/);
});
test('continuity input requires a financial model and rejects malformed shocks',()=>{
 const continuity={cashReserve:1000,demandDropPct:5,variableCostIncreasePct:20,
  supplierRecoveryDays:20,inventoryCoverDays:5,recoveryCost:100};
 assert.throws(()=>buildMarketCaseStudy({...input(),model:null,continuity}),/CONTINUITY_STRESS_INVALID/);
 assert.throws(()=>buildMarketCaseStudy({...input(),continuity:{...continuity,demandDropPct:101}}),/CONTINUITY_STRESS_INVALID/);
});
