import {VAOS_WORKFORCE_AGENT_IDS,VAOS_JOB_CATALOG} from '../platform/runtime/vaos-eight-operating-model.mjs';
import {getDepartmentAuditScope} from '../platform/qualification/department-audit.mjs';
import {departmentResults,plannedProgress,qualifiedForecast,capaRetests,governedReports} from './workforce-evidence.mjs';
import {assessWorkforceOperationalReadiness} from './workforce-operational-readiness.mjs';

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
function qualificationAssessment(value,observedAt){
 if(value===undefined||value===null)return {status:'NOT_RECORDED',targetLevel:null,assessedAt:null,assessedBy:null};
 if(!value||typeof value!=='object'||Array.isArray(value)||
    typeof value.status!=='string'||!/^[A-Z_]{2,40}$/.test(value.status)||
    !Number.isInteger(value.targetLevel)||value.targetLevel<0||value.targetLevel>4||
    !iso(value.assessedAt)||Date.parse(value.assessedAt)>Date.parse(observedAt)||
    (value.assessedBy!==null&&value.assessedBy!==undefined&&typeof value.assessedBy!=='string'))
    throw Error('QUALIFICATION_ASSESSMENT_UNVERIFIED');
 return {status:value.status,targetLevel:value.targetLevel,assessedAt:value.assessedAt,assessedBy:value.assessedBy||null};
}
function capaEvidence(counts,cases,observedAt){
 if(counts===undefined||counts===null)return {status:'SOURCE_NOT_LINKED',open:null,closed:null};
 if(typeof counts!=='object'||Array.isArray(counts)||Object.keys(counts).length>20||
    !Array.isArray(cases)||cases.length>20)throw Error('CAPA_SOURCE_INVALID');
 const mapped={};
 for(const [key,value] of Object.entries(counts)){
  if(!/^[A-Z_]{2,40}$/.test(key)||!Number.isSafeInteger(value)||value<0)
    throw Error('CAPA_STATUS_COUNT_INVALID');
  mapped[key]=value;
 }
 const seen=new Set();
 const verified=cases.map(c=>{
  if(!c||typeof c.id!=='string'||!c.id.trim()||seen.has(c.id)||
    typeof c.status!=='string'||!/^[A-Z_]{2,40}$/.test(c.status)||
    !iso(c.openedAt)||Date.parse(c.openedAt)>Date.parse(observedAt)||
    (c.sourceAction!==undefined&&c.sourceAction!==null&&typeof c.sourceAction!=='string'))
   throw Error('CAPA_CASE_UNVERIFIED');
  seen.add(c.id);
  if(!Object.hasOwn(mapped,c.status))throw Error('CAPA_STATUS_MISMATCH');
  return {id:c.id,status:c.status,sourceAction:c.sourceAction||null,openedAt:c.openedAt};
 });
 for(const [status,count] of Object.entries(mapped)){
  if(verified.filter(c=>c.status===status).length>count)throw Error('CAPA_COUNT_INCONSISTENT');
 }
 return {status:'PARTIAL_CAPA_SOURCE',open:null,closed:null,capaByStatus:mapped,capaCases:verified};
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
  const audit=departmentResults(id,entry?.departmentReviews,raw.observedAt)||auditFor(id);
  const progress=plannedProgress(entry?.planBaselines,entry?.workItems||[],entry?.verifiedClosures,raw.observedAt);
  const defects=capaEvidence(entry?.capaCounts,entry?.capaCases,raw.observedAt);
  defects.retests=capaRetests(id,entry?.capaEvents,entry?.capaCases,raw.observedAt);
  const projection=qualifiedForecast(id,entry?.forecastQualifications,raw.observedAt,progress,entry?.workItems||[]);
  const qualified=projection?.status==='INDEPENDENTLY_QUALIFIED_PROJECTION'&&entry.workItems.length!==entry.work.total
   ?{...forecast(),reason:'Complete operational workload snapshot required'}:projection;
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
   qualificationAssessment:qualificationAssessment(entry?.qualificationAssessment,raw.observedAt),
   defects,progress,reports:governedReports(id,entry?.employeeReports,raw.observedAt),
   verifiedClosures:entry?entry.closures:null,
   forecast:qualified||forecast(),productionWriteAuthorized:false};
  return Object.freeze(base);
 });
 const registered=observed.size;
 const summary={totalEmployees:16,registered,unobserved:16-registered,
  actionAuthorized:false,readOnly:true,forecastQualified:false};
 for(const key of [...STATUSES,'total'])summary[key]=[...observed.values()].reduce((sum,e)=>sum+e.work[key],0);
 summary.verifiedClosures90Days=[...observed.values()].reduce((sum,e)=>sum+(e.closures?.['90d']||0),0);
 summary.verifiedHistoryComplete=[...observed.values()].every(e=>e.closures!==null);
 summary.forecastQualified=employees.some(e=>e.forecast.status==='INDEPENDENTLY_QUALIFIED_PROJECTION');
 summary.employeesWithQualifiedForecast=employees.filter(e=>e.forecast.status==='INDEPENDENTLY_QUALIFIED_PROJECTION').length;
 summary.approvedBaselines=employees.reduce((s,e)=>s+(e.progress.baselineCount||0),0);
 summary.independentAuditReviews=employees.reduce((s,e)=>s+(e.audit.history?.length||0),0);
 const operationalReadiness=assessWorkforceOperationalReadiness(employees,raw.observedAt);
 return Object.freeze({schemaVersion:'VAOS_FOUNDER_ANALYTICS_V1',observedAt:raw.observedAt,
  dataCoverage:registered+'/16',actionAuthorized:false,source:'GOVERNED_POSTGRES_WORK_PACKAGES',
  summary,employees,operationalReadiness});
}
