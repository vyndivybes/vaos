/** JARVIS native Data Agent: evidence-first business analysis, never execution.
 * Different row types have different units. No cross-domain sums or forecasts.
 */
import {planAdaptiveReads} from './adaptive-read-planner.mjs';

const DOMAIN_LABELS=Object.freeze({
 finance:'Ledger and journal records',commercial:'Sales order records',
 procurement:'Material shortage lines',inventory:'Stock balance records',
 production:'Production job cards',people:'HR personnel records',
 engineering:'Engineering baseline and change records'
});
const DOMAIN_ORDER=['finance','commercial','procurement','inventory','production','people'];
const GROUP=/\b(group|company|enterprise|all divisions|across divisions|vyndi|vayu|vāyū|business overview|overall business)\b/i;
const DIGITAL=/\b(?:digital|ai)\s+(?:employee|employees|agents?|workforce)\b|\b(?:16\s+(?:employees|agents)|employee\s+(?:assessment|training|performance|audits?)|workforce analytics)\b/i;
const QUALIFIED=new Set([...DOMAIN_ORDER,'engineering']);
const INVESTIGATE=/\b(why|root.cause|bottleneck|blocker|delay(?:ed|s)?|investigat(?:e|ion)|discrepanc(?:y|ies)|holding.up|production.risks?)\b/i;
const INVESTIGATION_DOMAINS=Object.freeze(['procurement','inventory','production','engineering']);

export function selectDataAgentSources(question){
 const plan=planAdaptiveReads(question);
 if(plan.state==='DENIED')return {status:'DENIED',domains:[],workforce:false};
 if(DIGITAL.test(question))return {status:'PLANNED',domains:[],workforce:true,investigate:false};
 // A diagnosis needs the existing G3.1E crosswalk, not just the first named ledger.
 if(INVESTIGATE.test(question))
  return {status:'PLANNED',domains:[...INVESTIGATION_DOMAINS],workforce:false,investigate:true,
   omitted:[]};
 let domains=plan.domains.filter(x=>QUALIFIED.has(x));
 // Founders routinely say "finance", while the shared planner recognises
 // "financial" or "cash"; retain the existing source contract without widening tools.
 if(/\bfinance\b/i.test(question)&&!domains.includes('finance'))
  domains=['finance',...domains];
 if(!domains.length&&GROUP.test(question))domains=['finance','commercial','procurement','production'];
 if(!domains.length)return {status:'UNSUPPORTED',domains:[],workforce:false};
 return {status:'PLANNED',domains:domains.slice(0,4),workforce:false,investigate:false,
  omitted:plan.missingDomains||[]};
}

function isCount(value){return Number.isSafeInteger(value)&&value>=0&&value<=1000;}
function stamp(now){const d=new Date(now);if(!Number.isFinite(d.getTime()))throw Error('DATA_AGENT_CLOCK_INVALID');return d.toISOString();}
const BASE_LIMITATIONS=Object.freeze([
 'Counts represent at most 50 selected source rows per business domain, not enterprise totals.',
 'Different source record types cannot be added or interpreted as comparable quantities.',
 'Historical trends and forecasts require verified, reconciled dated records. Cross-source discrepancies provide investigation leads, never independently proven causes.',
 'A gateway receipt time does not establish the age, completeness or revision of the underlying business records.'
]);
export function buildDataAgentReport({question,observations,investigation=null,now=new Date()}){
 if(typeof question!=='string'||!Array.isArray(observations)||observations.length>4)
  throw Error('DATA_AGENT_INPUT_INVALID');
 const receiptAt=stamp(now);
 const sources=[],metrics=[];
 observations.forEach((item,i)=>{
  if(!item||!QUALIFIED.has(item.domain)||!['OBSERVED','HOLD'].includes(item.status))
   throw Error('DATA_AGENT_SOURCE_INVALID');
  const index=i+1;
  if(item.status==='OBSERVED'){
   if(typeof item.authority!=='string'||!item.authority||!isCount(item.count))
    throw Error('DATA_AGENT_METRIC_INVALID');
   sources.push({index,domain:item.domain,status:'OBSERVED',authority:item.authority,receiptAt,
    coverage:'BOUNDED_SELECTED_ROWS',sourceRevisionVerified:false});
   metrics.push({sourceIndex:index,domain:item.domain,label:DOMAIN_LABELS[item.domain],
    value:item.count,unit:'selected_records',scope:'BOUNDED_SELECTED_ROWS'});
  }else sources.push({index,domain:item.domain,status:'HOLD',authority:null,receiptAt:null,
    coverage:'UNKNOWN',sourceRevisionVerified:false});
 });
 const missing=sources.filter(x=>x.status==='HOLD').map(x=>x.domain);
 const status=metrics.length===0?'HOLD':missing.length?'PARTIAL':'OBSERVED';
 const details=sources.map(s=>s.status==='OBSERVED'
  ?s.domain+': '+metrics.find(m=>m.sourceIndex===s.index).value+' selected records ['+s.index+']'
  :s.domain+': unavailable (HOLD)').join('; ');
 const answer=(status==='HOLD'?'No qualified live business observations were available. '
  :'Current bounded observations: ')+details+
  '. No business record was changed. These are selected record counts, not company-wide totals or a validated forecast.'+
  (investigation?'\n\nRELATIONSHIP INVESTIGATION — '+investigation.summary+
  (investigation.findings?.length?'\n'+investigation.findings.slice(0,3).map(x=>
   x.observedCount+' selected rows: '+x.title+'.').join(' '):''):'');
 return {schemaVersion:'VAOS_DATA_AGENT_V1',status,question,answer,observedAt:receiptAt,
  ...(investigation?{investigation}:{}),
  sources,metrics,chart:{title:'Observed source records (different units)',kind:'bars',
   rows:metrics.map(m=>({label:m.domain,value:m.value}))},
  sourceCoverage:{observed:metrics.length,requested:sources.length},
  holds:missing.map(x=>x.toUpperCase()+'_SOURCE_UNAVAILABLE'),
  limitations:BASE_LIMITATIONS,readOnly:true,actionAuthorized:false,
  forecastQualified:false,modelCalls:0,mode:'DETERMINISTIC_EVIDENCE'};
}

export function buildWorkforceDataAgentReport({question,analytics,now=new Date()}){
 if(!analytics||analytics.schemaVersion!=='VAOS_FOUNDER_ANALYTICS_V1'||
  !Array.isArray(analytics.employees)||analytics.employees.length!==16||
  analytics.actionAuthorized!==false||!Number.isSafeInteger(analytics.summary?.registered))
  throw Error('DATA_AGENT_WORKFORCE_SOURCE_INVALID');
 const receiptAt=stamp(now);
 const {summary}=analytics;
 const fields=['planned','ready','inProgress','completed','blocked','failed','cancelled'];
 const rows=fields.filter(k=>Number.isSafeInteger(summary[k])&&summary[k]>=0)
  .map(k=>({label:k,value:summary[k]}));
 const employees=analytics.employees.map(e=>({
  id:e.id,name:e.name,sourceStatus:e.sourceStatus,lifecycle:e.lifecycle,
  workTotal:isCount(e.work?.total)?e.work.total:null,
  completed:isCount(e.work?.completed)?e.work.completed:null,
  blocked:isCount(e.work?.blocked)?e.work.blocked:null
 }));
 const count=summary.registered;
 return {schemaVersion:'VAOS_DATA_AGENT_V1',status:count===16?'OBSERVED':'PARTIAL',
  question,observedAt:receiptAt,
  answer:count+' of 16 canonical digital employees have recorded workforce source entries. '+
    'The charts represent recorded task states, not independent employee competence or production authorization. '+
    'See source [1] and individual employee details below.',
  sources:[{index:1,domain:'digital-workforce',status:'OBSERVED',
   authority:'GOVERNED_POSTGRES_WORK_PACKAGES',receiptAt,
   sourceObservedAt:analytics.observedAt,coverage:analytics.dataCoverage,sourceRevisionVerified:false}],
  metrics:[{sourceIndex:1,domain:'digital-workforce',label:'Employees with recorded evidence',
   value:count,unit:'employees',scope:'CANONICAL_16'}],
  chart:{title:'Recorded digital workforce task states',kind:'bars',rows},
  employees,sourceCoverage:{observed:1,requested:1},
  holds:count<16?['UNOBSERVED_EMPLOYEE_RECORDS']:[],
  limitations:['Registered, ACTIVE and PASS records do not independently establish production competence.',
   'Unobserved task counts are unknown, not zero. Workforce charts exclude unavailable employee records.',
   'No independent audit certification, time-series forecast or automatic production dispatch is implied.'],
  readOnly:true,actionAuthorized:false,forecastQualified:false,modelCalls:0,mode:'DETERMINISTIC_EVIDENCE'};
}
