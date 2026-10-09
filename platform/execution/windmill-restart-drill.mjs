import {createWindmillDurableLedger} from '../../integrations/windmill/durable-ledger.mjs';

const fail=code=>Object.assign(new Error(code),{code});
const validRun=value=>typeof value==='string'&&/^[0-9]{7,20}$/.test(value);
const validInstance=value=>typeof value==='string'&&/^[A-Za-z0-9-]{8,90}$/.test(value);

/**
 * Live Cloudflare Durable Object restart proof.
 * Caller may invoke ctx.abort ONLY in an isolated DO with an already
 * committed synthetic drill record and separately observed alarm receipt.
 * Does not touch Windmill or delete/release the persisted admission slot.
 */
export function createWindmillRestartDrill({store,now=()=>Date.now()}={}){
  if(typeof store?.get!=='function'||typeof store?.put!=='function'||
    typeof store?.transaction!=='function'||typeof now!=='function')
    throw fail('WINDMILL_RESTART_STORAGE_REQUIRED');
  const ledger=createWindmillDurableLedger({store,now});
  async function original(runId){
    if(!validRun(runId))throw fail('WINDMILL_RESTART_RUN_INVALID');
    const start=await store.get('drill:start');
    const alarm=await store.get('drill:alarm');
    if(start?.runId!==runId||alarm?.runId!==runId||
      alarm?.epoch!==start.epoch||alarm.quarantined!==true)
      throw fail('WINDMILL_RESTART_NOT_ISOLATED');
    const state=await ledger.snapshot();
    if(state.active?.jobId!==start.jobId||state.active?.epoch!==start.epoch||
      state.active?.state!=='QUARANTINED'||state.auditCount!==3||
      state.productionActivation!==false)
      throw fail('WINDMILL_RESTART_STATE_NOT_DURABLE');
    return {start,state};
  }
  async function begin({runId,instanceId,abort}={}){
    if(!validInstance(instanceId)||typeof abort!=='function')
      throw fail('WINDMILL_RESTART_INPUT_INVALID');
    const {start}=await original(runId);
    const existing=await store.get('restart:before');
    if(existing)throw fail('WINDMILL_RESTART_REPLAY');
    await store.put('restart:before',{
      runId,instanceId,
      jobId:start.jobId,epoch:start.epoch,
      deadlineMs:start.deadlineMs,
      auditCount:3,recordedAtMs:now(),
    });
    // Cloudflare ctx.abort immediately terminates the current DO instance.
    // It throws an uncatchable runtime error; the test request is expected
    // to fail, and success is established only by a subsequent fresh RPC.
    abort({retryAlarm:false});
    throw fail('WINDMILL_RESTART_ABORT_NOT_EFFECTIVE');
  }
  async function observe({runId,instanceId}={}){
    if(!validRun(runId)||!validInstance(instanceId))
      throw fail('WINDMILL_RESTART_INPUT_INVALID');
    const existing=await store.get('restart:verified');
    if(existing?.runId===runId)return Object.freeze({
      status:'RESTART_VERIFIED',
      instanceChanged:true,sameDurableObject:true,
      previouslyReservedSlotStillBlocked:true,
      providerDispatchCount:0,productionActivation:false,
    });
    const before=await store.get('restart:before');
    if(!before||before.runId!==runId)
      throw fail('WINDMILL_RESTART_NOT_STARTED');
    if(before.instanceId===instanceId)
      return Object.freeze({
        status:'WAITING',instanceChanged:false,
        productionActivation:false,providerDispatchCount:0,
      });
    const {start,state}=await original(runId);
    if(before.jobId!==start.jobId||before.epoch!==start.epoch||
      before.deadlineMs!==start.deadlineMs||before.auditCount!==state.auditCount)
      throw fail('WINDMILL_RESTART_FENCE_CHANGED');
    const admitted=await ledger.reserve({
      jobId:'drill-'+runId+'-after-restart',
      scriptPath:'f/vaos/qualification_ping',
      authorityRef:'qualification:manual-approved',
      approvedAction:true,productionEnabled:false,maxRuntimeSeconds:1,
    });
    if(admitted.status!=='BLOCKED')
      throw fail('WINDMILL_RESTART_CONCURRENCY_BYPASS');
    await store.put('restart:verified',{
      runId,verifiedAtMs:now(),previousInstanceId:before.instanceId,
      nextInstanceId:instanceId,jobId:start.jobId,epoch:start.epoch,
      blocked:admitted.status==='BLOCKED',
    });
    return Object.freeze({
      status:'RESTART_VERIFIED',instanceChanged:true,
      sameDurableObject:true,previouslyReservedSlotStillBlocked:true,
      providerDispatchCount:0,productionActivation:false,
    });
  }
  return Object.freeze({begin,observe});
}
