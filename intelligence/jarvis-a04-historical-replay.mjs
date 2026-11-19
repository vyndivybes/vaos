/**
 * A04 historical indicator replay, not a production demand or financial forecast.
 *
 * The previous three-fold public indicator panel selected a model on the
 * *same* folds it then scored. Here each OUTER holdout's model and empirical
 * band are selected solely by two INNER folds ending before that holdout.
 * This removes model-selection look-ahead for the outer test. Four annual
 * holdouts remain too few to certify accuracy or interval coverage.
 *
 * No network, storage, LLM, scheduler or enterprise business action.
 */
const KINDS=Object.freeze({
 gdp:Object.freeze({indicator:'NY.GDP.MKTP.KD.ZG',unit:'PERCENT_ANNUAL'}),
 inflation:Object.freeze({indicator:'FP.CPI.TOTL.ZG',unit:'PERCENT_ANNUAL'})
});
const MODELS=Object.freeze({
 LAST_OBSERVATION:xs=>xs.at(-1),
 MOVING_AVERAGE_3:xs=>(xs.at(-1)+xs.at(-2)+xs.at(-3))/3
});
const round=x=>Math.round((x+Number.EPSILON)*10000)/10000;
const mean=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
const rmse=xs=>round(Math.sqrt(mean(xs.map(x=>x*x))));
const bad=(reason='UPSTREAM_PROVENANCE_UNQUALIFIED')=>Object.freeze({
 status:'HOLD',reason,outerFolds:0,innerSelectionFolds:0,
 folds:Object.freeze([]),calibration:null,backtestMAE:null,
 baselineMAE:null,backtestRMSE:null,baselineRMSE:null,
 sourceRevisionVerified:false,productionForecastCertified:false
});
function validUtc(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))
  return false;
 const ms=Date.parse(value);
 return Number.isFinite(ms)&&new Date(ms).toISOString()===value.replace(/(?:\.([0-9]{1,3}))?Z$/,(_m,f)=>'.'+(f||'').padEnd(3,'0')+'Z');
}
function evalIndicator(kind,entry,collectedYear){
 const config=KINDS[kind];
 if(entry?.status!=='OBSERVED'||entry?.source!=='WORLD_BANK_V2'||
  entry?.indicator!==config.indicator||entry?.unit!==config.unit||
  !Array.isArray(entry.series))
  return bad();
 const src=entry.series;
 if(src.length<10||src.length>20)return bad('MIN_TEN_ANNUAL_OBSERVATIONS_REQUIRED');
 const years=src.map(x=>x?.year);
 if(src.some((x,i)=>!x||typeof x!=='object'||Array.isArray(x)||
   !Number.isInteger(x.year)||x.year<2000||x.year>2100||
   (i>0&&x.year!==src[i-1].year+1)||
   typeof x.value!=='number'||!Number.isFinite(x.value)||Math.abs(x.value)>1e6||
   x.observedFrom!=='WORLD_BANK_INDICATOR_API'||x.unit!=='PERCENT_ANNUAL'))
  return bad('MALFORMED_OR_UNVERIFIED_OBSERVATIONS');
 const lastYear=years.at(-1);
 if(lastYear>collectedYear||lastYear<collectedYear-3)
  return bad('HISTORICAL_WINDOW_NOT_CURRENT');
 const values=src.map(x=>x.value);
 const folds=[];
 // OUTER folds start only after 8 training points (10 is minimum).
 for(let i=values.length-4;i<values.length;i++){
  const training=values.slice(0,i);
  const innerYears=[training.length-2,training.length-1];
  const history=(fn)=>innerYears.map(k=>Math.abs(training[k]-fn(training.slice(0,k))));
  const naiveInner=history(MODELS.LAST_OBSERVATION);
  const movingInner=history(MODELS.MOVING_AVERAGE_3);
  // Pre-register the tie breaker. The held-out actual is NOT available here.
  const model=mean(movingInner)<mean(naiveInner)-1e-12?'MOVING_AVERAGE_3':'LAST_OBSERVATION';
  const innerErrors=model==='MOVING_AVERAGE_3'?movingInner:naiveInner;
  const predicted=MODELS[model](training);
  const error=values[i]-predicted;
  const baselineError=values[i]-MODELS.LAST_OBSERVATION(training);
  const width=Math.max(...innerErrors);
  folds.push(Object.freeze({
   year:years[i],trainEndYear:years[i-1],selectionHistoryEndYear:years[i-1],
   model,trainSize:i,innerSelectionMAE:round(mean(innerErrors)),
   bandHalfWidth:round(width),
   insidePreHoldoutBand:Math.abs(error)<=width+1e-9,
   signedError:round(error),absoluteError:round(Math.abs(error)),
   baselineAbsError:round(Math.abs(baselineError))
  }));
 }
 const errors=folds.map(x=>x.signedError);
 const baselineErrors=folds.map(x=>x.baselineAbsError);
 const observedCoverage=round(folds.filter(x=>x.insidePreHoldoutBand).length/folds.length);
 return Object.freeze({
  status:'HISTORICAL_REPLAY',
  source:'WORLD_BANK_V2',
  indicator:config.indicator,unit:'PERCENT_ANNUAL',
  firstYear:years[0],lastYear,
  selectionMethod:'TRAINING_ONLY_NESTED_ROLLING_ORIGIN',
  outerFolds:4,innerSelectionFolds:2,
  folds:Object.freeze(folds),
  backtestMAE:round(mean(folds.map(x=>x.absoluteError))),
  baselineMAE:round(mean(baselineErrors)),
  backtestRMSE:rmse(errors),baselineRMSE:rmse(baselineErrors),
  calibration:Object.freeze({
   method:'PRE_HOLDOUT_MAX_INNER_ABSOLUTE_ERROR',
   observedCoverage,nominalCoverage:null,
   coverageCertified:false,independentExternalCalibrationVerified:false,
   observations:4,statisticalPredictionInterval:false
  }),
  sourceRevisionVerified:false,productionForecastCertified:false
 });
}
const rejected=()=>Object.freeze({
 schemaVersion:'VAOS_JARVIS_A04_HISTORICAL_REPLAY_V1',
 stage:'A04',status:'HOLD',currentA04Gate:'HOLD',
 evidenceStatus:'NO_QUALIFIED_EVIDENCE',
 indicators:Object.freeze({gdp:bad(),inflation:bad()}),
 holds:Object.freeze(['OFFICIAL_HISTORICAL_SOURCE_REQUIRED','INDEPENDENT_OUT_OF_SAMPLE_REPLICATION_REQUIRED']),
 sourceRevisionCertified:false,independentlyReplicated:false,
 demandForecastQualified:false,customerSalesForecastQualified:false,
 productionForecastCertified:false,
 modelCalls:0,selfLearningEnabled:false,autonomousPlanAuthorized:false,
 productionWritesAuthorized:false,actionAuthorized:false,readOnly:true
});
export function assessJarvisA04HistoricalReplay(evidence){
 if(evidence?.schemaVersion!=='VAOS_MARKET_PUBLIC_EVIDENCE_V1'||
  evidence?.actionAuthorized!==false||evidence?.demandForecastQualified!==false||
  evidence?.sourceQualification!=='UPSTREAM_RECORDS_NOT_INDEPENDENTLY_RECONCILED'||
  evidence?.readOnly!==true||!validUtc(evidence.collectedAt)||
  !evidence.worldBank||typeof evidence.worldBank!=='object'||
  Array.isArray(evidence.worldBank))return rejected();
 const year=Number(evidence.collectedAt.slice(0,4));
 const indicators=Object.freeze({
  gdp:evalIndicator('gdp',evidence.worldBank.gdp,year),
  inflation:evalIndicator('inflation',evidence.worldBank.inflation,year)
 });
 const complete=Object.values(indicators).every(x=>x.status==='HISTORICAL_REPLAY');
 return Object.freeze({
  schemaVersion:'VAOS_JARVIS_A04_HISTORICAL_REPLAY_V1',
  stage:'A04',status:'HOLD',currentA04Gate:'HOLD',
  evidenceStatus:complete?'TWO_INDICATORS_REPLAYED':'PARTIAL_OR_UNAVAILABLE',
  indicators,
  holds:Object.freeze([
   ...(complete?[]:['WORLD_BANK_SERIES_INSUFFICIENT_OR_UNVERIFIED']),
   'INDEPENDENT_OUT_OF_SAMPLE_REPLICATION_REQUIRED',
   'SOURCE_REVISION_UNVERIFIED','FOUR_FOLD_CALIBRATION_NOT_CERTIFIED',
   'CUSTOMER_DEMAND_GROUND_TRUTH_ABSENT'
  ]),
  sourceRevisionCertified:false,independentlyReplicated:false,
  demandForecastQualified:false,customerSalesForecastQualified:false,
  productionForecastCertified:false,
  modelCalls:0,selfLearningEnabled:false,autonomousPlanAuthorized:false,
  productionWritesAuthorized:false,actionAuthorized:false,readOnly:true
 });
}
