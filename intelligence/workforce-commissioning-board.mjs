// Read-only founder execution board. Never modifies mission, audit, CAPA or forecast ledgers.
// Source records and their verification/qualification are deliberately separate from recommendations.
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/.test(value);
const admitted=status=>status==='PASS';
export function buildWorkforceCommissioningBoard(source){
 if(!source||source.schemaVersion!=='VAOS_FOUNDER_ANALYTICS_V1'||source.actionAuthorized!==false||
    !Array.isArray(source.employees)||source.employees.length!==16)throw Error('WORKFORCE_BOARD_SOURCE_INVALID');
 const seen=new Set(),blocked=[],audit=[],capaMap=new Map(),forecast=[],reporting=[];
 for(const emp of source.employees){
  if(!emp||typeof emp.id!=='string'||!emp.id.trim()||seen.has(emp.id)||
     !Array.isArray(emp.workItems)||emp.workItems.length>50)throw Error('DUPLICATE_EMPLOYEE_OR_INVALID_SOURCE');
  seen.add(emp.id);
  const listedBlocked=emp.workItems.filter(x=>x?.status==='BLOCKED');
  if(integer(emp.work?.blocked)&&listedBlocked.length<emp.work.blocked)
   throw Error('BLOCKED_WORK_PROJECTION_INCOMPLETE');
  for(const w of listedBlocked){
   if(!w||typeof w.id!=='string'||!w.id.trim()||typeof w.actionType!=='string')
    throw Error('BLOCKED_WORK_ITEM_INVALID');
   blocked.push(Object.freeze({
    workPackageId:w.id,missionId:w.missionId||null,employeeId:emp.id,
    employeeName:emp.name||emp.id,actionType:w.actionType,status:'BLOCKED',
    updatedAt:w.updatedAt||null,
    missionUrl:safeId(w.missionId)?'/mission-status.html?missionId='+encodeURIComponent(w.missionId):null,
    blockerReason:'NOT_IN_VERIFIED_PROJECTION',
    nextEvidence:'Retrieve authoritative mission blocker, source revision, missing inputs and independent review; do not override production HOLD.',
    closureAuthorized:false,
   }));
  }
  const pages=Array.isArray(emp.audit?.pages)?emp.audit.pages:[];
  const passed=pages.filter(p=>p.status==='PASS'&&p.result?.reviewedAt).length;
  const failed=pages.filter(p=>p.status==='FAIL').length;
  audit.push(Object.freeze({
   employeeId:emp.id,employeeName:emp.name||emp.id,department:emp.department||'Unassigned',
   requiredRoutes:pages.length,verifiedPassedRoutes:passed,failedRoutes:failed,
   missingOrPendingRoutes:pages.length-passed-failed,
   requiredChecks:Object.freeze(['navigation','ui','responsive','permissions','records','displays','reconciliation','errorStates',...(pages.some(p=>p.requiresLedger)?['ledger']:[])]),
   routes:pages.map(p=>({route:p.route,status:p.status||'EVIDENCE_NOT_CONNECTED',requiresLedger:Boolean(p.requiresLedger),
    reviewedAt:p.result?.reviewedAt||null})),auditAccepted:pages.length>0&&passed===pages.length,
   nextEvidence:'Authenticated browser checks, ledger/source reconciliation and independent reviewer signature per scoped route; physical release holds remain separate.'
  }));
  for(const c of emp.defects?.capaCases||[]){
   if(!c||typeof c.id!=='string'||!c.id.trim()||typeof c.status!=='string')
    throw Error('CAPA_SOURCE_INVALID');
   const prev=capaMap.get(c.id);
   if(prev&&prev.status!==c.status)throw Error('CONFLICTING_CAPA_STATUS');
   if(!prev)capaMap.set(c.id,{
    id:c.id,status:c.status,assignedEmployeeId:emp.id,
    retestStatus:emp.defects?.retests?.status||'NOT_EVIDENCED',
    nextEvidence:'Root-cause record, corrective implementation, controlled retest, independent reviewer and accepted closure evidence.',
    closureAuthorized:false
   });
  }
  const f=emp.forecast||{};
  forecast.push({employeeId:emp.id,employeeName:emp.name||emp.id,
   status:f.status||'NOT_QUALIFIED',
   approvedBaselineCount:integer(emp.progress?.baselineCount)?emp.progress.baselineCount:null,
   qualified:f.status==='INDEPENDENTLY_QUALIFIED_PROJECTION',
   nextEvidence:'Approved dated plans, independent verified task durations/capacity, complete input snapshot, source hash and reviewer-signed backtest.'});
  const reports=Array.isArray(emp.reports?.reports)?emp.reports.reports:[];
  reporting.push({employeeId:emp.id,employeeName:emp.name||emp.id,
   status:emp.reports?.status||'NOT_RECORDED',recordedReports:reports.length,
   independentlyReviewed:Boolean(['INDEPENDENTLY_VERIFIED','QUALIFIED'].includes(emp.reports?.status)),
   nextEvidence:'Inspect provenance, reviewer, work package and report hash; independently observe delivery before claiming outbound messaging.'});
 }
 const auditOutstanding=audit.filter(x=>!x.auditAccepted).length;
 const unqualifiedForecast=forecast.filter(x=>!x.qualified).length;
 const openCases=[...capaMap.values()].filter(x=>x.status!=='CLOSED');
 return Object.freeze({
  schemaVersion:'VAOS_WORKFORCE_EXECUTION_BOARD_V1',
  readOnly:true,actionAuthorized:false,releaseHoldOverridden:false,commissioned:false,
  blocked:{count:blocked.length,items:blocked,authority:'ORIGINAL_STATUS_UNCHANGED'},
  audit:{employeesWithoutCompleteReviewedScope:auditOutstanding,
   outstandingRoutes:audit.reduce((sum,x)=>sum+x.requiredRoutes-x.verifiedPassedRoutes,0),results:audit},
  capa:{openCases,unknownRetestEvidence:openCases.filter(x=>x.retestStatus!=='INDEPENDENTLY_VERIFIED').length},
  forecast:{employeesWithoutQualifiedForecast:unqualifiedForecast,results:forecast},
  reporting:{employeesWithRecordedReports:reporting.filter(x=>x.recordedReports>0).length,
   outboundDeliveryCertified:false,results:reporting},
  decision:'EVIDENCE_GATED_ACTION_PLAN_NOT_CERTIFICATION'
 });
}
