import {getDepartmentAuditScope} from '../platform/qualification/department-audit.mjs';
import {createHash} from 'node:crypto';

const date=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const text=x=>typeof x==='string'&&x.trim().length>0&&x.length<=2000;
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const past=(x,asOf)=>date(x)&&Date.parse(x)<=Date.parse(asOf);
const refs=x=>Array.isArray(x)&&x.length>0&&x.length<=20&&x.every(text);
const identity=x=>typeof x==='string'?x.trim().toLowerCase():'';
function rows(value){
 if(value===undefined)return null;
 if(!Array.isArray(value)||value.length>200)throw Error('EVIDENCE_LEDGER_INVALID');
 const seen=new Set();
 for(const row of value){
  if(!row||!text(row.id)||seen.has(row.id))throw Error('EVIDENCE_ID_INVALID');
  seen.add(row.id);
 }
 return value;
}
export function departmentResults(employeeId,value,asOf){
 const records=rows(value);
 if(records===null)return null;
 const pages=getDepartmentAuditScope(employeeId)?.pages||[];
 const latest=new Map();
 for(const r of records){
  if(!pages.some(p=>p.route===r.route)||!['PASS','FAIL','PENDING','UNDER_REVIEW','NOT_APPLICABLE'].includes(r.outcome)
   ||!past(r.executedAt,asOf)||!past(r.reviewedAt,asOf)||Date.parse(r.reviewedAt)<Date.parse(r.executedAt)
   ||!text(r.reviewer)||identity(r.reviewer)===employeeId||!refs(r.evidenceRefs)||!hash(r.evidenceSha256)
   ||!text(r.canonicalSourceRef)||!/^authenticated-/.test(r.environment||'')
   ||!text(r.deployedCommit)||!Number.isSafeInteger(r.openFindings)||r.openFindings<0
   ||!date(r.nextAuditDueAt)||Date.parse(r.nextAuditDueAt)<=Date.parse(r.reviewedAt)
   ||(r.openFindings>0&&!text(r.correctiveOwner))||!refs(r.checksEvidenceRefs)
   ||!text(r.rationale))throw Error('DEPARTMENT_REVIEW_UNVERIFIED');
  if(r.outcome==='PASS'&&r.openFindings!==0)throw Error('AUDIT_PASS_WITH_FINDINGS');
  if(r.outcome==='PASS'){
   const required=['navigation','ui','responsive','permissions','records','displays','reconciliation','errorStates'];
   if(pages.find(p=>p.route===r.route).requiresLedger)required.push('ledger');
   if(required.some(k=>r.checks?.[k]!==true))throw Error('AUDIT_CHECKS_INCOMPLETE');
  }
  if(!latest.has(r.route)||Date.parse(latest.get(r.route).reviewedAt)<Date.parse(r.reviewedAt))latest.set(r.route,r);
 }
 return {status:records.length?'RECORDED_INDEPENDENT_REVIEWS':'UNVERIFIED_NO_REVIEW_LEDGER',
  qualificationCertified:false,history:records,
  pages:pages.map(p=>({...p,status:latest.get(p.route)?.outcome||'EVIDENCE_NOT_CONNECTED',result:latest.get(p.route)||null,
   overdue:latest.has(p.route)?Date.parse(latest.get(p.route).nextAuditDueAt)<=Date.parse(asOf):null})),
  passed:[...latest.values()].filter(r=>r.outcome==='PASS').length,
  failed:[...latest.values()].filter(r=>r.outcome==='FAIL').length,
  openFindings:[...latest.values()].reduce((s,r)=>s+r.openFindings,0)};
}
export function plannedProgress(baselines,workItems,closures,asOf){
 const records=rows(baselines);
 if(records===null)return {status:'BASELINE_NOT_CONNECTED',series:[],overdue:null};
 const proof=new Map((closures||[]).map(c=>[c.workPackageId,c.verifiedAt]));
 const seen=new Set();
 for(const b of records){
  if(!text(b.workPackageId)||seen.has(b.workPackageId)||!past(b.approvedAt,asOf)
   ||!date(b.plannedStartAt)||!date(b.plannedFinishAt)||Date.parse(b.plannedStartAt)<Date.parse(b.approvedAt)
   ||Date.parse(b.plannedFinishAt)<=Date.parse(b.plannedStartAt)||!refs(b.evidenceRefs)||!text(b.approvedBy)
   ||!Array.isArray(b.dependsOn)||!b.dependsOn.every(text))throw Error('PLAN_BASELINE_UNVERIFIED');
  seen.add(b.workPackageId);
 }
 const end=Date.parse(asOf),day=86400000;
 if(records.some(b=>Date.parse(b.approvedAt)<end-90*day))return {status:'BASELINE_OUTSIDE_VERIFIED_HISTORY',series:[],overdue:null,baselines:records};
 const series=Array.from({length:30},(_,i)=>{
  const at=end-(29-i)*day;
  return {at:new Date(at).toISOString(),planned:records.filter(b=>Date.parse(b.plannedFinishAt)<=at).length,
   actual:records.filter(b=>proof.has(b.workPackageId)&&Date.parse(proof.get(b.workPackageId))<=at).length};
 });
 return {status:records.length?'APPROVED_BASELINE_COHORT':'NO_APPROVED_BASELINE',
  baselineCount:records.length,workItemsObserved:workItems.length,
  actualSource:'INDEPENDENT_HANDOFF_VERIFICATION',historyWindowDays:90,
  series,overdue:records.filter(b=>Date.parse(b.plannedFinishAt)<end&&!proof.has(b.workPackageId)).length,
  baselines:records};
}
export function forecastInputSha256(progress,workItems){
 const baselines=(progress.baselines||[]).map(b=>({id:b.id,workPackageId:b.workPackageId,
  approvedAt:new Date(b.approvedAt).toISOString(),plannedStartAt:new Date(b.plannedStartAt).toISOString(),
  plannedFinishAt:new Date(b.plannedFinishAt).toISOString(),dependsOn:[...b.dependsOn].sort()})).sort((a,b)=>a.id.localeCompare(b.id));
 const work=workItems.map(w=>({id:w.id,status:w.status,updatedAt:w.updatedAt})).sort((a,b)=>a.id.localeCompare(b.id));
 return createHash('sha256').update(JSON.stringify({baselines,work})).digest('hex');
}
export function qualifiedForecast(employeeId,value,asOf,progress,workItems=[]){
 const records=rows(value);
 if(!records?.length)return null;
 for(const f of records){
  if(!text(f.modelVersion)||!text(f.reviewer)||identity(f.reviewer)===employeeId||!past(f.qualifiedAt,asOf)
   ||!date(f.expiresAt)||Date.parse(f.expiresAt)<=Date.parse(f.qualifiedAt)
   ||!date(f.projectedFinishAt)||!date(f.lowerAt)||!date(f.upperAt)
   ||Date.parse(f.lowerAt)<Date.parse(f.qualifiedAt)||Date.parse(f.lowerAt)>Date.parse(f.projectedFinishAt)
   ||Date.parse(f.projectedFinishAt)>Date.parse(f.upperAt)
   ||!Number.isSafeInteger(f.sampleSize)||f.sampleSize<20
   ||!Number.isFinite(f.confidence)||f.confidence<=0||f.confidence>=1
   ||!Number.isFinite(f.backtestCoverage)||f.backtestCoverage<f.confidence||f.backtestCoverage>1
   ||!Number.isFinite(f.capacityPerDay)||f.capacityPerDay<=0||!refs(f.evidenceRefs)
   ||!hash(f.inputSha256)||!Array.isArray(f.baselineIds)||!f.baselineIds.length
   ||new Set(f.baselineIds).size!==f.baselineIds.length)throw Error('FORECAST_QUALIFICATION_INVALID');
 }
 const f=[...records].sort((a,b)=>Date.parse(b.qualifiedAt)-Date.parse(a.qualifiedAt))[0];
 if(Date.parse(f.expiresAt)<=Date.parse(asOf)||Date.parse(f.projectedFinishAt)<=Date.parse(asOf)
  ||!progress.baselines?.length||f.baselineIds.length!==progress.baselines.length
  ||progress.baselines.some(b=>!f.baselineIds.includes(b.id))||f.inputSha256!==forecastInputSha256(progress,workItems))
  return {status:'NOT_QUALIFIED',projectedFinishAt:null,confidence:null,reason:'Expired forecast or approved baseline cohort changed'};
 return {...f,status:'INDEPENDENTLY_QUALIFIED_PROJECTION',reason:'Recorded model qualification and backtest evidence; projection is not a delivery guarantee'};
}
export function capaRetests(employeeId,value,cases,asOf){
 const records=rows(value);
 if(records===null)return {status:'RETEST_NOT_CONNECTED',events:[]};
 const known=new Map((cases||[]).map(c=>[c.id,c]));
 for(const r of records){
  const c=known.get(r.capaId);
  if(!c||!['CORRECTION','RETEST_PASS','RETEST_FAIL','CLOSED','REOPENED'].includes(r.kind)
   ||!past(r.occurredAt,asOf)||Date.parse(r.occurredAt)<Date.parse(c.openedAt)
   ||!text(r.owner)||!text(r.reviewer)||identity(r.reviewer)===employeeId||identity(r.reviewer)===identity(r.owner)
   ||!refs(r.evidenceRefs)||!hash(r.evidenceSha256)||!text(r.note))throw Error('CAPA_RETEST_UNVERIFIED');
  if(r.kind==='CLOSED'){
   const retest=records.find(e=>e.id===r.retestEventId);
   if(!retest||retest.kind!=='RETEST_PASS'||retest.capaId!==r.capaId
    ||Date.parse(retest.occurredAt)>Date.parse(r.occurredAt))throw Error('CAPA_CLOSURE_RETEST_REQUIRED');
   if(records.some(e=>e.capaId===r.capaId&&['RETEST_FAIL','REOPENED'].includes(e.kind)
    &&Date.parse(e.occurredAt)>=Date.parse(retest.occurredAt)&&Date.parse(e.occurredAt)<=Date.parse(r.occurredAt)))
    throw Error('CAPA_CLOSURE_SUPERSEDED_RETEST');
  }
 }
 return {status:records.length?'RECORDED_RETEST_EVIDENCE':'NO_RETEST_EVIDENCE',events:records};
}
export function governedReports(employeeId,value,asOf){
 const records=rows(value);
 if(records===null)return {status:'REPORT_SOURCE_NOT_CONNECTED',reports:[],outboundAuthorized:false};
 for(const r of records){
  if(r.author!==employeeId||!text(r.reviewer)||identity(r.reviewer)===employeeId||!past(r.createdAt,asOf)
   ||!past(r.verifiedAt,asOf)||Date.parse(r.createdAt)>Date.parse(r.verifiedAt)
   ||!hash(r.reportSha256)||!text(r.handoffId)||!text(r.workPackageId)||!text(r.actionType))
   throw Error('EMPLOYEE_REPORT_UNVERIFIED');
 }
 return {status:records.length?'VERIFIED_EMPLOYEE_HANDOFF_REPORTS':'NO_VERIFIED_EMPLOYEE_REPORTS',
  reports:records,outboundAuthorized:false,deliveryStatus:'FOUNDER_READ_ONLY_PROJECTION'};
}
