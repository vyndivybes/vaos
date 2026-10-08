const PATH='f/vaos/qualification_ping';
const fail=(code)=>Object.assign(new Error(code),{code});
const text=(v,min=1,max=120)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max;
const providerId=v=>text(v,8,90)&&/^[A-Za-z0-9-]+$/.test(v);
const validEpoch=v=>Number.isSafeInteger(v)&&v>0;
const STATES=Object.freeze(['RESERVED','DISPATCHING','RUNNING','CANCEL_PENDING','QUARANTINED']);
function validatePermit(v){
  if(!v||!/^[a-zA-Z0-9][a-zA-Z0-9-]{1,79}$/.test(v.jobId||'')||
    v.scriptPath!==PATH||v.authorityRef!=='qualification:manual-approved'||
    v.approvedAction!==true||v.productionEnabled!==false||
    !Number.isSafeInteger(v.maxRuntimeSeconds)||v.maxRuntimeSeconds<1||
    v.maxRuntimeSeconds>60)throw fail('WINDMILL_ADMISSION_PERMIT_INVALID');
}
function redactActive(a){
  if(!a)return null;
  const {jobId,epoch,state,providerRunId,deadlineMs}=a;
  return {jobId,epoch,state,providerRunId:providerRunId||null,deadlineMs};
}

/** Durable ledger backed by Cloudflare SQLite Durable Object transactional KV.
 * A slot remains occupied after timeout until independent terminal readback.
 * This module never dispatches Windmill jobs or carries bearer credentials.
 */
export function createWindmillDurableLedger({store,now=()=>Date.now()}={}){
  if(typeof store?.transaction!=='function'||typeof now!=='function')throw fail('WINDMILL_ADMISSION_STORAGE_REQUIRED');
  const transact=fn=>store.transaction(fn);
  const audit=async(tx,type,active,at)=>{
    const n=(await tx.get('auditSequence')||0)+1;
    await tx.put('auditSequence',n);
    await tx.put('audit:'+String(n).padStart(12,'0'),{
      sequence:n,type,jobId:active.jobId,epoch:active.epoch,
      atMs:at,
      providerRunId:active.providerRunId||null,
    });
  };
  const nowMs=()=>{
    const value=now();
    if(!Number.isSafeInteger(value)||value<0)throw fail('WINDMILL_ADMISSION_CLOCK_INVALID');
    return value;
  };
  async function reserve(input){
    validatePermit(input);
    return transact(async tx=>{
      const a=await tx.get('active');
      if(a){
        if(a.jobId===input.jobId)return {status:'ALREADY_RESERVED',epoch:a.epoch,state:a.state};
        return {status:'BLOCKED',reason:'GLOBAL_SINGLE_SLOT_OCCUPIED'};
      }
      const epoch=(await tx.get('epoch')||0)+1;
      const at=nowMs();
      const record={
        jobId:input.jobId,epoch,state:'RESERVED',
        providerRunId:null,deadlineMs:at+input.maxRuntimeSeconds*1000,
      };
      await tx.put('epoch',epoch);
      await tx.put('active',record);
      await audit(tx,'WINDMILL.ADMISSION.RESERVED',record,at);
      return {status:'GRANTED',epoch,deadlineMs:record.deadlineMs};
    });
  }
  function fence(record,input,states){
    if(!record||record.jobId!==input?.jobId||record.epoch!==input?.epoch||
      !validEpoch(input.epoch)||!states.includes(record.state))throw fail('WINDMILL_ADMISSION_FENCE_REJECTED');
  }
  async function update(input,states,type,mutate){
    return transact(async tx=>{
      const a=await tx.get('active');
      fence(a,input,states);
      const at=nowMs();
      const next=mutate({...a},at);
      await tx.put('active',next);
      await audit(tx,type,next,at);
      return redactActive(next);
    });
  }
  async function beginDispatch(input){
    return update(input,['RESERVED'],'WINDMILL.DISPATCH.BEGUN',a=>{
      if(nowMs()>=a.deadlineMs)throw fail('WINDMILL_ADMISSION_LEASE_EXPIRED');
      return {...a,state:'DISPATCHING'};
    });
  }
  async function recordProviderRun(input){
    if(!providerId(input?.providerRunId))throw fail('WINDMILL_PROVIDER_RUN_ID_INVALID');
    return update(input,['DISPATCHING'],'WINDMILL.RUN.RECORDED',a=>({...a,state:'RUNNING',providerRunId:input.providerRunId}));
  }
  async function requestCancellation(input){
    return update(input,['RUNNING','QUARANTINED'],'WINDMILL.CANCEL.REQUESTED',a=>{
      if(!providerId(a.providerRunId))throw fail('WINDMILL_CANCELLATION_NO_PROVIDER_RUN');
      return {...a,state:'CANCEL_PENDING'};
    });
  }
  async function finish(input){
    if(input?.verified!==true ||
      input?.verificationSource!=='windmill.api.job-readback' ||
      !['SUCCEEDED','FAILED','CANCELLED'].includes(input?.terminalState)||
      !providerId(input?.providerRunId) ||
      !text(input?.evidenceRef,5,200) ||
      !/^[A-Za-z0-9:._/-]+$/.test(input.evidenceRef))throw fail('WINDMILL_TERMINAL_PROOF_REQUIRED');
    return transact(async tx=>{
      const a=await tx.get('active');
      fence(a,input,['RUNNING','CANCEL_PENDING','QUARANTINED']);
      if(a.providerRunId!==input.providerRunId)throw fail('WINDMILL_TERMINAL_RUN_MISMATCH');
      const at=nowMs();
      await audit(tx,'WINDMILL.RUN.'+input.terminalState,a,at);
      await tx.put('lastTerminal',{
        jobId:a.jobId,epoch:a.epoch,providerRunId:a.providerRunId,
        terminalState:input.terminalState,evidenceRef:input.evidenceRef,atMs:at,
      });
      await tx.put('active',null);
      return {status:'RELEASED',terminalState:input.terminalState};
    });
  }
  async function expire(){
    return transact(async tx=>{
      const a=await tx.get('active');
      if(a&&STATES.includes(a.state)&&a.state!=='QUARANTINED'&&nowMs()>=a.deadlineMs){
        const quarantined={...a,state:'QUARANTINED'};
        await tx.put('active',quarantined);
        await audit(tx,'WINDMILL.RUN.TIMED_OUT_QUARANTINED',quarantined,nowMs());
        return {active:redactActive(quarantined),quarantined:true};
      }
      return {active:redactActive(a),quarantined:a?.state==='QUARANTINED'};
    });
  }
  async function snapshot(){
    return transact(async tx=>{
      const a=await tx.get('active');
      return Object.freeze({
        schemaVersion:'vaos.windmill.durable-admission.v1',
        active:redactActive(a),
        auditCount:await tx.get('auditSequence')||0,
        maxConcurrentRuns:1,queuedRuns:0,
        productionActivation:false,
        failClosed:a!==null&&a!==undefined,
      });
    });
  }
  return Object.freeze({reserve,beginDispatch,recordProviderRun,requestCancellation,finish,expire,snapshot});
}
