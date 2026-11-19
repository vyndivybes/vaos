import test from 'node:test';
import assert from 'node:assert/strict';
import {assessJarvisA04HistoricalReplay} from './jarvis-a04-historical-replay.mjs';

const series=(n=12,fn=i=>2+(i%4)*0.8+i*0.12)=>
 Array.from({length:n},(_,i)=>({year:2014+i,value:fn(i),
  observedFrom:'WORLD_BANK_INDICATOR_API',unit:'PERCENT_ANNUAL',
  privateRowKey:'PRIVATE-SUPPLIER-IDENTITY'}));
function evidence(gdp=series(),inflation=series(12,i=>3+(i%3)-i*0.08)){
 return {
  schemaVersion:'VAOS_MARKET_PUBLIC_EVIDENCE_V1',
  collectedAt:'2026-11-19T06:40:00.000Z',actionAuthorized:false,readOnly:true,
  demandForecastQualified:false,sourceQualification:'UPSTREAM_RECORDS_NOT_INDEPENDENTLY_RECONCILED',
  worldBank:{
   gdp:{status:'OBSERVED',source:'WORLD_BANK_V2',indicator:'NY.GDP.MKTP.KD.ZG',
    unit:'PERCENT_ANNUAL',series:gdp},
   inflation:{status:'OBSERVED',source:'WORLD_BANK_V2',indicator:'FP.CPI.TOTL.ZG',
    unit:'PERCENT_ANNUAL',series:inflation}
  },
  privateRawDocument:'PRIVATE-SUPPLIER-ACCOUNT'
 };
}
test('A04 nested rolling-origin uses four strictly unseen outer years and two earlier-year inner model-selection folds',()=>{
 const a=assessJarvisA04HistoricalReplay(evidence());
 assert.equal(a.schemaVersion,'VAOS_JARVIS_A04_HISTORICAL_REPLAY_V1');
 assert.equal(a.stage,'A04');
 assert.equal(a.status,'HOLD');
 assert.equal(a.evidenceStatus,'TWO_INDICATORS_REPLAYED');
 assert.equal(a.productionForecastCertified,false);
 assert.equal(a.productionWritesAuthorized,false);
 assert.equal(a.actionAuthorized,false);
 assert.equal(a.modelCalls,0);
 assert.equal(a.indicators.gdp.status,'HISTORICAL_REPLAY');
 for(const indicator of [a.indicators.gdp,a.indicators.inflation]){
  assert.equal(indicator.outerFolds,4);
  assert.equal(indicator.innerSelectionFolds,2);
  assert.equal(indicator.selectionMethod,'TRAINING_ONLY_NESTED_ROLLING_ORIGIN');
  assert.equal(indicator.folds.length,4);
  assert.deepEqual(indicator.folds.map(f=>f.year),[2022,2023,2024,2025]);
  assert.deepEqual(indicator.folds.map(f=>f.trainEndYear),[2021,2022,2023,2024]);
  assert.ok(indicator.folds.every(f=>['LAST_OBSERVATION','MOVING_AVERAGE_3'].includes(f.model)));
  assert.ok(indicator.folds.every(f=>f.trainEndYear<f.year&&f.selectionHistoryEndYear===f.trainEndYear));
  assert.ok(indicator.folds.every(f=>f.bandHalfWidth>=0));
  assert.equal(indicator.calibration.coverageCertified,false);
  assert.equal(indicator.calibration.nominalCoverage,null);
  assert.ok(indicator.calibration.observedCoverage>=0&&indicator.calibration.observedCoverage<=1);
  assert.ok(Number.isFinite(indicator.backtestRMSE)&&Number.isFinite(indicator.baselineRMSE));
 }
 assert.ok(!JSON.stringify(a).includes('PRIVATE-'));
 assert.ok(!JSON.stringify(a).includes('observedFrom'));
 assert.ok(!JSON.stringify(a).includes('privateRawDocument'));
});
test('A04 future holdout cannot influence the model chosen or band for THAT holdout (no selection leakage)',()=>{
 const a=evidence();
 const baseline=assessJarvisA04HistoricalReplay(a).indicators.gdp.folds;
 const changed=evidence();
 changed.worldBank.gdp.series[8].value=994;
 const replay=assessJarvisA04HistoricalReplay(changed).indicators.gdp.folds;
 assert.equal(replay[0].model,baseline[0].model);
 assert.equal(replay[0].bandHalfWidth,baseline[0].bandHalfWidth);
 assert.equal(replay[0].trainEndYear,baseline[0].trainEndYear);
 assert.notEqual(replay[0].absoluteError,baseline[0].absoluteError);
 assert.equal(replay[0].baselineAbsError>100,true);
});
test('A04 exact training-only naive baseline is separately reported, never silently treated as calibrated coverage',()=>{
 const z=evidence(series(12,i=>i*10+1),series(12,i=>i*5-2));
 const out=assessJarvisA04HistoricalReplay(z).indicators.gdp;
 assert.equal(out.status,'HISTORICAL_REPLAY');
 assert.equal(out.folds[0].baselineAbsError,10);
 assert.equal(out.folds[0].trainEndYear,2021);
 assert.ok(out.folds.every(x=>Number.isFinite(x.absoluteError)&&Number.isFinite(x.innerSelectionMAE)));
 assert.ok(Number.isFinite(out.backtestMAE)&&Number.isFinite(out.baselineMAE));
 assert.equal(out.calibration.independentExternalCalibrationVerified,false);
});
test('A04 holds on missing, stale, forged, malformed or non-consecutive World Bank observations',()=>{
 const variants=[
  evidence(series(9)),evidence(series(12,(i)=>i).map((r,i)=>i===5?{...r,year:2018}:r)),
  evidence(series(12).map((r,i)=>i===7?{...r,value:NaN}:r)),
  evidence(series(12).map((r,i)=>i===7?{...r,unit:'USD'}:r)),
  evidence(series(12).map((r,i)=>i===7?{...r,observedFrom:'PRIVATE_SOURCE'}:r)),
  evidence(series(12).map((r,i)=>i===7?{...r,year:2035}:r)),
  evidence(series(12).map((r,i)=>({...r,year:2000+i}))),
 ];
 for(const x of variants){
  const r=assessJarvisA04HistoricalReplay(x);
  assert.equal(r.indicators.gdp.status,'HOLD');
  assert.equal(r.indicators.gdp.folds.length,0);
  assert.equal(r.status,'HOLD');
  assert.equal(r.evidenceStatus,'PARTIAL_OR_UNAVAILABLE');
  assert.equal(r.actionAuthorized,false);
 }
 for(const changes of [
  {actionAuthorized:true},
  {schemaVersion:'PRIVATE_FORGED'},
  {sourceQualification:'INDEPENDENTLY_CERTIFIED'},
  {collectedAt:'2026-02-30T06:40:00Z'}
 ]){
  const r=assessJarvisA04HistoricalReplay({...evidence(),...changes});
  assert.equal(r.evidenceStatus,'NO_QUALIFIED_EVIDENCE');
  assert.equal(r.indicators.gdp.status,'HOLD');
  assert.equal(r.indicators.inflation.status,'HOLD');
 }
});
test('A04 must not assert demand, buyer forecasts, interventions, learning or enterprise A04 acceptance',()=>{
 const a=assessJarvisA04HistoricalReplay(evidence());
 assert.equal(a.demandForecastQualified,false);
 assert.equal(a.customerSalesForecastQualified,false);
 assert.equal(a.independentlyReplicated,false);
 assert.equal(a.sourceRevisionCertified,false);
 assert.equal(a.selfLearningEnabled,false);
 assert.equal(a.autonomousPlanAuthorized,false);
 assert.equal(a.currentA04Gate,'HOLD');
});
