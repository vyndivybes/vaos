const fail=code=>Object.assign(new Error(code),{code});
const BASE='https://app.windmill.dev/api/w/vaos/';
const SCRIPT='f/vaos/qualification_hold';
const jobId=value=>typeof value==='string'&&/^[A-Za-z0-9-]{8,90}$/.test(value);
/** Restricted cancellation probe for a *single* approved synthetic Windmill script.
 * Never force-cancels, never retries POST, never returns bearer credentials.
 */
export function createWindmillCancellationController({
  httpTransport,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),maxPolls=20,expectedScriptHash='92dd4d9b9bff2d1d',beforeCancel=async()=>{},
}={}){
  if(typeof httpTransport?.request!=='function'||typeof sleep!=='function'||typeof beforeCancel!=='function'||
    !Number.isInteger(maxPolls)||maxPolls<1||maxPolls>20)throw fail('WINDMILL_CANCEL_CONFIG_INVALID');
  async function cancelAndVerify({
    providerRunId,scriptPath,authorizationRef,token,readToken,
  }={}){
    if(!jobId(providerRunId)||scriptPath!==SCRIPT||
      authorizationRef!=='qualification:operator-approved'||
      typeof token!=='string'||!token||
      typeof readToken!=='string'||!readToken||token===readToken)throw fail('WINDMILL_CANCEL_NOT_AUTHORIZED');
    async function readJob(){
      let read;
      try{read=await httpTransport.request({
        url:BASE+'jobs_u/get/'+encodeURIComponent(providerRunId),
        method:'GET',headers:{Authorization:'Bearer '+readToken,Accept:'application/json'},
        timeoutMs:5000,allowedResponseTypes:['application/json'],
      });}catch{throw fail('WINDMILL_CANCEL_READBACK_UNAVAILABLE')}
      if(read?.status!==200)throw fail('WINDMILL_CANCEL_READBACK_FORBIDDEN');
      const job=read.body;
      if(job?.id!==providerRunId||job?.script_path!==SCRIPT)throw fail('WINDMILL_CANCEL_JOB_MISMATCH');
      if(job.script_hash!==expectedScriptHash)throw fail('WINDMILL_CANCEL_SCRIPT_VERSION_MISMATCH');
      return job;
    }
    let running=false;
    for(let i=0;i<maxPolls;i++){
      const job=await readJob();
      if(job.success!==undefined||job.canceled===true)throw fail('WINDMILL_CANCEL_JOB_ALREADY_TERMINAL');
      if(job.running===true){running=true;break;}
      if(i<maxPolls-1)await sleep(750);
    }
    if(!running)throw fail('WINDMILL_CANCEL_JOB_NOT_RUNNING');
    await beforeCancel({providerRunId,scriptPath:SCRIPT});
    let response;
    try{
      response=await httpTransport.request({
        url:BASE+'jobs_u/queue/cancel/'+encodeURIComponent(providerRunId),
        method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'},
        body:{reason:'VAOS synthetic qualification operator cancellation'},
        timeoutMs:10000,allowedResponseTypes:['application/json','text/plain'],
      });
    }catch{throw fail('WINDMILL_CANCEL_OUTCOME_UNKNOWN')}
    if(![200,201,202,204].includes(response?.status))throw fail('WINDMILL_CANCEL_REJECTED');
    // Cancellation acknowledgment is NOT proof the job stopped.
    for(let i=0;i<maxPolls;i++){
      const job=await readJob();
      if(job.canceled===true&&job.success===false){
        return Object.freeze({
          status:'CANCELLED_VERIFIED',providerRunId,scriptPath:SCRIPT,
          runningBeforeCancellation:true,cancelPostAttemptCount:1,
          verificationSource:'windmill.api.job-readback',
          productionActivation:false,
        });
      }
      if(job.success===true)throw fail('WINDMILL_CANCEL_JOB_ALREADY_SUCCEEDED');
      if(i<maxPolls-1)await sleep(750);
    }
    throw fail('WINDMILL_CANCEL_NOT_TERMINAL');
  }
  return Object.freeze({cancelAndVerify});
}
