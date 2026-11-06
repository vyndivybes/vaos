/** Historical indicator extrapolation with rolling-origin backtest.
 * NOT a commercial demand forecast; no independent reconciliation implied.
 */
const hold=(reason='SERIES_NOT_QUALIFIED')=>({
 status:'HOLD',reason,nextValue:null,backtestMAE:null,
 demandForecastQualified:false,forecastQualified:false,independentlyReconciled:false,
 actionAuthorized:false
});
const round=n=>Math.round((n+Number.EPSILON)*10000)/10000;
const mean=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
export function backtestPublicIndicator(series,{source='UNSPECIFIED',indicator='UNSPECIFIED',unit='UNSPECIFIED'}={}){
 if(!Array.isArray(series)||series.length<8||series.length>30)return hold('MIN_EIGHT_CONSECUTIVE_OBSERVATIONS');
 const sorted=[...series].sort((a,b)=>a.year-b.year);
 for(let i=0;i<sorted.length;i++){
  const p=sorted[i];
  if(!p||!Number.isInteger(p.year)||p.year<2000||p.year>2100||typeof p.value!=='number'||
   !Number.isFinite(p.value)||Math.abs(p.value)>1e12)return hold('INVALID_OBSERVATION');
  if(i&&p.year!==sorted[i-1].year+1)return hold('NONCONSECUTIVE_OBSERVATIONS');
 }
 const observations=sorted.map(x=>x.value);
 const score=model=>{
  const errors=[];
  for(let i=sorted.length-3;i<sorted.length;i++){
   const prediction=model(observations.slice(0,i));
   errors.push(Math.abs(prediction-observations[i]));
  }
  return round(mean(errors));
 };
 const naive=xs=>xs[xs.length-1],moving=xs=>mean(xs.slice(-3));
 const naiveMAE=score(naive),movingMAE=score(moving);
 const selected=movingMAE<naiveMAE?'MOVING_AVERAGE_3':'LAST_OBSERVATION';
 const predicted=(selected==='MOVING_AVERAGE_3'?moving:naive)(observations);
 return {status:'BACKTESTED_INDICATOR_EXTRAPOLATION',source,indicator,unit,
  model:selected,inputYears:sorted.length,firstYear:sorted[0].year,lastYear:sorted.at(-1).year,
  nextYear:sorted.at(-1).year+1,nextValue:round(predicted),
  backtestMAE:Math.min(movingMAE,naiveMAE),baselineMAE:naiveMAE,folds:3,
  limitations:'Single-step rolling holdout, no exogenous drivers, intervals, independent replication, survey coverage or verified customer demand.',
  demandForecastQualified:false,forecastQualified:false,independentlyReconciled:false,actionAuthorized:false};
}
