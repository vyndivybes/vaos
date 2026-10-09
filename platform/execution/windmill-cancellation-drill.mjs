const fail=code=>Object.assign(new Error(code),{code});
const validRun=v=>typeof v==='string'&&/^[1-9][0-9]{6,19}$/.test(v);
const validAttempt=v=>typeof v==='string'&&/^[1-9][0-9]{0,3}$/.test(v);
const validJob=v=>typeof v==='string'&&/^[A-Za-z0-9-]{8,90}$/.test(v);
/** One global, isolated cancellation-test slot. It holds on uncertainty or expiry.
 * No Windmill tokens or network requests enter the Durable Object.
 */
export function createWindmillCancellationDrill({store,setAlarm,now=()=>Date.now()}={}){
 if(typeof store?.transaction!=='function'||typeof setAlarm!=='function')throw fail('WINDMILL_HOLD_STORAGE_REQUIRED');
 const audit=async(tx,type,a)=>{const n=(await tx.get('hold:auditSequence')||0)+1;await tx.put('hold:auditSequence',n);await tx.put('hold:audit:'+n,{type,...a,observedAtMs:now()});};
 const fence=(a,p)=>{if(!a||a.runId!==p.runId||a.runAttempt!==p.runAttempt)throw fail('WINDMILL_HOLD_FENCE_REJECTED');};
 const capability=()=>({status:'CANCELLATION_DRILL_READY',schemaVersion:'vaos.windmill.cancellation-admission.v1',productionActivation:false,windmillCalls:0});
 async function start(p){
  if(!validRun(p?.runId)||!validAttempt(p?.runAttempt))throw fail('WINDMILL_HOLD_RUN_INVALID');
  const result=await store.transaction(async tx=>{
   if(await tx.get('hold:active'))throw fail('WINDMILL_HOLD_SLOT_OCCUPIED');
   if(await tx.get('hold:used:'+p.runId))throw fail('WINDMILL_HOLD_REPLAY');
   const a={...p,providerJobId:null,state:'DISPATCHING',deadlineMs:now()+60000};
   await tx.put('hold:active',a);await tx.put('hold:used:'+p.runId,true);await audit(tx,'RESERVED_BEFORE_DISPATCH',a);
   return {...a,status:'GRANTED',maxConcurrentRuns:1,queuedRuns:0,productionActivation:false,windmillCalls:0};
  });
  await setAlarm(result.deadlineMs);
  return result;
 }
 async function advance(p,phase){
  return store.transaction(async tx=>{
   const a=await tx.get('hold:active');fence(a,p);
   if(!validJob(p.providerJobId))throw fail('WINDMILL_HOLD_JOB_INVALID');
   if(phase!=='finish'&&now()>=a.deadlineMs)throw fail('WINDMILL_HOLD_EXPIRED');
   if(phase==='bind'){
    if(a.state!=='DISPATCHING')throw fail('WINDMILL_HOLD_BIND_REPLAY');
    a.providerJobId=p.providerJobId;a.state='RUNNING';
   }else{
    if(a.providerJobId!==p.providerJobId)throw fail('WINDMILL_HOLD_JOB_MISMATCH');
    if(phase==='cancel'){
     if(a.state!=='RUNNING')throw fail('WINDMILL_HOLD_CANCEL_REPLAY');
     a.state='CANCEL_PENDING';
    }else if(phase==='finish'){
     if(!['CANCEL_PENDING','QUARANTINED'].includes(a.state)||p.canceled!==true||p.success!==false)throw fail('WINDMILL_HOLD_TERMINAL_PROOF_REQUIRED');
     await audit(tx,'CANCELLED_VERIFIED',a);await tx.put('hold:lastTerminal',{...a,canceled:true,success:false});
     await tx.put('hold:active',null);
     return {status:'RELEASED',productionActivation:false,windmillCalls:0};
    }else throw fail('WINDMILL_HOLD_PHASE_INVALID');
   }
   await tx.put('hold:active',a);await audit(tx,phase.toUpperCase(),a);
   return {status:phase==='bind'?'BOUND':'CANCEL_AUTHORIZED',productionActivation:false,windmillCalls:0};
  });
 }
 async function expire(){
  return store.transaction(async tx=>{
   const a=await tx.get('hold:active');
   if(a&&a.state!=='QUARANTINED'&&now()>=a.deadlineMs){a.state='QUARANTINED';await tx.put('hold:active',a);await audit(tx,'TIMED_OUT_QUARANTINED',a);}
   return {active:a||null,productionActivation:false,windmillCalls:0};
  });
 }
 async function snapshot(){return store.transaction(async tx=>({status:'SNAPSHOT',active:await tx.get('hold:active')||null,auditCount:await tx.get('hold:auditSequence')||0,productionActivation:false,windmillCalls:0}));}
 return Object.freeze({capability,start,bind:p=>advance(p,'bind'),cancel:p=>advance(p,'cancel'),finish:p=>advance(p,'finish'),expire,snapshot});
}
