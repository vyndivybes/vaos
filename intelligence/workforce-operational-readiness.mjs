/** Founder-only workforce readiness diagnostic. LastVerifiedActivityAt from the
 * SQL projection is a persisted heartbeat timestamp, not proof that an AI
 * employee is running a job or has independently passed a live competence test.
 */
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const ID=/^[a-z][a-z0-9-]{0,63}$/;
const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(x);
const HOUR=60*60*1000;
export function assessWorkforceOperationalReadiness(employees=[],observedAt){
 if(!Array.isArray(employees)||employees.length>16||!iso(observedAt))
  throw Error('WORKFORCE_READINESS_INPUT_INVALID');
 const time=Date.parse(observedAt),seen=new Set();
 const mapped=employees.map(row=>{
  if(!isObject(row)||typeof row.id!=='string'||!ID.test(row.id)||seen.has(row.id))
   throw Error('WORKFORCE_READINESS_EMPLOYEE_INVALID');
  seen.add(row.id);
  const raw=row.lastVerifiedActivityAt;
  const valid=iso(raw),age=valid?time-Date.parse(raw):NaN;
  const future=valid&&age<0;
  const recent=valid&&!future&&age<=24*HOUR;
  const stale=valid&&!future&&age>24*HOUR;
  const auditVerified=row.audit?.status==='RECORDED_INDEPENDENT_REVIEWS'&&
   Array.isArray(row.audit.history)&&row.audit.history.length>0&&
   Number.isSafeInteger(row.audit.passed)&&row.audit.passed>0;
  return Object.freeze({
   id:row.id,
   heartbeatStatus:recent?'RECENT_HEARTBEAT_RECORD_ONLY':stale?'STALE_HEARTBEAT_RECORD':'HEARTBEAT_MISSING_OR_INVALID',
   heartbeatAt:(recent||stale)?new Date(Date.parse(raw)).toISOString():null,
   futureHeartbeatInvalid:future,
   assessmentMarkedPass:row.qualificationAssessment?.status==='PASS',
   qualificationQ3Plus:Number.isInteger(row.qualificationLevel)&&row.qualificationLevel>=3&&row.qualificationLevel<=4,
   independentAuditVerified:auditVerified,
   runtimeVerified:false,
   operationallyCommissioned:false,
   productionWriteAuthorized:false
  });
 });
 const count=pred=>mapped.filter(pred).length;
 return Object.freeze({
  schemaVersion:'VAOS_WORKFORCE_OPERATIONAL_EVIDENCE_V1',
  status:'RUNTIME_AND_INDEPENDENT_AUDIT_HOLD',
  observedAt,
  employees:Object.freeze(mapped),
  registeredEmployees:employees.length,
  recentHeartbeatRecords24h:count(e=>e.heartbeatStatus==='RECENT_HEARTBEAT_RECORD_ONLY'),
  staleHeartbeatRecords24h:count(e=>e.heartbeatStatus==='STALE_HEARTBEAT_RECORD'),
  missingOrInvalidHeartbeats:count(e=>e.heartbeatStatus==='HEARTBEAT_MISSING_OR_INVALID'),
  invalidFutureHeartbeats:count(e=>e.futureHeartbeatInvalid),
  assessmentsMarkedPass:count(e=>e.assessmentMarkedPass),
  atLeastQ3Recorded:count(e=>e.qualificationQ3Plus),
  independentlyAuditedEmployees:count(e=>e.independentAuditVerified),
  operationalRuntimeCertified:false,
  employeeCompetenceCertified:false,
  agentDispatchAuthorized:false,actionAuthorized:false,
  note:'Recorded PASS assessment, ACTIVE lifecycle and heartbeat timestamps do not establish verified runtime liveness, departmental audit completion, or unsupervised permission.'
 });
}
