const fail=(code)=>Object.assign(new Error(code),{code,retryable:false});
const PATH='f/vaos/qualification_ping';
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9-]{8,90}$/.test(v);

/** One-shot safe synthetic executor. Caller supplies a restricted authenticated
 * transport; credentials remain in the broker, never in the ledger or evidence.
 */
export function createWindmillExecutionSupervisor({ledger,transport,cancellationController=null}={}){
  if(typeof ledger?.reserve!=='function'||typeof ledger?.beginDispatch!=='function'||
     typeof ledger?.recordProviderRun!=='function'||typeof ledger?.finish!=='function'||
     typeof transport?.runScript!=='function'||typeof transport?.waitForJob!=='function')
    throw fail('WINDMILL_SUPERVISOR_NOT_CONFIGURED');
  async function execute({jobId,challenge,approvedAction}={}){
    if(typeof jobId!=='string'||!jobId||typeof challenge!=='string'||
      !/^[a-f0-9]{32,64}$/.test(challenge)||approvedAction!==true)
      throw fail('WINDMILL_SUPERVISOR_INPUT_INVALID');
    const admitted=await ledger.reserve({
      jobId,scriptPath:PATH,authorityRef:'qualification:manual-approved',
      approvedAction:true,productionEnabled:false,maxRuntimeSeconds:60,
    });
    if(admitted.status!=='GRANTED')return {status:admitted.status,productionActivation:false};
    const envelope={jobId,epoch:admitted.epoch};
    // Persist uncertain dispatch state BEFORE sending one POST.
    await ledger.beginDispatch(envelope);
    let sent;
    try{
      sent=await transport.runScript({
        url:'https://app.windmill.dev/api/w/vaos/jobs/run/p/'+PATH,
        method:'POST',body:{challenge},
      });
    }catch{
      throw fail('WINDMILL_SUPERVISOR_DISPATCH_OUTCOME_UNKNOWN');
    }
    const providerRunId=typeof sent?.body==='string'?sent.body.trim():'';
    if(![200,201,202].includes(sent?.status)||!validId(providerRunId))
      throw fail('WINDMILL_SUPERVISOR_DISPATCH_OUTCOME_UNKNOWN');
    await ledger.recordProviderRun({...envelope,providerRunId});
    let job;
    try{
      job=await transport.waitForJob({jobId:providerRunId});
    }catch{
      throw fail('WINDMILL_SUPERVISOR_READBACK_PENDING');
    }
    if(job?.id!==providerRunId||job?.script_path!==PATH||job?.success!==true||
      job?.result?.qualification!=='VAOS_WINDMILL_SYNTHETIC_V1'||
      job?.result?.challenge!==challenge)
      throw fail('WINDMILL_SUPERVISOR_TERMINAL_UNVERIFIED');
    await ledger.finish({
      ...envelope,providerRunId,verified:true,terminalState:'SUCCEEDED',
      verificationSource:'windmill.api.job-readback',evidenceRef:'windmill-readback:'+providerRunId,
    });
    return Object.freeze({status:'SUCCEEDED_VERIFIED',providerRunId,productionActivation:false});
  }
  async function cancelVerified({jobId,epoch,providerRunId,authorizationRef,token,readToken,evidenceRef}={}){
    if(typeof cancellationController?.cancelAndVerify!=='function')throw fail('WINDMILL_CANCEL_NOT_CONFIGURED');
    await ledger.requestCancellation({jobId,epoch});
    const proof=await cancellationController.cancelAndVerify({
      providerRunId,scriptPath:PATH,authorizationRef,token,readToken,
    });
    if(proof?.status!=='CANCELLED_VERIFIED'||proof.providerRunId!==providerRunId)
      throw fail('WINDMILL_CANCEL_TERMINAL_UNVERIFIED');
    await ledger.finish({
      jobId,epoch,providerRunId,verified:true,terminalState:'CANCELLED',
      verificationSource:'windmill.api.job-readback',evidenceRef,
    });
    return Object.freeze({status:'CANCELLED_VERIFIED',providerRunId,productionActivation:false});
  }
  return Object.freeze({execute,cancelVerified});
}
