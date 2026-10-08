import { createHash } from 'node:crypto';

/**
 * VYNDI OS schedule bridge, v1.
 *
 * Pure, read-only evaluation. `trustedApproval` MUST be obtained by a
 * server-side VAOS governance reader; NEVER take it from the VYNDI export,
 * a browser-supplied JSON body or an unauthenticated external callback.
 * This module cannot approve a baseline or execute an escalation.
 */

const BASELINE='vyndi.program.baseline.v1';
const PROGRESS='vyndi.program.progress.v1';
const APPROVAL_SOURCE='VAOS_TRUSTED_APPROVAL_REGISTRY';
const APPROVED='APPROVED';
const MAX_PROGRESS_AGE_MS=24*60*60*1000;
const TIMESTAMP=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;

function required(value,code){
  if(typeof value!=='string'||!value.trim())throw new Error(code);
  return value.trim();
}
function instant(value,code) {
  if(typeof value!=='string'||!TIMESTAMP.test(value)||!Number.isFinite(Date.parse(value))) {
    throw new Error(code);
  }
  return Date.parse(value);
}
function taskList(rows,kind){
  if(!Array.isArray(rows)||!rows.length||rows.length>500)throw new Error(kind+'_TASKS_INVALID');
  const seen=new Set();
  const items=rows.map(row=>{
    const id=required(row?.id,kind+'_TASK_ID_REQUIRED');
    if(seen.has(id))throw new Error(kind+'_TASK_ID_DUPLICATED');
    seen.add(id);
    const sourceRef=required(row?.sourceRef,kind+'_SOURCE_REF_REQUIRED');
    if(kind==='BASELINE'){
      const plannedFinish=required(row?.plannedFinish,'BASELINE_TIMESTAMP_INVALID');
      instant(plannedFinish,'BASELINE_TIMESTAMP_INVALID');
      return {id,owner:required(row?.owner,'BASELINE_OWNER_REQUIRED'),plannedFinish,sourceRef};
    }
    const status=required(row?.status,'PROGRESS_STATUS_INVALID').toLowerCase();
    if(!['planned','ready','in_progress','blocked','complete','waived'].includes(status)) {
      throw new Error('PROGRESS_STATUS_INVALID');
    }
    const actualFinish=row.actualFinish??null;
    if(actualFinish!==null)instant(actualFinish,'PROGRESS_ACTUAL_TIMESTAMP_INVALID');
    if(status!=='complete'&&actualFinish!==null)throw new Error('PROGRESS_FINISH_STATUS_CONFLICT');
    return {id,status,actualFinish,sourceRef};
  });
  return items.sort((a,b)=>a.id.localeCompare(b.id));
}
function normalizedBaseline(input){
  if(input?.schemaVersion!==BASELINE||input?.sourceSystem!=='VYNDI_OS')
    throw new Error('BASELINE_CONTRACT_INVALID');
  return {
    schemaVersion:BASELINE,sourceSystem:'VYNDI_OS',
    projectId:required(input.projectId,'BASELINE_PROJECT_REQUIRED'),
    revision:required(input.revision,'BASELINE_REVISION_REQUIRED'),
    tasks:taskList(input.tasks,'BASELINE'),
  };
}
function normalizedProgress(input){
  if(input?.schemaVersion!==PROGRESS||input?.sourceSystem!=='VYNDI_OS')
    throw new Error('PROGRESS_CONTRACT_INVALID');
  return {
    projectId:required(input.projectId,'PROGRESS_PROJECT_REQUIRED'),
    capturedAt:required(input.capturedAt,'PROGRESS_CAPTURE_REQUIRED'),
    tasks:taskList(input.tasks,'PROGRESS'),
  };
}
function digest(value) {
  return createHash('sha256').update(JSON.stringify(value),'utf8').digest('hex');
}

/** Candidate content fingerprint. A hash alone never grants approval. */
export function fingerprintProposedBaseline(baseline) {
  return digest(normalizedBaseline(baseline));
}

/**
 * Compare CURRENT VYNDI progress with an separately approved, hash-bound
 * baseline. Approval objects are accepted only from trusted VAOS server code.
 * Returns WITHHELD on missing, contradictory, stale, or unauthenticated data.
 */
export function evaluateApprovedProgramSchedule({
  baseline, progress, approval, observedAt=new Date().toISOString(),
}={}) {
  const withheld=(reason)=>({
    status:'WITHHELD',reason,projectId:baseline?.projectId||null,
    findings:[],approvalRef:null,sourceBaselineSha256:null,
    scope:'APPROVED_PROGRAM_BASELINE_ONLY',
  });
  let approvedBaseline,latest,hash,nowMs;
  try{
    nowMs=instant(observedAt,'OBSERVATION_TIMESTAMP_INVALID');
    approvedBaseline=normalizedBaseline(baseline);
    latest=normalizedProgress(progress);
    hash=digest(approvedBaseline);
  }catch(error){return withheld(error?.message||'SCHEDULE_EVIDENCE_INVALID');}
  if(!approval||approval.source!==APPROVAL_SOURCE||approval.status!==APPROVED) {
    return withheld('INDEPENDENT_APPROVAL_REQUIRED');
  }
  if(approval.projectId!==approvedBaseline.projectId
      || approval.revision!==approvedBaseline.revision
      || approval.approvedBaselineSha256!==hash
      || !/^[a-f0-9]{64}$/.test(approval.approvedBaselineSha256||'')) {
    return withheld('APPROVED_BASELINE_HASH_OR_REVISION_MISMATCH');
  }
  let approvedAtMs,observedMs;
  try{
    required(approval.approvalRef,'APPROVAL_REFERENCE_REQUIRED');
    const maker=required(approval.submittedBy,'APPROVAL_MAKER_REQUIRED');
    const checker=required(approval.approvedBy,'APPROVAL_CHECKER_REQUIRED');
    if(maker===checker)throw new Error('INDEPENDENT_APPROVAL_REQUIRED');
    approvedAtMs=instant(approval.approvedAt,'APPROVAL_TIMESTAMP_INVALID');
    observedMs=instant(latest.capturedAt,'PROGRESS_CAPTURE_INVALID');
  }catch(error){return withheld(error?.message||'APPROVAL_EVIDENCE_INVALID');}
  if(approvedAtMs>nowMs||approvedAtMs>observedMs) {
    return withheld('UNAPPROVED_OR_PRE_APPROVAL_PROGRESS');
  }
  if(latest.projectId!==approvedBaseline.projectId) {
    return withheld('PROGRESS_PROJECT_MISMATCH');
  }
  if(observedMs>nowMs||nowMs-observedMs>MAX_PROGRESS_AGE_MS) {
    return withheld('PROGRESS_STALE_OR_FUTURE');
  }
  const approvedIds=new Set(approvedBaseline.tasks.map(t=>t.id));
  if(latest.tasks.some(t=>!approvedIds.has(t.id))) {
    return withheld('UNAPPROVED_NEW_TASK_REVISION');
  }
  const byId=new Map(latest.tasks.map(t=>[t.id,t]));
  const findings=[];
  for(const task of approvedBaseline.tasks){
    const current=byId.get(task.id);
    if(!current){
      findings.push({code:'MISSING_PROGRESS',taskId:task.id,owner:task.owner,
        baselineRevision:approvedBaseline.revision,sourceRef:task.sourceRef,
        approvedFinish:task.plannedFinish});
      continue;
    }
    if(current.sourceRef!==task.sourceRef)return withheld('SOURCE_REFERENCE_MISMATCH');
    const deadline=Date.parse(task.plannedFinish);
    const common={taskId:task.id,owner:task.owner,
      baselineRevision:approvedBaseline.revision,
      sourceRef:task.sourceRef,approvedFinish:task.plannedFinish};
    if(current.status==='complete'){
      if(current.actualFinish===null){
        findings.push({code:'MISSING_ACTUAL_FINISH',...common});
      }else if(Date.parse(current.actualFinish)>deadline){
        findings.push({code:'LATE_COMPLETION',...common,actualFinish:current.actualFinish});
      }
    }else if(current.status==='waived'){
      findings.push({code:'WAIVER_REQUIRES_REVIEW',...common});
    }else if(nowMs>deadline){
      findings.push({code:'BASELINE_DELAY',...common,status:current.status});
    }
  }
  findings.sort((a,b)=>a.taskId.localeCompare(b.taskId)||a.code.localeCompare(b.code));
  return {
    status:'VERIFIED',projectId:approvedBaseline.projectId,
    revision:approvedBaseline.revision,observedAt,
    progressCapturedAt:latest.capturedAt,
    sourceBaselineSha256:hash,approvalRef:approval.approvalRef,
    scope:'APPROVED_PROGRAM_BASELINE_ONLY',findings,
  };
}

/**
 * Advisory ONLY. Never executes an approval, sends communication, changes
 * milestone dates, or promotes a mission through its human gate.
 */
export function prepareScheduleEscalationRecommendation(assessment) {
  if(assessment?.status!=='VERIFIED'){
    return {status:'NOT_ELIGIBLE',executed:false,approvalStatus:'NOT_REQUESTED'};
  }
  const delayed=(assessment.findings||[]).filter(f=>
    ['BASELINE_DELAY','LATE_COMPLETION'].includes(f.code));
  if(!delayed.length){
    return {status:'NO_ESCALATION',executed:false,approvalStatus:'NOT_REQUESTED'};
  }
  return {
    status:'HUMAN_REVIEW_REQUIRED',action:'PROJECT.ESCALATE_BLOCKER',
    approvalStatus:'PENDING_HUMAN',executed:false,
    projectId:assessment.projectId,baselineRevision:assessment.revision,
    sourceBaselineSha256:assessment.sourceBaselineSha256,
    approvalRef:assessment.approvalRef,
    proposedFindings:delayed,
  };
}

/**
 * Adapter for VYNDI OS `vyndi_program_tasks` rows.
 * Output is an UNAPPROVED candidate and is never promoted automatically.
 * VYNDI currently stores planned_finish; date-only values fail downstream
 * until the accountable scheduling authority supplies a timezone cutoff.
 */
export function candidateFromVyndiProgramRows(rows,{projectId,revision}={}) {
  const candidate={
    schemaVersion:BASELINE,sourceSystem:'VYNDI_OS',
    projectId,revision,
    tasks:(rows||[]).map(row=>({
      id:row.id,owner:row.owner,plannedFinish:row.planned_finish,
      sourceRef:row.source_reference,
    })),
  };
  normalizedBaseline(candidate);
  return candidate;
}
