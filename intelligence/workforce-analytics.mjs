import {VAOS_WORKFORCE_AGENT_IDS,VAOS_JOB_CATALOG} from '../platform/runtime/vaos-eight-operating-model.mjs';
import {getDepartmentAuditScope} from '../platform/qualification/department-audit.mjs';

// Read-only workforce analytics. Never substitute mission state for evidence of audit, defect
// closure or runtime liveness. No production actions and no use of synthetic history.
const KNOWN=new Set(VAOS_WORKFORCE_AGENT_IDS);
const STATUSES=['planned','ready','inProgress','completed','blocked','failed','cancelled'];
const jobKpis=id=>[...new Set((VAOS_JOB_CATALOG[id]||[]).flatMap(job=>job.kpis||[]))].slice(0,16);
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
function checkWork(work){
 if(!work||typeof work!=='object'||Array.isArray(work))throw Error('WORK_COUNTS_MISSING');
 for(const key of [...STATUSES,'total']){
  if(!Number.isSafeInteger(work[key])||work[key]<0)throw Error('WORK_COUNT_UNVERIFIED');
 }
 if(STATUSES.reduce((s,k)=>s+work[k],0)!==work.total)throw Error('WORK_TOTAL_INCONSISTENT');
 return Object.fromEntries([...STATUSES,'total'].map(k=>[k,work[k]]));
}
const missingWork=()=>Object.fromEntries([...STATUSES,'total'].map(k=>[k,null]));
const forecast=()=>({status:'NOT_QUALIFIED',projectedFinishAt:null,confidence:null,
 reason:'Insufficient independently qualified task durations, capacity and delivery baselines'});
function validatedClosures(events,asOf){
 if(events===undefined||events===null)return null;
 if(!Array.isArray(events)||events.length>200)throw Error('VERIFIED_HISTORY_INVALID');
 const seen=new Set(),when=Date.parse(asOf);
 const counts={'7d':0,'30d':0,'90d':0};
 for(const event of events){
  if(!event||typeof event.workPackageId!=='string'||!event.workPackageId||
     !iso(event.verifiedAt)||seen.has(event.workPackageId))throw Error('VERIFIED_EVENT_INVALID');
  seen.add(event.workPackageId);
  const age=when-Date.parse(event.verifiedAt);
  if(age<0||age>90*86400000)throw Error('VERIFIED_EVENT_OUT_OF_RANGE');
  for(const [window,days] of [['7d',7],['30d',30],['90d',90]]){
   if(age<=days*86400000)counts[window]++;
  }
 }
 return counts;
}
function auditFor(id){
 const pages=getDepartmentAuditScope(id)?.pages||[];
 return {status:'UNVERIFIED_NO_REVIEW_LEDGER',checkedAt:null,independentReviewer:null,
  passed:null,failed:null,openFindings:null,
  pages:pages.map(p=>({route:p.route,requiresLedger:p.requiresLedger,
    status:'EVIDENCE_NOT_CONNECTED'}))};
}
export function buildWorkforceAnalytics(raw){
 if(!raw||raw.schemaVersion!=='VAOS_WORKFORCE_OVERVIEW_V1'||raw.readOnly!==true||
  !iso(raw.observedAt)||!Array.isArray(raw.employees)||raw.employees.length>16)
  throw Error('WORKFORCE_SOURCE_UNQUALIFIED');
 const observed=new Map();
 for(const item of raw.employees){
  if(!item||!KNOWN.has(item.id)||observed.has(item.id)||typeof item.name!=='string'||
   !item.name.trim()||!Array.isArray(item.workItems)||item.workItems.length>50)
   throw Error('WORKFORCE_EMPLOYEE_INVALID');
  const work=checkWork(item.work);
  const closures=validatedClosures(item.verifiedClosures,raw.observedAt);
  observed.set(item.id,{...item,work,closures});
 }
 const employees=VAOS_WORKFORCE_AGENT_IDS.map(id=>{
  const entry=observed.get(id);
  const audit=auditFor(id);
  const base={id,name:entry?.name||id,role:entry?.role||id,department:entry?.department||null,
   lifecycle:entry?.lifecycle||'NOT_OBSERVED',
   qualificationLevel:Number.isInteger(entry?.qualificationLevel)?entry.qualificationLevel:null,
   activitySignal:entry?.activitySignal||'NOT_OBSERVED',
   monitorCheckedAt:entry?.monitorCheckedAt||null,
   lastVerifiedActivityAt:entry?.lastVerifiedActivityAt||null,
   currentAssignment:entry?.currentAssignment||null,
   sourceStatus:entry?'RECORDED':'NOT_OBSERVED',work:entry?.work||missingWork(),
   trainingWork:entry?.trainingWork&&Number.isSafeInteger(entry.trainingWork.total)?entry.trainingWork:null,
   workItems:entry?.workItems||[],configuredKpis:jobKpis(id),audit,
   defects:{status:'SOURCE_NOT_LINKED',open:null,closed:null},
   verifiedClosures:entry?entry.closures:null,
   forecast:forecast(),productionWriteAuthorized:false};
  return Object.freeze(base);
 });
 const registered=observed.size;
 const summary={totalEmployees:16,registered,unobserved:16-registered,
  actionAuthorized:false,readOnly:true,forecastQualified:false};
 for(const key of [...STATUSES,'total'])summary[key]=[...observed.values()].reduce((sum,e)=>sum+e.work[key],0);
 summary.verifiedClosures90Days=[...observed.values()].reduce((sum,e)=>sum+(e.closures?.['90d']||0),0);
 summary.verifiedHistoryComplete=[...observed.values()].every(e=>e.closures!==null);
 return Object.freeze({schemaVersion:'VAOS_FOUNDER_ANALYTICS_V1',observedAt:raw.observedAt,
  dataCoverage:registered+'/16',actionAuthorized:false,source:'GOVERNED_POSTGRES_WORK_PACKAGES',
  summary,employees});
}
