import test from 'node:test';
import assert from 'node:assert/strict';
import {backtestPublicIndicator} from './market-series-forecast.mjs';
const series=Array.from({length:10},(_,i)=>({year:2016+i,value:3+i*0.3}));
test('a sourced annual series yields bounded reproducible walk-forward backtest',()=>{
 const x=backtestPublicIndicator(series,{source:'WORLD_BANK_V2',indicator:'NY.GDP.MKTP.KD.ZG',unit:'PERCENT_ANNUAL'});
 assert.equal(x.status,'BACKTESTED_INDICATOR_EXTRAPOLATION');
 assert.equal(x.inputYears,10);
 assert.ok(Number.isFinite(x.backtestMAE));
 assert.ok(Number.isFinite(x.nextValue));
 assert.equal(x.nextYear,2026);
 assert.equal(x.demandForecastQualified,false);
 assert.equal(x.forecastQualified,false);
 assert.equal(x.independentlyReconciled,false);
});
test('short, missing-year or duplicated periods are always HOLD',()=>{
 for(const x of [series.slice(0,5),series.filter(x=>x.year!==2019),[...series,series[9]]]){
  assert.equal(backtestPublicIndicator(x).status,'HOLD');
 }
});
test('non-finite observations fail closed rather than inventing data',()=>{
 assert.equal(backtestPublicIndicator(series.map((x,i)=>i===4?{...x,value:Infinity}:x)).status,'HOLD');
});
