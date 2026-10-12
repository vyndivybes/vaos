/**
 * VAOS founder planning cycle and forecasting qualification.
 *
 * Does NOT create, approve, dispatch or change any business transaction.
 * An order count is not sufficient history for forecast certification.
 */
const DOMAINS=new Set(['finance','commercial','procurement','inventory','production','people']);
const YEAR_MONTH=/^(20\d{2})-(0[1-9]|1[0-2])$/;
function monthNumber(value){
 const m=YEAR_MONTH.exec(value||'');
 return m?Number(m[1])*12+Number(m[2])-1:null;
}
function monthString(serial){
 return Math.floor(serial/12)+'-'+String(serial%12+1).padStart(2,'0');
}
export function qualifyForecastHistory({monthlyHistory,sourceQualified=false,reconciled=false,
 complete=false,asOf=new Date().toISOString().slice(0,10),scope='division'}={}){
 const holds=[];
 if(sourceQualified!==true)holds.push('VERIFIED_TIME_SERIES_REQUIRED');
 if(reconciled!==true)holds.push('RECONCILIATION_REQUIRED');
 if(complete!==true)holds.push('PERIOD_COMPLETENESS_UNVERIFIED');
 if(scope==='group')holds.push('GROUP_ELIMINATION_UNVERIFIED');
 if(!Array.isArray(monthlyHistory)||monthlyHistory.length<12||monthlyHistory.length>24)
  holds.push('TWELVE_CONSECUTIVE_MONTHS_REQUIRED');
 let valid=true,lastMonth=null,latest=null;
 const today=typeof asOf==='string'?asOf.slice(0,7):'';
 const currentSerial=monthNumber(today);
 if(currentSerial===null)valid=false;
 if(Array.isArray(monthlyHistory)&&monthlyHistory.length>=12&&monthlyHistory.length<=24){
  for(const row of monthlyHistory){
   const serial=monthNumber(row?.period);
   if(serial===null||!Number.isSafeInteger(row?.units)||row.units<0||
      lastMonth!==null&&serial!==lastMonth+1){
    valid=false;break;
   }
   lastMonth=serial;latest=serial;
  }
  // Only completed months; full period coverage must be externally verified.
  if(latest===null||currentSerial===null||latest>=currentSerial||latest<currentSerial-2)
   valid=false;
 }else valid=false;
 if(!valid)holds.push('HISTORY_SEQUENCE_OR_FRESHNESS_UNVERIFIED');
 if(holds.length)return {qualified:false,holds:[...new Set(holds)],projection:null,
  sourceAuthority:'SIGNED_HISTORY_REQUIRED',method:'NOT_RUN',approved:false};
 const recent=monthlyHistory.slice(-3);
 const avg=recent.reduce((n,row)=>n+row.units,0)/3;
 if(!Number.isFinite(avg)||avg<0||avg>1000000)
  return {qualified:false,holds:['HISTORY_OUT_OF_RANGE'],projection:null,
    sourceAuthority:'SIGNED_HISTORY_REQUIRED',method:'NOT_RUN',approved:false};
 return {qualified:true,holds:[],sourceAuthority:'SIGNED_MONTHLY_ORDER_UNITS',
  method:'TRAILING_3_MONTH_BASELINE',approved:false,
  projection:{method:'TRAILING_3_MONTH_BASELINE',months:6,
   perMonth:Math.round(avg*100)/100,unit:'ordered_units',approved:false,
   verifiedThrough:monthString(latest),limitations:'Indicative constant-run-rate model only; no seasonality, conversion, cash, capacity, engineering or supplier constraints validated.'}};
}
function safeObservations(items){
 if(!Array.isArray(items)||items.length>6)throw Error('PLAN_SOURCE_SCHEMA_UNVERIFIED');
 return items.map(row=>{
  if(!row||!DOMAINS.has(row.domain)||!['OBSERVED','HOLD'].includes(row.status))
   throw Error('PLAN_SOURCE_SCHEMA_UNVERIFIED');
  if(row.status==='OBSERVED'&&(!Number.isSafeInteger(row.observation?.recordsObserved)
   ||row.observation.recordsObserved<0||row.observation.recordsObserved>1000))
    throw Error('PLAN_SOURCE_SCHEMA_UNVERIFIED');
  return {domain:row.domain,status:row.status,
   count:row.status==='OBSERVED'?row.observation.recordsObserved:null};
 });
}
export function buildPlanningCycle({question,observations=[],monthlyHistory=null,
 historyQualified=false,historyReconciled=false,historyComplete=false,
 asOf=new Date().toISOString().slice(0,10)}={}){
 if(typeof question!=='string'||question.length<5||question.length>300)
  throw Error('PLAN_QUESTION_UNVERIFIED');
 const sources=safeObservations(observations);
 const domainMatch=q=>sources.some(x=>x.domain===q&&x.status==='OBSERVED');
 const group=/\b(group|all divisions|whole company|business analysis|enterprise|company.wide)\b/i.test(question);
 const production=/\b(production|manufactur|capacity|job.cards?|assembly)\b/i.test(question);
 const finance=/\b(financ|cash|budget|runway|profit|expense)\b/i.test(question);
 const proc=/\b(procure|supplier|purchase|shortage|material|supply)\b/i.test(question);
 const noData=sources.every(x=>x.status!=='OBSERVED');
 const holds=sources.filter(x=>x.status==='HOLD').map(x=>x.domain.toUpperCase()+'_SOURCE_HOLD');
 const risks=[];
 if(group){holds.push('GROUP_ELIMINATION_UNVERIFIED','CASH_BALANCE_UNVERIFIED');
  risks.push('CROSS_DIVISION_ATTRIBUTION_UNVERIFIED');}
 if(finance||domainMatch('finance'))risks.push('UNVERIFIED_CASH_AND_REVENUE');
 if(proc||domainMatch('procurement'))risks.push('SHORTAGES_NOT_QUANTIFIED');
 if(production||domainMatch('production'))risks.push('ENGINEERING_RELEASE_UNVERIFIED');
 if(domainMatch('commercial'))risks.push('ORDERS_ARE_NOT_RECOGNIZED_REVENUE');
 const forecast=qualifyForecastHistory({monthlyHistory,sourceQualified:historyQualified,
  reconciled:historyReconciled,complete:historyComplete,asOf,scope:group?'group':'division'});
 const priority=noData?'First verify signed source records before attempting business recommendations.':
  group?'First reconcile source records and group eliminations, then triage production-critical shortages.':
  proc?'First reconcile shortage lines with reserved stock and identify blocked job cards.':
  production?'First validate engineering release gates and the material constraints on open job cards.':
  finance?'First verify cash/bank reconciliation and journal completeness before expenditure decisions.':
  'First reconcile committed demand against stock and approved production capacity.';
 const steps=[
  {phase:'VERIFY',owner:'FOUNDER_REVIEW',mode:'ADVISORY_ONLY',
    instruction:noData?'Obtain qualified signed operational records for the requested business area.':
     'Verify relevant signed records, attribution and source freshness; collect any missing sources.'},
  {phase:'DIAGNOSE',owner:'FOUNDER_REVIEW',mode:'ADVISORY_ONLY',
    instruction:priority},
  {phase:'COMPARE',owner:'FOUNDER_REVIEW',mode:'ADVISORY_ONLY',
    instruction:'Compare existing-resource, alternate-supplier and capacity options using confirmed lead times, qualification evidence and cost assumptions. Record benefits and risks; do not invent prices.'},
  {phase:'DECIDE',owner:'FOUNDER_REVIEW',mode:'ADVISORY_ONLY',
    instruction:'Present a preferred option with evidence, alternatives, unresolved gates and a human decision requirement. No orders, funding or engineering release are executed.'},
 ];
 return {authority:'READ_ONLY_ADVISORY',actionAuthorized:false,automationExecuted:false,
  state:holds.length||noData?'EVIDENCE_INCOMPLETE':'READY_FOR_HUMAN_EVALUATION',
  priority,steps,holds:[...new Set(holds)],risks:[...new Set(risks)],
  forecastReadiness:{qualified:forecast.qualified,holds:forecast.holds,
   method:forecast.method,projection:forecast.projection},
  sourceStatus:sources};
}
