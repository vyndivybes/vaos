// Deterministic, assumption-driven cash planning; NEVER an audited or certified forecast.
// Only an authenticated, reconciled VAOS financial scorecard can supply opening cash.
const validMoney=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e11;
const round=value=>Math.round((value+Number.EPSILON)*100)/100;
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
 Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const unavailable=reason=>Object.freeze({status:'HOLD',reason,readOnly:true,approved:false,scenarios:[]});

export function project13WeekCash({statement,assumptions,asOf=new Date().toISOString().slice(0,10)}={}){
 if(statement?.schemaVersion!=='VAOS_FINANCIAL_SCORECARD_V1'||statement?.readOnly!==true||
    statement?.status!=='POSTED_ACTUALS'||statement?.source!=='VYNDI_OS_POSTED_FINANCIAL_STATEMENTS'||
    !validMoney(statement.closingCashInr)||!validDay(statement.to))
  return unavailable('Qualified posted, reconciled closing cash is required. No financial amount is inferred.');
 if(!validDay(asOf))throw Error('CASH_SCENARIO_DATE_INVALID');
 const age=(Date.parse(asOf+'T00:00:00Z')-Date.parse(statement.to+'T00:00:00Z'))/86400000;
 if(age<0||age>14)
  return unavailable('The closing-cash period must end within the last 14 days. Refresh to current financial actuals.');
 const fields=['weeklyReceiptsInr','weeklyOperatingPaymentsInr','weeklyCapexInr','shockPct'];
 if(!assumptions||fields.some(k=>!Object.hasOwn(assumptions,k)))
  throw Error('CASH_SCENARIO_ASSUMPTIONS_REQUIRED');
 const {weeklyReceiptsInr,weeklyOperatingPaymentsInr,weeklyCapexInr,shockPct}=assumptions;
 if([weeklyReceiptsInr,weeklyOperatingPaymentsInr,weeklyCapexInr].some(v=>!validMoney(v)||v<0||v>1e10)||
    !Number.isFinite(shockPct)||shockPct<0||shockPct>100)
  throw Error('CASH_SCENARIO_ASSUMPTIONS_INVALID');
 const shock=shockPct/100;
 const variants=[
  {id:'BASE',receiptsFactor:1,paymentsFactor:1},
  {id:'DOWNSIDE',receiptsFactor:1-shock,paymentsFactor:1+shock},
  {id:'UPSIDE',receiptsFactor:1+shock,paymentsFactor:1-shock},
 ];
 const scenarios=variants.map(variant=>{
  let closing=statement.closingCashInr,firstDeficitWeek=closing<0?0:null;
  const rows=Array.from({length:13},(_,i)=>{
   const openingInr=round(closing);
   const receiptsInr=round(weeklyReceiptsInr*variant.receiptsFactor);
   const paymentsInr=round(weeklyOperatingPaymentsInr*variant.paymentsFactor);
   const capexInr=round(weeklyCapexInr);
   closing=round(openingInr+receiptsInr-paymentsInr-capexInr);
   if(firstDeficitWeek===null&&closing<0)firstDeficitWeek=i+1;
   const weekEnding=new Date(Date.parse(statement.to+'T00:00:00Z')+(i+1)*7*86400000).toISOString().slice(0,10);
   return {week:i+1,weekEnding,openingInr,receiptsInr,paymentsInr,capexInr,closingInr:closing};
  });
  return {id:variant.id,rows,endingCashInr:closing,firstDeficitWeek};
 });
 return Object.freeze({status:'ILLUSTRATIVE_ONLY',readOnly:true,approved:false,
  certifiedForecast:false,source:'VAOS_RECONCILED_CLOSING_CASH_PLUS_MANUAL_ASSUMPTIONS',
  sourceThrough:statement.to,openingCashInr:statement.closingCashInr,
  assumptions:{...assumptions},scenarios,
  limitations:'Fixed weekly assumptions; excludes payment dates, receivables ageing, supplier lead times, taxes, debt and bank reconciliation after the selected statement date. Not a liquidity certification or spending authorization.'});
}
