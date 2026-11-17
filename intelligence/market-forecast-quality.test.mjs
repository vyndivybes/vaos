import test from 'node:test';
import assert from 'node:assert/strict';
import {backtestPublicIndicator} from './market-series-forecast.mjs';
const series=Array.from({length:10},(_,i)=>({year:2015+i,value:20+(i%3)*2+i*0.15}));
test('returns out-of-sample fold errors, RMSE, and a labeled non-calibrated error band',()=>{
 const x=backtestPublicIndicator(series,{source:'SOURCE_OBSERVED',unit:'PERCENT'});
 assert.equal(x.status,'BACKTESTED_INDICATOR_EXTRAPOLATION');
 assert.equal(x.foldErrors.length,3);
 assert.ok(Number.isFinite(x.backtestRMSE));
 assert.ok(Number.isFinite(x.baselineRMSE));
 assert.equal(x.empiricalErrorBand.method,'MAX_ABSOLUTE_ROLLING_ERROR_3_FOLDS');
 assert.equal(x.empiricalErrorBand.coverageCertified,false);
 assert.ok(x.empiricalErrorBand.lower<=x.nextValue && x.empiricalErrorBand.upper>=x.nextValue);
 assert.equal(x.productionForecastCertified,false);
});
test('unqualified series provides no invented intervals',()=>{
 const x=backtestPublicIndicator(series.slice(0,3));
 assert.equal(x.status,'HOLD');
 assert.equal(x.empiricalErrorBand,null);
});