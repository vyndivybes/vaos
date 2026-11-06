/** Deterministic founder case-study calculator.
 * Source entries are references, NOT independently verified publications or market figures.
 * No money movement, AI output, web fetching, forecasting certification, or production writes.
 */
const DATE=/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const ID=/^[A-Z][A-Z0-9-]{5,79}$/;
const KINDS=new Set(['GOVERNMENT','INDUSTRY','COMPANY','ACADEMIC','SECONDARY','USER_SUPPLIED']);
const INVALID=()=>{throw Error('MARKET_CASE_INVALID')};
function day(value){
 if(typeof value!=='string'||!DATE.test(value)||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)INVALID();
 return value;
}
function bounded(value,min,max){
 if(typeof value!=='string'||value.length<min||value.length>max
  ||/[\u0000-\u001f\u007f<>]/.test(value))INVALID();
 return value.trim();
}
function number(value){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e12)INVALID();
 return value;
}
function safeUrl(value){
 if(typeof value!=='string'||value.length>500)INVALID();
 let u;try{u=new URL(value)}catch{INVALID()}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')
  ||u.hostname==='localhost'||u.hostname.endsWith('.localhost')
  ||u.hostname.endsWith('.local')||/^[\d.]+$/.test(u.hostname))INVALID();
 return u.href;
}
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
function economics(m){
 if(!m||typeof m!=='object'||Array.isArray(m))INVALID();
 if(!['INR','USD','EUR','GBP'].includes(m.currency)||typeof m.unit!=='string'
   ||!/^[A-Za-z][A-Za-z -]{2,30}$/.test(m.unit))INVALID();
 const sellingPrice=number(m.sellingPrice),variableCost=number(m.variableCost),fixed=number(m.monthlyFixedCost);
 if(!m.monthlyUnits||Object.keys(m.monthlyUnits).sort().join(',')!=='base,bear,bull')INVALID();
 const demand={};
 for(const key of ['bear','base','bull']){
  const n=m.monthlyUnits[key];
  if(!Number.isSafeInteger(n)||n<0||n>1e7)INVALID();
  demand[key]=n;
 }
 if(demand.bear>demand.base||demand.base>demand.bull)INVALID();
 const contribution=round(sellingPrice-variableCost);
 const breakEven=contribution>0?Math.ceil(fixed/contribution):null;
 const scenarios={};
 for(const [name,units] of Object.entries(demand))
  scenarios[name]={units,revenue:round(units*sellingPrice),
   variableCosts:round(units*variableCost),fixedCosts:fixed,
   operatingSurplus:round(units*contribution-fixed),
   classification:'SCENARIO_ONLY_NOT_FORECAST'};
 return {unitEconomics:{currency:m.currency,unit:m.unit,sellingPrice,variableCost,
  fixedMonthlyCost:fixed,contributionPerUnit:contribution,
  contributionMarginPct:round(contribution/sellingPrice*100),
  breakEvenUnits:breakEven},scenarios};
}
function evidenceRows(items,asOf){
 if(!Array.isArray(items)||items.length>30)INVALID();
 const seen=new Set();
 return items.map((row,i)=>{
  if(!row||typeof row!=='object'||Array.isArray(row))INVALID();
  const published=day(row.published),url=safeUrl(row.url);
  if(published>asOf||seen.has(url))INVALID();
  seen.add(url);
  if(!KINDS.has(row.kind))INVALID();
  return {index:i+1,title:bounded(row.title,6,200),publisher:bounded(row.publisher,2,100),
   claim:bounded(row.claim,15,550),kind:row.kind,published,url,
   verification:'REFERENCED_NOT_CONTENT_VERIFIED'};
 });
}
export function buildMarketCaseStudy(input){
 if(!input||typeof input!=='object'||Array.isArray(input))INVALID();
 const asOf=day(input.asOf);
 const id=bounded(input.id,6,80);
 if(!ID.test(id))INVALID();
 const title=bounded(input.title,10,180),market=bounded(input.market,10,200);
 const evidence=evidenceRows(input.evidence??[],asOf);
 const financial=input.model==null?null:economics(input.model);
 const recommendation=!financial||financial.unitEconomics.contributionPerUnit<=0
   ||financial.scenarios.base.operatingSurplus<=0
  ?{status:'HOLD',decision:'No scalable commercial release from these inputs; verify actual selling prices, full landed BOM, fixed costs and customer orders first.'}
  :{status:'CONDITIONAL_PILOT',decision:'The base assumption is operating-positive, but downside risk and missing evidence require a bounded paid pilot before fixed-capital expansion.'};
 return {
  schemaVersion:'VAOS_MARKET_CASE_STUDY_V1',id,title,market,asOf,
  evidenceStatus:'REFERENCED_UNVERIFIED',evidence,
  marketSizing:{status:'HOLD',tam:null,sam:null,som:null,reason:'No defensible geographic market denominator, segmentation, pricing mix or obtainable share supplied.'},
  modelStatus:financial?'SCENARIO_ONLY':'NO_ASSUMPTIONS',
  unitEconomics:financial?.unitEconomics??null,
  scenarios:financial?.scenarios??null,recommendation,
  limitations:[
   'Source URLs, publication dates and claims are supplied context; their contents and independent source authority are not verified by this calculator.',
   'TAM/SAM/SOM unavailable without reconciled market denominators and segmentation.',
   'Illustrative monthly operating surplus is before taxes, working capital, finance costs, capital expenditure, returns, warranty and quality liabilities.',
   'Assumed demand is not a prediction; no booked sales, BOM validation or supplier quotations were consulted.',
   'The report is not investment, technical-release, safety, accounting or procurement approval.'
  ],
  forecastQualified:false,marketSizeQualified:false,actionAuthorized:false,
  readOnly:true,modelCalls:0
 };
}
const md=s=>String(s).replace(/[\\\\|\[\]]/g,' ').replace(/\r?\n/g,' ').trim();
const amount=(n,c)=>n==null?'not established':new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n)+' '+c;
export function renderMarketCaseStudy(report){
 if(report?.schemaVersion!=='VAOS_MARKET_CASE_STUDY_V1')INVALID();
 const lines=[
  '# '+md(report.id)+' — '+md(report.title),'',
  '**Market:** '+md(report.market)+' | **As of:** '+md(report.asOf),
  '**Status:** RESEARCH / SCENARIO ONLY — no forecast certification or action approval.','',
  '## Executive decision',
  '**'+report.recommendation.status+'** — '+md(report.recommendation.decision),'',
  '## Market evidence (referenced, not independently verified)',
  ...report.evidence.map(e=>'- ['+e.index+'] '+md(e.claim)+' — '+md(e.publisher)+', '+e.published+
   ' ('+md(e.kind)+'). ['+md(e.title)+']('+e.url+').'),
  ...(report.evidence.length?[]:['- No supporting sources supplied. Research evidence HOLD.']),
  '','## Market sizing',
  'TAM/SAM/SOM unavailable — '+md(report.marketSizing.reason),'',
  '## Scenario economics',
 ];
 if(report.scenarios){
  const p=report.unitEconomics,c=p.currency;
  lines.push('**Assumption, not quote or actual:** price '+amount(p.sellingPrice,c)+
   '; variable cost '+amount(p.variableCost,c)+' per '+md(p.unit)+
   '; fixed cost '+amount(p.fixedMonthlyCost,c)+'/month.',
   'Contribution per unit: '+amount(p.contributionPerUnit,c)+
   ' ('+p.contributionMarginPct+'%); illustrative break-even: '+
   (p.breakEvenUnits===null?'not attainable at the assumed unit contribution':p.breakEvenUnits+' units/month')+'.','',
   '| Case | Assumed units/month | Revenue | Variable costs | Fixed costs | Operating surplus |',
   '|---|---:|---:|---:|---:|---:|',
   ...['bear','base','bull'].map(k=>{
    const x=report.scenarios[k];
    return '| '+k+' | '+x.units+' | '+amount(x.revenue,c)+' | '+amount(x.variableCosts,c)+
     ' | '+amount(x.fixedCosts,c)+' | '+amount(x.operatingSurplus,c)+' |';
   }));
 }else lines.push('No scenario generated; provide explicit cost, price and demand assumptions.');
 lines.push('','## Limitations and verification gates',
  ...report.limitations.map(x=>'- '+md(x)),
  '','**Forecast qualified:** NO. **Production/finance actions authorised:** NO.',
  '','Related controlled references: BUSINESS-CASE-001 and BUSINESS-CASE-002.');
 return lines.join('\n')+'\n';
}
