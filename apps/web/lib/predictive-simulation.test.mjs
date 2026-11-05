import test from 'node:test';
import assert from 'node:assert/strict';
import {runMonteCarlo, validateScenario, percentile} from './predictive-simulation.mjs';

const assumptions={demand:100,capacity:120,price:2500,unitCost:1700,fixedCost:50000,openingCash:200000,capex:10000,volatilityPct:18,horizonMonths:12,iterations:1000,seed:42};
test('scenario simulation is deterministic, bounded and has monotonic confidence quantiles',()=>{
 const first=runMonteCarlo(assumptions);
 assert.deepEqual(first,runMonteCarlo(assumptions));
 assert.equal(first.months.length,12);
 assert.equal(first.sourceClass,'USER_ASSUMPTIONS_SIMULATION');
 for(const m of first.months){
  assert.ok(m.p10<=m.p50&&m.p50<=m.p90);
  assert.ok([m.p10,m.p50,m.p90].every(Number.isFinite));
 }
 assert.ok(first.probabilityPositive>=0&&first.probabilityPositive<=1);
});
test('zero uncertainty produces exact deterministic contribution and investment math',()=>{
 const model=runMonteCarlo({...assumptions,volatilityPct:0,iterations:100,horizonMonths:1});
 // 100 units*(2500-1700) - 50000 -10000 = 20000; cash starts 200000.
 assert.equal(model.months[0].p50,220000);
 assert.equal(model.months[0].p10,220000);
 assert.equal(model.months[0].p90,220000);
});
test('simulation rejects unset, NaN, unsafe, negative costs, excessive horizon and excessive iterations',()=>{
 for(const bad of [
  {...assumptions,price:null},{...assumptions,price:NaN},{...assumptions,unitCost:-1},
  {...assumptions,demand:-1},{...assumptions,horizonMonths:25},
  {...assumptions,iterations:20000},{...assumptions,volatilityPct:400},
 ])assert.throws(()=>validateScenario(bad));
});
test('percentile interpolation is ordered and does not interpolate empty input',()=>{
 assert.equal(percentile([0,10,20],.5),10);
 assert.equal(percentile([0,10],.25),2.5);
 assert.throws(()=>percentile([],.5));
});
