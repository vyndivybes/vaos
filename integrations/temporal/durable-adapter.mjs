const PROVIDER_ID='temporal';
const CAPABILITY='workflow.durable';
const START_OK=new Set(['RUNNING','COMPLETED']);
const TERMINAL=new Set(['COMPLETED','FAILED','CANCELED','CANCELLED','TERMINATED','TIMED_OUT']);

function providerError(code,{message=code,retryable=false,outcomeUnknown=false,providerRunId}={}){
  const e=new Error(message);e.code=code;e.retryable=retryable;e.outcomeUnknown=outcomeUnknown;if(providerRunId)e.providerRunId=String(providerRunId);return e;
}
function req(input,key,prefix='TEMPORAL_JOB_INVALID'){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw providerError(prefix,{message:`${prefix}:${key}`});return v.trim()}
function clone(v){return structuredClone(v)}
function bounded(v,key,min,max){const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw providerError('TEMPORAL_CONFIG_INVALID',{message:`TEMPORAL_CONFIG_INVALID:${key}`});return n}
function normalizeConfig(c){
  if(!c?.workflows||typeof c.workflows!=='object'||Array.isArray(c.workflows)||!Object.keys(c.workflows).length)throw providerError('TEMPORAL_CONFIG_INVALID',{message:'TEMPORAL_CONFIG_INVALID:workflows'});
  const workflows={};
  for(const [key,w] of Object.entries(c.workflows)){
    if(typeof key!=='string'||!key.trim()||!w||typeof w!=='object'||Array.isArray(w))throw providerError('TEMPORAL_CONFIG_INVALID',{message:'TEMPORAL_CONFIG_INVALID:workflows'});
    workflows[key.trim()]=Object.freeze({
      workflowType:req(w,'workflowType','TEMPORAL_CONFIG_INVALID'),
      taskQueue:req(w,'taskQueue','TEMPORAL_CONFIG_INVALID'),
      allowedSignals:Object.freeze(Array.isArray(w.allowedSignals)?[...new Set(w.allowedSignals.map(v=>req({v},'v','TEMPORAL_CONFIG_INVALID')))]:[]),
      allowedQueries:Object.freeze(Array.isArray(w.allowedQueries)?[...new Set(w.allowedQueries.map(v=>req({v},'v','TEMPORAL_CONFIG_INVALID')))]:[]),
    });
  }
  return Object.freeze({
    secretBindingRef:req(c,'secretBindingRef','TEMPORAL_CONFIG_INVALID'),
    namespace:req(c,'namespace','TEMPORAL_CONFIG_INVALID'),
    workflows:Object.freeze(workflows),
    timeoutMs:bounded(c.timeoutMs??30000,'timeoutMs',1000,300000),
  });
}
function validateDeps({capabilityRegistry,credentialBroker,transport}){
  if(!capabilityRegistry||typeof capabilityRegistry.resolve!=='function')throw providerError('TEMPORAL_CAPABILITY_REGISTRY_REQUIRED');
  if(!credentialBroker||typeof credentialBroker.withCredential!=='function')throw providerError('TEMPORAL_CREDENTIAL_BROKER_REQUIRED');
  for(const name of ['startWorkflow','describeWorkflow','signalWorkflow','queryWorkflow','terminateWorkflow'])if(typeof transport?.[name]!=='function')throw providerError('TEMPORAL_TRANSPORT_REQUIRED');
}
function assertQualified(reg){const p=reg.resolve(CAPABILITY,{allowedProviderIds:[PROVIDER_ID]});if(!p||p.providerId!==PROVIDER_ID)throw providerError('TEMPORAL_PROVIDER_NOT_QUALIFIED')}
function validateJob(job,cfg){
  const id=req(job,'id'),intentId=req(job,'intentId'),actionType=req(job,'actionType');
  if(!job?.payload||typeof job.payload!=='object'||Array.isArray(job.payload))throw providerError('TEMPORAL_JOB_INVALID',{message:'TEMPORAL_JOB_INVALID:payload'});
  const workflowKey=req(job.payload,'workflowKey');
  const workflow=cfg.workflows[workflowKey];
  if(!workflow)throw providerError('TEMPORAL_WORKFLOW_NOT_ALLOWED');
  const command=req(job.payload,'command').toLowerCase();
  if(!['start','signal','query','terminate'].includes(command))throw providerError('TEMPORAL_COMMAND_NOT_ALLOWED');
  const base={id,intentId,actionType,workflowKey,workflow,command};
  if(command==='start')return Object.freeze({...base,input:job.payload.input&&typeof job.payload.input==='object'&&!Array.isArray(job.payload.input)?clone(job.payload.input):{},targetWorkflowId:`vaos:${id}`});
  const targetExecutionJobId=req(job.payload,'targetExecutionJobId');
  const targetWorkflowId=`vaos:${targetExecutionJobId}`;
  if(command==='signal'){
    const signalKey=req(job.payload,'signalKey');
    if(!workflow.allowedSignals.includes(signalKey))throw providerError('TEMPORAL_SIGNAL_NOT_ALLOWED');
    return Object.freeze({...base,targetWorkflowId,signalKey,args:job.payload.args&&typeof job.payload.args==='object'&&!Array.isArray(job.payload.args)?clone(job.payload.args):{}});
  }
  if(command==='query'){
    const queryKey=req(job.payload,'queryKey');
    if(!workflow.allowedQueries.includes(queryKey))throw providerError('TEMPORAL_QUERY_NOT_ALLOWED');
    return Object.freeze({...base,targetWorkflowId,queryKey,args:job.payload.args&&typeof job.payload.args==='object'&&!Array.isArray(job.payload.args)?clone(job.payload.args):{}});
  }
  return Object.freeze({...base,targetWorkflowId,reason:req(job.payload,'reason')});
}
function credReq(cfg,job){return{bindingRef:cfg.secretBindingRef,providerId:PROVIDER_ID,capability:CAPABILITY,executionJobId:job.id,intentId:job.intentId}}
async function withApiKey(credentialBroker,cfg,job,operation){
  return credentialBroker.withCredential(credReq(cfg,job),async credential=>{
    if(credential?.kind!=='api-key')throw providerError('TEMPORAL_CREDENTIAL_KIND_INVALID');
    return operation(credential.value);
  });
}
function verifyDescription(row,workflowId,workflow){
  if(!row||typeof row!=='object'||row.workflowId!==workflowId||row.workflowType!==workflow.workflowType)throw providerError('TEMPORAL_VERIFICATION_FAILED',{providerRunId:workflowId});
  const status=String(row.status||'').toUpperCase();
  const runId=typeof row.runId==='string'&&row.runId.trim()?row.runId.trim():null;
  return Object.freeze({status,runId});
}
async function describe(transport,credentialBroker,cfg,job,workflowId){
  return withApiKey(credentialBroker,cfg,job,apiKey=>transport.describeWorkflow({namespace:cfg.namespace,workflowId,timeoutMs:cfg.timeoutMs,apiKey}));
}
function resultBase(job,workflowId,state,runId,extra={}){
  return Object.freeze({
    adapterId:'temporal.durable.v1',providerId:PROVIDER_ID,capability:CAPABILITY,
    effect:Object.freeze({effectType:`WORKFLOW.${job.command.toUpperCase()}`,resourceType:'TEMPORAL_WORKFLOW',resourceId:workflowId,state,canonicalStateUpdated:false,...extra}),
    verification:Object.freeze({verified:true,resourceType:'TEMPORAL_WORKFLOW',resourceId:workflowId,runId:runId||null,workflowType:job.workflow.workflowType,evidenceSource:'temporal.workflow-readback',executionJobId:job.id,intentId:job.intentId}),
  });
}
export function createTemporalDurableAdapter({capabilityRegistry,credentialBroker,transport,config}={}){
  validateDeps({capabilityRegistry,credentialBroker,transport});const cfg=normalizeConfig(config);
  async function execute(inputJob){
    const job=validateJob(inputJob,cfg);assertQualified(capabilityRegistry);

    if(job.command==='start'){
      let startResult;
      try{
        startResult=await withApiKey(credentialBroker,cfg,job,apiKey=>transport.startWorkflow({
          namespace:cfg.namespace,workflowType:job.workflow.workflowType,workflowId:job.targetWorkflowId,taskQueue:job.workflow.taskQueue,
          args:[clone(job.input)],idConflictPolicy:'USE_EXISTING',idReusePolicy:'REJECT_DUPLICATE',timeoutMs:cfg.timeoutMs,apiKey,
        }));
      }catch(error){
        if(error?.requestSent===false)throw providerError('TEMPORAL_START_UNAVAILABLE',{retryable:true});
        try{
          const recovered=verifyDescription(await describe(transport,credentialBroker,cfg,job,job.targetWorkflowId),job.targetWorkflowId,job.workflow);
          if(!START_OK.has(recovered.status))throw providerError('TEMPORAL_VERIFICATION_FAILED',{providerRunId:job.targetWorkflowId});
          return resultBase(job,job.targetWorkflowId,recovered.status,recovered.runId);
        }catch(recoveryError){
          if(recoveryError?.code==='TEMPORAL_VERIFICATION_FAILED')throw recoveryError;
          throw providerError('TEMPORAL_OUTCOME_UNKNOWN',{providerRunId:job.targetWorkflowId,retryable:false,outcomeUnknown:true});
        }
      }
      if(startResult?.workflowId&&startResult.workflowId!==job.targetWorkflowId)throw providerError('TEMPORAL_VERIFICATION_FAILED',{providerRunId:job.targetWorkflowId});
      const verified=verifyDescription(await describe(transport,credentialBroker,cfg,job,job.targetWorkflowId),job.targetWorkflowId,job.workflow);
      if(!START_OK.has(verified.status))throw providerError('TEMPORAL_VERIFICATION_FAILED',{providerRunId:job.targetWorkflowId});
      return resultBase(job,job.targetWorkflowId,verified.status,verified.runId);
    }

    const before=verifyDescription(await describe(transport,credentialBroker,cfg,job,job.targetWorkflowId),job.targetWorkflowId,job.workflow);

    if(job.command==='query'){
      let output;
      try{output=await withApiKey(credentialBroker,cfg,job,apiKey=>transport.queryWorkflow({namespace:cfg.namespace,workflowId:job.targetWorkflowId,query:job.queryKey,args:clone(job.args),timeoutMs:cfg.timeoutMs,apiKey}))}
      catch{throw providerError('TEMPORAL_QUERY_UNAVAILABLE',{providerRunId:job.targetWorkflowId,retryable:true})}
      return resultBase(job,job.targetWorkflowId,before.status,before.runId,{output:clone(output)});
    }

    if(job.command==='signal'){
      try{await withApiKey(credentialBroker,cfg,job,apiKey=>transport.signalWorkflow({namespace:cfg.namespace,workflowId:job.targetWorkflowId,signal:job.signalKey,args:clone(job.args),timeoutMs:cfg.timeoutMs,apiKey}))}
      catch(error){
        if(error?.requestSent===false)throw providerError('TEMPORAL_SIGNAL_UNAVAILABLE',{providerRunId:job.targetWorkflowId,retryable:true});
        throw providerError('TEMPORAL_SIGNAL_OUTCOME_UNKNOWN',{providerRunId:job.targetWorkflowId,retryable:false,outcomeUnknown:true});
      }
      const after=verifyDescription(await describe(transport,credentialBroker,cfg,job,job.targetWorkflowId),job.targetWorkflowId,job.workflow);
      return resultBase(job,job.targetWorkflowId,after.status,after.runId,{signalKey:job.signalKey});
    }

    try{await withApiKey(credentialBroker,cfg,job,apiKey=>transport.terminateWorkflow({namespace:cfg.namespace,workflowId:job.targetWorkflowId,reason:job.reason,timeoutMs:cfg.timeoutMs,apiKey}))}
    catch(error){
      if(error?.requestSent===false)throw providerError('TEMPORAL_TERMINATE_UNAVAILABLE',{providerRunId:job.targetWorkflowId,retryable:true});
      try{
        const recovered=verifyDescription(await describe(transport,credentialBroker,cfg,job,job.targetWorkflowId),job.targetWorkflowId,job.workflow);
        if(recovered.status==='TERMINATED')return resultBase(job,job.targetWorkflowId,'TERMINATED',recovered.runId);
      }catch{}
      throw providerError('TEMPORAL_TERMINATE_OUTCOME_UNKNOWN',{providerRunId:job.targetWorkflowId,retryable:false,outcomeUnknown:true});
    }
    const after=verifyDescription(await describe(transport,credentialBroker,cfg,job,job.targetWorkflowId),job.targetWorkflowId,job.workflow);
    if(after.status!=='TERMINATED'&&!TERMINAL.has(after.status))throw providerError('TEMPORAL_TERMINATION_INCOMPLETE',{providerRunId:job.targetWorkflowId,retryable:false,outcomeUnknown:true});
    return resultBase(job,job.targetWorkflowId,after.status,after.runId);
  }
  return Object.freeze({id:'temporal.durable.v1',providerId:PROVIDER_ID,capability:CAPABILITY,execute});
}
