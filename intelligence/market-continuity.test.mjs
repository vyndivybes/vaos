import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateContinuityStress} from './market-continuity.mjs';
const base=()=>({currency:'INR',unit:'framesets',sellingPrice:55000,variableCost:36000,monthlyFixedCost:200000,monthlyUnits:{bear:6,base:12,bull:20}});
const shock=()=>({cashReserve:400000,demandDropPct:25,variableCostIncreasePct:20,supplierRecoveryDays:15,inventoryCoverDays:5,recoveryCost:50000});
test('stress applies price-safe base unit sales, demand shock, inventory coverage and cost inflation',()=>{
 const x=evaluateContinuityStress(base(),shock());
 assert.equal(x.exposureDays,10);
 assert.equal(x.modeledInterruptionDays,10);
 assert.equal(x.stressedUnits,6);
 assert.equal(x.stressedUnitVariableCost,43200);
 assert.equal(x.recurringMonthlySurplus,-129200);
 assert.equal(x.firstMonthSurplus,-179200);
 assert.equal(x.cashAfterRecovery,350000);
 assert.equal(x.cashCoverageMonths,2.71);
 assert.equal(x.qualification,'ASSUMPTION_ONLY_NOT_FORECAST');
 assert.equal(x.actionAuthorized,false);
});
test('runway is not fabricated for a positive recurring monthly surplus',()=>{
 const x=evaluateContinuityStress(base(),{cashReserve:1000000,demandDropPct:0,variableCostIncreasePct:0,supplierRecoveryDays:0,inventoryCoverDays:0,recoveryCost:0});
 assert.equal(x.recurringMonthlySurplus,28000);
 assert.equal(x.cashCoverageMonths,null);
 assert.equal(x.fundingHold,false);
});
test('unfunded recovery and downtime beyond one month are visible',()=>{
 const x=evaluateContinuityStress(base(),{cashReserve:10000,demandDropPct:0,variableCostIncreasePct:0,supplierRecoveryDays:90,inventoryCoverDays:0,recoveryCost:20000});
 assert.equal(x.modeledInterruptionDays,30);
 assert.equal(x.stressedUnits,0);
 assert.equal(x.fundingHold,true);
 assert.equal(x.cashCoverageMonths,0);
});
test('rejects unbounded, fractional, negative and malformed assumptions',()=>{
 for(const change of [{demandDropPct:101},{cashReserve:-1},{supplierRecoveryDays:1.5},{inventoryCoverDays:91},{recoveryCost:Infinity},{variableCostIncreasePct:'20'}]){
  assert.throws(()=>evaluateContinuityStress(base(),{...shock(),...change}),/CONTINUITY_STRESS_INVALID/);
 }
 assert.throws(()=>evaluateContinuityStress(null,shock()),/CONTINUITY_STRESS_INVALID/);
});
