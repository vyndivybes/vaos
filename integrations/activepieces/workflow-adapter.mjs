const PROVIDER_ID='activepieces';
const CAPABILITY='workflow.orchestrate';
const ACTIVE=new Set(['RUNNING','QUEUED','PAUSED']);
const FAILED=new Set(['FAILED','QUOTA_EXCEEDED','INTERNAL_ERROR','MEMORY_LIMIT_EXCEEDED','TIMEOUT','CANCELED','LOG_SIZE_EXCEEDED']);

function providerError(code,{message=code,retryable=false,outcomeUnknown=false,providerRunId}={}){
  const e=new Error(message);e.code=code;e.retryable=retryable;e.outcomeUnknown=outcomeUnknown;
  if(providerRunId)e.providerRunId=String(providerRunId);return e;
}
function req(input,key,prefix='ACTIVEPIECES_JOB_INVALID'){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw providerError(prefix,{message:`${prefix}:${key}`});return v.trim()}
function clone(v){return structuredClone(v)}
function absoluteHttpUrl(value,key){if(typeof value!=='string'||!value.trim())throw providerError('ACTIVEPIECES_CONFIG_INVALID',{message:`ACTIVEPIECES_CONFIG_INVALID:${key}`});let u;try{u=new URL(value.trim())}catch{throw providerError('ACTIVEPIECES_CONFIG_INVALID',{message:`ACTIVEPIECES_CONFIG_INVALID:${key}`})}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw providerError('ACTIVEPIECES_CONFIG_INVALID',{message:`ACTIVEPIECES_CONFIG_INVALID:${key}`});return u.toString().replace(/\/$/,'')}
function bounded(value,key,min,max){const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw providerError('ACTIVEPIECES_CONFIG_INVALID',{message:`ACTIVEPIECES_CONFIG_INVALID:${key}`});return n}
function normalizeConfig(c){
  if(!c?.flows||typeof c.flows!=='object'||Array.isArray(c.flows)||!Object.keys(c.flows).length)throw providerError('ACTIVEPIECES_CONFIG_INVALID',{message:'ACTIVEPIECES_CONFIG_INVALID:flows'});
  const flows={};
  for(const [key,f] of Object.entries(c.flows)){
    if(typeof key!=='string'||!key.trim()||!f||typeof f!=='object'||Array.isArray(f))throw providerError('ACTIVEPIECES_CONFIG_INVALID',{message:'ACTIVEPIECES_CONFIG_INVALID:flows'});
    flows[key.trim()]=Object.freeze({
      flowId:req(f,'flowId','ACTIVEPIECES_CONFIG_INVALID'),
      projectId:req(f,'projectId','ACTIVEPIECES_CONFIG_INVALID'),
      hookBindingRef:req(f,'hookBindingRef','ACTIVEPIECES_CONFIG_INVALID'),
      apiBindingRef:req(f,'apiBindingRef','ACTIVEPIECES_CONFIG_INVALID'),
    });
  }
  return Object.freeze({
    apiBaseUrl:absoluteHttpUrl(c.apiBaseUrl,'apiBaseUrl'),
    flows:Object.freeze(flows),
    dispatchTimeoutMs:bounded(c.dispatchTimeoutMs??15000,'dispatchTimeoutMs',1000,120000),
    receiptWaitMs:bounded(c.receiptWaitMs??30000,'receiptWaitMs',1000,300000),
    readTimeoutMs:bounded(c.readTimeoutMs??15000,'readTimeoutMs',1000,120000),
  });
}
function validateDeps({capabilityRegistry,credentialBroker,receiptPort,transport}){
  if(!capabilityRegistry||typeof capabilityRegistry.resolve!=='function')throw providerError('ACTIVEPIECES_CAPABILITY_REGISTRY_REQUIRED');
  if(!credentialBroker||typeof credentialBroker.withCredential!=='function')throw providerError('ACTIVEPIECES_CREDENTIAL_BROKER_REQUIRED');
  if(!receiptPort||typeof receiptPort.issue!=='function'||typeof receiptPort.waitForReceipt!=='function')throw providerError('ACTIVEPIECES_RECEIPT_PORT_REQUIRED');
  if(!transport||typeof transport.postHook!=='function'||typeof transport.readRun!=='function')throw providerError('ACTIVEPIECES_TRANSPORT_REQUIRED');
}
function validateJob(job,cfg){
  const id=req(job,'id'),intentId=req(job,'intentId'),actionType=req(job,'actionType');
  if(!job?.payload||typeof job.payload!=='object'||Array.isArray(job.payload))throw providerError('ACTIVEPIECES_JOB_INVALID',{message:'ACTIVEPIECES_JOB_INVALID:payload'});
  const flowKey=req(job.payload,'flowKey');
  const flow=cfg.flows[flowKey];
  if(!flow)throw providerError('ACTIVEPIECES_FLOW_NOT_ALLOWED');
  const input=job.payload.input&&typeof job.payload.input==='object'&&!Array.isArray(job.payload.input)?clone(job.payload.input):{};
  return Object.freeze({id,intentId,actionType,flowKey,flow,input});
}
function assertQualified(reg){const p=reg.resolve(CAPABILITY,{allowedProviderIds:[PROVIDER_ID]});if(!p||p.providerId!==PROVIDER_ID)throw providerError('ACTIVEPIECES_PROVIDER_NOT_QUALIFIED')}
function credReq(bindingRef,job){return{bindingRef,providerId:PROVIDER_ID,capability:CAPABILITY,executionJobId:job.id,intentId:job.intentId}}
function callbackDescriptor(value){if(!value||typeof value!=='object')throw providerError('ACTIVEPIECES_RECEIPT_ISSUE_FAILED');return{receiptRef:req(value,'receiptRef','ACTIVEPIECES_RECEIPT_ISSUE_FAILED'),callbackUrl:req(value,'callbackUrl','ACTIVEPIECES_RECEIPT_ISSUE_FAILED')}}
function validateReceipt(receipt,callback,job){
  if(!receipt||typeof receipt!=='object'||receipt.receiptRef!==callback.receiptRef||receipt.providerId!==PROVIDER_ID||receipt.executionJobId!==job.id||receipt.intentId!==job.intentId||receipt.actionKey!==job.flowKey)throw providerError('ACTIVEPIECES_VERIFICATION_FAILED');
  if(receipt.status==='failed')throw providerError('ACTIVEPIECES_RUN_FAILED',{providerRunId:receipt.evidence?.flowRunId});
  if(receipt.status!=='succeeded')throw providerError('ACTIVEPIECES_VERIFICATION_FAILED');
  const runId=typeof receipt.evidence?.flowRunId==='string'&&receipt.evidence.flowRunId.trim()?receipt.evidence.flowRunId.trim():'';
  if(!runId)throw providerError('ACTIVEPIECES_VERIFICATION_FAILED');
  return runId;
}
function verifyRun(row,runId,job){
  if(!row||typeof row!=='object'||row.id!==runId||row.flowId!==job.flow.flowId||row.projectId!==job.flow.projectId)throw providerError('ACTIVEPIECES_VERIFICATION_FAILED',{providerRunId:runId});
  const status=String(row.status||'').toUpperCase();
  if(ACTIVE.has(status))throw providerError('ACTIVEPIECES_RUN_INCOMPLETE',{providerRunId:runId,retryable:false,outcomeUnknown:true});
  if(FAILED.has(status))throw providerError('ACTIVEPIECES_RUN_FAILED',{providerRunId:runId,retryable:false,outcomeUnknown:false});
  if(status!=='SUCCEEDED')throw providerError('ACTIVEPIECES_VERIFICATION_FAILED',{providerRunId:runId});
}
export function createActivepiecesWorkflowAdapter({capabilityRegistry,credentialBroker,receiptPort,transport,config}={}){
  validateDeps({capabilityRegistry,credentialBroker,receiptPort,transport});const cfg=normalizeConfig(config);
  async function execute(inputJob){
    const job=validateJob(inputJob,cfg);assertQualified(capabilityRegistry);
    let callback;
    try{callback=callbackDescriptor(await receiptPort.issue({providerId:PROVIDER_ID,capability:CAPABILITY,executionJobId:job.id,intentId:job.intentId,actionKey:job.flowKey}))}
    catch(error){if(error?.code==='ACTIVEPIECES_RECEIPT_ISSUE_FAILED')throw error;throw providerError('ACTIVEPIECES_RECEIPT_ISSUE_FAILED',{retryable:true})}

    let started=false;
    try{
      await credentialBroker.withCredential(credReq(job.flow.hookBindingRef,job),async credential=>{
        if(credential?.kind!=='url')throw providerError('ACTIVEPIECES_HOOK_CREDENTIAL_INVALID');
        started=true;
        const response=await transport.postHook({
          url:credential.value,method:'POST',timeoutMs:cfg.dispatchTimeoutMs,
          headers:{'Content-Type':'application/json',Accept:'application/json','X-VAOS-EXECUTION-JOB-ID':job.id,'X-VAOS-INTENT-ID':job.intentId},
          body:{schemaVersion:'vaos.activepieces.workflow.v1',executionJobId:job.id,intentId:job.intentId,flowKey:job.flowKey,input:clone(job.input),callbackUrl:callback.callbackUrl},
        });
        const status=Number(response?.status);
        if(status===429)throw providerError('ACTIVEPIECES_RATE_LIMITED',{retryable:true});
        if(status<200||status>=300)throw providerError(status>=500?'ACTIVEPIECES_OUTCOME_UNKNOWN':'ACTIVEPIECES_DISPATCH_REJECTED',{outcomeUnknown:status>=500,retryable:false});
      });
    }catch(error){
      if(error?.code?.startsWith?.('CREDENTIAL_')||error?.code==='ACTIVEPIECES_HOOK_CREDENTIAL_INVALID'||error?.code==='ACTIVEPIECES_RATE_LIMITED'||error?.code==='ACTIVEPIECES_DISPATCH_REJECTED')throw error;
      if(!started||error?.requestSent===false)throw providerError('ACTIVEPIECES_DISPATCH_UNAVAILABLE',{retryable:true,outcomeUnknown:false});
      throw providerError('ACTIVEPIECES_OUTCOME_UNKNOWN',{retryable:false,outcomeUnknown:true});
    }

    let receipt;
    try{receipt=await receiptPort.waitForReceipt({receiptRef:callback.receiptRef,providerId:PROVIDER_ID,executionJobId:job.id,intentId:job.intentId,actionKey:job.flowKey,timeoutMs:cfg.receiptWaitMs})}
    catch{throw providerError('ACTIVEPIECES_RECEIPT_PENDING',{retryable:false,outcomeUnknown:true})}
    const runId=validateReceipt(receipt,callback,job);

    let row;
    try{
      row=await credentialBroker.withCredential(credReq(job.flow.apiBindingRef,job),async credential=>{
        if(credential?.kind!=='bearer')throw providerError('ACTIVEPIECES_API_CREDENTIAL_INVALID');
        return transport.readRun({
          url:`${cfg.apiBaseUrl}/flow-runs/${encodeURIComponent(runId)}`,
          method:'GET',timeoutMs:cfg.readTimeoutMs,
          headers:{Authorization:`Bearer ${credential.value}`,Accept:'application/json'},
        });
      });
    }catch(error){
      if(error?.code?.startsWith?.('CREDENTIAL_')||error?.code==='ACTIVEPIECES_API_CREDENTIAL_INVALID')throw error;
      throw providerError('ACTIVEPIECES_RUN_INCOMPLETE',{providerRunId:runId,retryable:false,outcomeUnknown:true});
    }
    verifyRun(row,runId,job);

    return Object.freeze({
      adapterId:'activepieces.workflow.v1',providerId:PROVIDER_ID,capability:CAPABILITY,
      effect:Object.freeze({effectType:'WORKFLOW.COMPLETED',resourceType:'ACTIVEPIECES_FLOW_RUN',resourceId:runId,state:'SUCCEEDED',flowKey:job.flowKey}),
      verification:Object.freeze({verified:true,resourceType:'ACTIVEPIECES_FLOW_RUN',resourceId:runId,flowId:job.flow.flowId,projectId:job.flow.projectId,evidenceSource:'activepieces.callback+flow-run-readback',executionJobId:job.id,intentId:job.intentId}),
    });
  }
  return Object.freeze({id:'activepieces.workflow.v1',providerId:PROVIDER_ID,capability:CAPABILITY,execute});
}
