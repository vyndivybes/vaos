import {createWindmillDurableLedger} from '../../integrations/windmill/durable-ledger.mjs';
const fail=code=>Object.assign(new Error(code),{code});
const isRunId=v=>typeof v==='string'&&/^[1-9][0-9]{6,19}$/.test(v);

/** Cloudflare DO-only, isolated synthetic ledger exercise.
 * It never dispatches, reads, or cancels a real Windmill job.
 * Uses a different Durable Object identity for every GitHub run attempt.
 */
export function createWindmillIsolatedDrill({store,setAlarm,now=()=>Date.now()}={}){
  if(typeof store?.transaction!=='function'||typeof store.get!=='function'||
    typeof store.put!=='function'||typeof setAlarm!=='function'||
    typeof now!=='function')throw fail('WINDMILL_ISOLATED_DRILL_STORAGE_REQUIRED');
  const ledger=()=>createWindmillDurableLedger({store,now});
  async function start(runId){
    if(!isRunId(runId))throw fail('WINDMILL_ISOLATED_DRILL_RUN_INVALID');
    if(await store.get('drill:start'))throw fail('WINDMILL_ISOLATED_DRILL_REPLAY');
    const jobA='drill-'+runId+'-a';
    const jobB='drill-'+runId+'-b';
    const policy=jobId=>({
      jobId,scriptPath:'f/vaos/qualification_ping',
      authorityRef:'qualification:manual-approved',
      approvedAction:true,productionEnabled:false,maxRuntimeSeconds:1,
    });
    const service=ledger();
    const [first,second]=await Promise.all([
      service.reserve(policy(jobA)),service.reserve(policy(jobB)),
    ]);
    const outcomes=[first,second];
    const approved=outcomes.filter(v=>v.status==='GRANTED');
    const refused=outcomes.filter(v=>v.status==='BLOCKED');
    if(approved.length!==1||refused.length!==1)throw fail('WINDMILL_ISOLATED_DRILL_CONCURRENCY_FAILED');
    const chosen=first.status==='GRANTED'?jobA:jobB;
    const lease=approved[0];
    await service.beginDispatch({jobId:chosen,epoch:lease.epoch});
    // Persist verification metadata in SQLite/KV before arming the alarm.
    await store.put('drill:start',{
      runId,jobId:chosen,epoch:lease.epoch,deadlineMs:lease.deadlineMs,
    });
    await setAlarm(lease.deadlineMs);
    const snapshot=await service.snapshot();
    if(snapshot.active?.state!=='DISPATCHING'||snapshot.auditCount!==2)
      throw fail('WINDMILL_ISOLATED_DRILL_ADMISSION_EVIDENCE_INVALID');
    return Object.freeze({
      schemaVersion:'vaos.windmill.cloud-do-selftest.v1',
      status:'STARTED',admission:'PASS',blockedCompetingJob:true,
      auditCount:snapshot.auditCount,
      productionActivation:false,windmillCalls:0,
    });
  }
  async function finish(runId){
    if(!isRunId(runId))throw fail('WINDMILL_ISOLATED_DRILL_RUN_INVALID');
    const startRecord=await store.get('drill:start');
    if(startRecord?.runId!==runId)throw fail('WINDMILL_ISOLATED_DRILL_NOT_STARTED');
    if(now()<startRecord.deadlineMs)throw fail('WINDMILL_ISOLATED_DRILL_NOT_EXPIRED');
    const service=ledger();
    await service.expire();
    const before=await service.snapshot();
    if(before.active?.jobId!==startRecord.jobId||
      before.active?.epoch!==startRecord.epoch||
      before.active?.state!=='QUARANTINED'||before.auditCount!==3)
      throw fail('WINDMILL_ISOLATED_DRILL_PERSISTENCE_FAILED');
    const rejected=await service.reserve({
      jobId:'drill-'+runId+'-c',scriptPath:'f/vaos/qualification_ping',
      authorityRef:'qualification:manual-approved',
      approvedAction:true,productionEnabled:false,maxRuntimeSeconds:1,
    });
    if(rejected.status!=='BLOCKED')throw fail('WINDMILL_ISOLATED_DRILL_QUARANTINE_BYPASS');
    const after=await service.snapshot();
    if(after.active?.state!=='QUARANTINED'||after.auditCount!==3||
      after.productionActivation!==false)throw fail('WINDMILL_ISOLATED_DRILL_AUDIT_INVALID');
    return Object.freeze({
      schemaVersion:'vaos.windmill.cloud-do-selftest.v1',status:'PASS',
      persistedAcrossRequests:true,blockedWhileQuarantined:true,
      quarantined:true,auditCount:after.auditCount,
      productionActivation:false,windmillCalls:0,
      restartEvictionVerified:false,
      cancellationVerified:false,
    });
  }
  return Object.freeze({start,finish,snapshot:()=>ledger().snapshot()});
}
