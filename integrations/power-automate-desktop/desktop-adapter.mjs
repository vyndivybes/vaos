const PROVIDER_ID='power-automate-desktop';
const CAPABILITY='desktop.automate';
const ACTIVE=new Set(['QUEUED','RUNNING','WAITING']);
const FAILED=new Set(['FAILED','CANCELLED','CANCELED','TIMEDOUT','TIMED_OUT']);

function providerError(code,{message=code,retryable=false,outcomeUnknown=false,providerRunId}={}){
  const e=new Error(message);e.code=code;e.retryable=retryable;e.outcomeUnknown=outcomeUnknown;
  if(providerRunId)e.providerRunId=String(providerRunId);return e;
}
function req(input,key,prefix='PAD_JOB_INVALID'){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw providerError(prefix,{message:`${prefix}:${key}`});return v.trim()}
function clone(v){return structuredClone(v)}
function bounded(v,key,min,max){const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw providerError('PAD_CONFIG_INVALID',{message:`PAD_CONFIG_INVALID:${key}`});return n}
function normalizeConfig(c){
  if(!c?.flows||typeof c.flows!=='object'||Array.isArray(c.flows)||!Object.keys(c.flows).length)throw providerError('PAD_CONFIG_INVALID',{message:'PAD_CONFIG_INVALID:flows'});
  const flows={};
  for(const [key,f] of Object.entries(c.flows)){
    if(typeof key!=='string'||!key.trim()||!f||typeof f!=='object'||Array.isArray(f))throw providerError('PAD_CONFIG_INVALID',{message:'PAD_CONFIG_INVALID:flows'});
    const mode=req(f,'mode','PAD_CONFIG_INVALID').toLowerCase();
    if(!['attended','unattended'].includes(mode))throw providerError('PAD_CONFIG_INVALID',{message:'PAD_CONFIG_INVALID:mode'});
    const effectClass=req(f,'effectClass','PAD_CONFIG_INVALID').toLowerCase();
    if(!['read','write'].includes(effectClass))throw providerError('PAD_CONFIG_INVALID',{message:'PAD_CONFIG_INVALID:effectClass'});
    const allowedInputs=Array.isArray(f.allowedInputs)?[...new Set(f.allowedInputs.map(v=>req({v},'v','PAD_CONFIG_INVALID')))]:[];
    const allowedOutputs=Array.isArray(f.allowedOutputs)?[...new Set(f.allowedOutputs.map(v=>req({v},'v','PAD_CONFIG_INVALID')))]:[];
    flows[key.trim()]=Object.freeze({
      desktopFlowRef:req(f,'desktopFlowRef','PAD_CONFIG_INVALID'),
      machineGroupRef:req(f,'machineGroupRef','PAD_CONFIG_INVALID'),
      mode,effectClass,
      allowedInputs:Object.freeze(allowedInputs),
      allowedOutputs:Object.freeze(allowedOutputs),
    });
  }
  return Object.freeze({
    secretBindingRef:req(c,'secretBindingRef','PAD_CONFIG_INVALID'),
    flows:Object.freeze(flows),
    startTimeoutMs:bounded(c.startTimeoutMs??30000,'startTimeoutMs',1000,300000),
    completionTimeoutMs:bounded(c.completionTimeoutMs??600000,'completionTimeoutMs',1000,43_200_000),
  });
}
function validateDeps({capabilityRegistry,credentialBroker,desktopExecutor}){
  if(!capabilityRegistry||typeof capabilityRegistry.resolve!=='function')throw providerError('PAD_CAPABILITY_REGISTRY_REQUIRED');
  if(!credentialBroker||typeof credentialBroker.withCredential!=='function')throw providerError('PAD_CREDENTIAL_BROKER_REQUIRED');
  if(!desktopExecutor||typeof desktopExecutor.startFlow!=='function'||typeof desktopExecutor.waitForRun!=='function')throw providerError('PAD_EXECUTOR_REQUIRED');
}
function assertQualified(reg){const p=reg.resolve(CAPABILITY,{allowedProviderIds:[PROVIDER_ID]});if(!p||p.providerId!==PROVIDER_ID)throw providerError('PAD_PROVIDER_NOT_QUALIFIED')}
function validateJob(job,cfg){
  const id=req(job,'id'),intentId=req(job,'intentId'),actionType=req(job,'actionType');
  if(!job?.payload||typeof job.payload!=='object'||Array.isArray(job.payload))throw providerError('PAD_JOB_INVALID',{message:'PAD_JOB_INVALID:payload'});
  const flowKey=req(job.payload,'flowKey');
  const flow=cfg.flows[flowKey];
  if(!flow)throw providerError('PAD_FLOW_NOT_ALLOWED');
  const inputs=job.payload.inputs&&typeof job.payload.inputs==='object'&&!Array.isArray(job.payload.inputs)?clone(job.payload.inputs):{};
  for(const key of Object.keys(inputs))if(!flow.allowedInputs.includes(key))throw providerError('PAD_INPUT_NOT_ALLOWED');
  if(flow.effectClass==='write'&&(typeof job.payload.desktopAuthorityRef!=='string'||!job.payload.desktopAuthorityRef.trim()))throw providerError('PAD_AUTHORITY_REQUIRED');
  return Object.freeze({
    id,intentId,actionType,flowKey,flow,inputs,
    desktopAuthorityRef:flow.effectClass==='write'?job.payload.desktopAuthorityRef.trim():null,
  });
}
function credReq(cfg,job){return{bindingRef:cfg.secretBindingRef,providerId:PROVIDER_ID,capability:CAPABILITY,executionJobId:job.id,intentId:job.intentId}}
function filterOutputs(outputs,allowed){
  if(!outputs||typeof outputs!=='object'||Array.isArray(outputs))return {};
  const result={};for(const key of allowed)if(Object.prototype.hasOwnProperty.call(outputs,key))result[key]=clone(outputs[key]);
  return result;
}
function verifyRun(row,runId,job){
  if(!row||typeof row!=='object'||String(row.runId)!==String(runId)||row.desktopFlowRef!==job.flow.desktopFlowRef||row.machineGroupRef!==job.flow.machineGroupRef||String(row.mode||'').toLowerCase()!==job.flow.mode)throw providerError('PAD_VERIFICATION_FAILED',{providerRunId:runId});
  const status=String(row.status||'').replace(/\s+/g,'').toUpperCase();
  if(ACTIVE.has(status))throw providerError('PAD_RUN_INCOMPLETE',{providerRunId:runId,retryable:false,outcomeUnknown:true});
  if(FAILED.has(status))throw providerError('PAD_RUN_FAILED',{providerRunId:runId,retryable:false,outcomeUnknown:false});
  if(status!=='SUCCEEDED')throw providerError('PAD_VERIFICATION_FAILED',{providerRunId:runId});
  return Object.freeze({outputs:filterOutputs(row.outputs,job.flow.allowedOutputs)});
}
export function createPowerAutomateDesktopAdapter({capabilityRegistry,credentialBroker,desktopExecutor,config}={}){
  validateDeps({capabilityRegistry,credentialBroker,desktopExecutor});const cfg=normalizeConfig(config);
  async function execute(inputJob){
    const job=validateJob(inputJob,cfg);assertQualified(capabilityRegistry);
    let started=false,startResult;
    try{
      startResult=await credentialBroker.withCredential(credReq(cfg,job),async credential=>{
        if(credential?.kind!=='desktop-session')throw providerError('PAD_CREDENTIAL_KIND_INVALID');
        started=true;
        return desktopExecutor.startFlow({
          executionJobId:job.id,intentId:job.intentId,flowKey:job.flowKey,
          desktopFlowRef:job.flow.desktopFlowRef,machineGroupRef:job.flow.machineGroupRef,
          mode:job.flow.mode,effectClass:job.flow.effectClass,inputs:clone(job.inputs),
          desktopAuthorityRef:job.desktopAuthorityRef,
          session:{kind:credential.kind,value:credential.value},
          timeoutMs:cfg.startTimeoutMs,
        });
      });
    }catch(error){
      if(!started||error?.started===false)throw providerError('PAD_EXECUTOR_UNAVAILABLE',{retryable:true,outcomeUnknown:false});
      throw providerError('PAD_OUTCOME_UNKNOWN',{retryable:false,outcomeUnknown:true});
    }
    const runId=(typeof startResult?.runId==='string'&&startResult.runId.trim())||Number.isFinite(startResult?.runId)?String(startResult.runId).trim():'';
    if(!runId)throw providerError('PAD_OUTCOME_UNKNOWN',{retryable:false,outcomeUnknown:true});

    let row;
    try{
      row=await desktopExecutor.waitForRun({
        runId,desktopFlowRef:job.flow.desktopFlowRef,machineGroupRef:job.flow.machineGroupRef,
        mode:job.flow.mode,timeoutMs:cfg.completionTimeoutMs,
      });
    }catch{
      throw providerError('PAD_RUN_STATUS_PENDING',{providerRunId:runId,retryable:false,outcomeUnknown:true});
    }
    const verified=verifyRun(row,runId,job);
    return Object.freeze({
      adapterId:'power-automate-desktop.v1',providerId:PROVIDER_ID,capability:CAPABILITY,
      effect:Object.freeze({
        effectType:'DESKTOP.FLOW_COMPLETED',resourceType:'POWER_AUTOMATE_DESKTOP_RUN',resourceId:runId,state:'SUCCEEDED',
        flowKey:job.flowKey,output:Object.freeze(verified.outputs),canonicalStateUpdated:false,
      }),
      verification:Object.freeze({
        verified:true,resourceType:'POWER_AUTOMATE_DESKTOP_RUN',resourceId:runId,
        desktopFlowRef:job.flow.desktopFlowRef,machineGroupRef:job.flow.machineGroupRef,mode:job.flow.mode,
        evidenceSource:'power-automate-desktop.runner-readback',executionJobId:job.id,intentId:job.intentId,
      }),
    });
  }
  return Object.freeze({id:'power-automate-desktop.v1',providerId:PROVIDER_ID,capability:CAPABILITY,execute});
}
