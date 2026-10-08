const PROVIDER_ID='camunda';
const CAPABILITY='process.orchestrate';

function providerError(code,{message=code,retryable=false,outcomeUnknown=false,providerRunId}={}){
  const e=new Error(message);e.code=code;e.retryable=retryable;e.outcomeUnknown=outcomeUnknown;if(providerRunId)e.providerRunId=String(providerRunId);return e;
}
function req(input,key,prefix='CAMUNDA_JOB_INVALID'){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw providerError(prefix,{message:`${prefix}:${key}`});return v.trim()}
function clone(v){return structuredClone(v)}
function absoluteHttpUrl(value,key){if(typeof value!=='string'||!value.trim())throw providerError('CAMUNDA_CONFIG_INVALID',{message:`CAMUNDA_CONFIG_INVALID:${key}`});let u;try{u=new URL(value.trim())}catch{throw providerError('CAMUNDA_CONFIG_INVALID',{message:`CAMUNDA_CONFIG_INVALID:${key}`})}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw providerError('CAMUNDA_CONFIG_INVALID',{message:`CAMUNDA_CONFIG_INVALID:${key}`});return u.toString().replace(/\/$/,'')}
function bounded(v,key,min,max){const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw providerError('CAMUNDA_CONFIG_INVALID',{message:`CAMUNDA_CONFIG_INVALID:${key}`});return n}
function normalizeConfig(c){
  if(!c?.processes||typeof c.processes!=='object'||Array.isArray(c.processes)||!Object.keys(c.processes).length)throw providerError('CAMUNDA_CONFIG_INVALID',{message:'CAMUNDA_CONFIG_INVALID:processes'});
  const processes={};
  for(const [key,p] of Object.entries(c.processes)){
    if(typeof key!=='string'||!key.trim()||!p||typeof p!=='object'||Array.isArray(p))throw providerError('CAMUNDA_CONFIG_INVALID',{message:'CAMUNDA_CONFIG_INVALID:processes'});
    processes[key.trim()]=Object.freeze({
      processDefinitionId:req(p,'processDefinitionId','CAMUNDA_CONFIG_INVALID'),
      version:bounded(p.version,'version',1,1000000),
    });
  }
  return Object.freeze({
    baseUrl:absoluteHttpUrl(c.baseUrl,'baseUrl'),
    secretBindingRef:req(c,'secretBindingRef','CAMUNDA_CONFIG_INVALID'),
    processes:Object.freeze(processes),
    timeoutMs:bounded(c.timeoutMs??30000,'timeoutMs',1000,300000),
  });
}
function validateDeps({capabilityRegistry,credentialBroker,transport}){
  if(!capabilityRegistry||typeof capabilityRegistry.resolve!=='function')throw providerError('CAMUNDA_CAPABILITY_REGISTRY_REQUIRED');
  if(!credentialBroker||typeof credentialBroker.withCredential!=='function')throw providerError('CAMUNDA_CREDENTIAL_BROKER_REQUIRED');
  for(const name of ['createProcess','readProcess','cancelProcess'])if(typeof transport?.[name]!=='function')throw providerError('CAMUNDA_TRANSPORT_REQUIRED');
}
function assertQualified(reg){const p=reg.resolve(CAPABILITY,{allowedProviderIds:[PROVIDER_ID]});if(!p||p.providerId!==PROVIDER_ID)throw providerError('CAMUNDA_PROVIDER_NOT_QUALIFIED')}
function validateJob(job,cfg){
  const id=req(job,'id'),intentId=req(job,'intentId'),actionType=req(job,'actionType');
  if(!job?.payload||typeof job.payload!=='object'||Array.isArray(job.payload))throw providerError('CAMUNDA_JOB_INVALID',{message:'CAMUNDA_JOB_INVALID:payload'});
  const processKey=req(job.payload,'processKey');
  const process=cfg.processes[processKey];
  if(!process)throw providerError('CAMUNDA_PROCESS_NOT_ALLOWED');
  const command=req(job.payload,'command').toLowerCase();
  if(!['start','status','cancel'].includes(command))throw providerError('CAMUNDA_COMMAND_NOT_ALLOWED');
  if(command==='start'){
    const variables=job.payload.variables&&typeof job.payload.variables==='object'&&!Array.isArray(job.payload.variables)?clone(job.payload.variables):{};
    return Object.freeze({id,intentId,actionType,processKey,process,command,variables});
  }
  return Object.freeze({id,intentId,actionType,processKey,process,command,processInstanceKey:req(job.payload,'processInstanceKey')});
}
function credReq(cfg,job){return{bindingRef:cfg.secretBindingRef,providerId:PROVIDER_ID,capability:CAPABILITY,executionJobId:job.id,intentId:job.intentId}}
async function withToken(broker,cfg,job,fn){
  return broker.withCredential(credReq(cfg,job),async credential=>{
    if(credential?.kind!=='bearer')throw providerError('CAMUNDA_CREDENTIAL_KIND_INVALID');
    return fn(credential.value);
  });
}
function auth(token){return{Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'}}
function verifyRow(row,key,process){
  if(!row||typeof row!=='object'||String(row.processInstanceKey)!==String(key)||row.processDefinitionId!==process.processDefinitionId||Number(row.processDefinitionVersion)!==process.version)throw providerError('CAMUNDA_VERIFICATION_FAILED',{providerRunId:key});
  if(row.hasIncident===true)throw providerError('CAMUNDA_PROCESS_INCIDENT',{providerRunId:key,retryable:false,outcomeUnknown:true});
  const state=String(row.state||'').toUpperCase();
  if(!['ACTIVE','COMPLETED','TERMINATED'].includes(state))throw providerError('CAMUNDA_VERIFICATION_FAILED',{providerRunId:key});
  return Object.freeze({state});
}
function result(job,key,state){
  return Object.freeze({
    adapterId:'camunda.process.v1',providerId:PROVIDER_ID,capability:CAPABILITY,
    effect:Object.freeze({effectType:`PROCESS.${job.command.toUpperCase()}`,resourceType:'CAMUNDA_PROCESS_INSTANCE',resourceId:String(key),state,canonicalStateUpdated:false,processKey:job.processKey}),
    verification:Object.freeze({verified:true,resourceType:'CAMUNDA_PROCESS_INSTANCE',resourceId:String(key),processDefinitionId:job.process.processDefinitionId,processDefinitionVersion:job.process.version,evidenceSource:'camunda.process-instance-readback',executionJobId:job.id,intentId:job.intentId}),
  });
}
export function createCamundaProcessAdapter({capabilityRegistry,credentialBroker,transport,config}={}){
  validateDeps({capabilityRegistry,credentialBroker,transport});const cfg=normalizeConfig(config);
  async function execute(inputJob){
    const job=validateJob(inputJob,cfg);assertQualified(capabilityRegistry);

    if(job.command==='start'){
      let response;
      try{
        response=await withToken(credentialBroker,cfg,job,token=>transport.createProcess({
          url:`${cfg.baseUrl}/process-instances`,method:'POST',timeoutMs:cfg.timeoutMs,headers:auth(token),
          body:{processDefinitionId:job.process.processDefinitionId,processDefinitionVersion:job.process.version,awaitCompletion:false,variables:{...clone(job.variables),_vaosIntentId:job.intentId,_vaosExecutionJobId:job.id}},
        }));
      }catch(error){
        if(error?.requestSent===false)throw providerError('CAMUNDA_CREATE_UNAVAILABLE',{retryable:true});
        throw providerError('CAMUNDA_CREATE_OUTCOME_UNKNOWN',{retryable:false,outcomeUnknown:true});
      }
      const status=Number(response?.status);
      if([401,403].includes(status))throw providerError('CAMUNDA_AUTHENTICATION_FAILED');
      if(status===503)throw providerError('CAMUNDA_BACKPRESSURE',{retryable:true});
      if(status>=500)throw providerError('CAMUNDA_CREATE_OUTCOME_UNKNOWN',{retryable:false,outcomeUnknown:true});
      if(status<200||status>=300)throw providerError('CAMUNDA_CREATE_REJECTED');
      const key=response?.body?.processInstanceKey;
      if(!(typeof key==='string'||Number.isFinite(key)))throw providerError('CAMUNDA_CREATE_OUTCOME_UNKNOWN',{retryable:false,outcomeUnknown:true});
      const row=await withToken(credentialBroker,cfg,job,token=>transport.readProcess({url:`${cfg.baseUrl}/process-instances/${encodeURIComponent(String(key))}`,processInstanceKey:String(key),timeoutMs:cfg.timeoutMs,headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}}));
      const verified=verifyRow(row,key,job.process);
      return result(job,key,verified.state);
    }

    if(job.command==='status'){
      const row=await withToken(credentialBroker,cfg,job,token=>transport.readProcess({url:`${cfg.baseUrl}/process-instances/${encodeURIComponent(job.processInstanceKey)}`,processInstanceKey:job.processInstanceKey,timeoutMs:cfg.timeoutMs,headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}}));
      const verified=verifyRow(row,job.processInstanceKey,job.process);
      return result(job,job.processInstanceKey,verified.state);
    }

    const before=verifyRow(await withToken(credentialBroker,cfg,job,token=>transport.readProcess({url:`${cfg.baseUrl}/process-instances/${encodeURIComponent(job.processInstanceKey)}`,processInstanceKey:job.processInstanceKey,timeoutMs:cfg.timeoutMs,headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}})),job.processInstanceKey,job.process);
    if(before.state==='TERMINATED')return result(job,job.processInstanceKey,'TERMINATED');
    try{
      const response=await withToken(credentialBroker,cfg,job,token=>transport.cancelProcess({url:`${cfg.baseUrl}/process-instances/${encodeURIComponent(job.processInstanceKey)}/cancellation`,processInstanceKey:job.processInstanceKey,method:'POST',timeoutMs:cfg.timeoutMs,headers:auth(token),body:{}}));
      const status=Number(response?.status);
      if(status!==204&&!(status>=200&&status<300))throw providerError(status===503?'CAMUNDA_BACKPRESSURE':'CAMUNDA_CANCEL_REJECTED',{providerRunId:job.processInstanceKey,retryable:status===503});
    }catch(error){
      if(error?.requestSent===false)throw providerError('CAMUNDA_CANCEL_UNAVAILABLE',{providerRunId:job.processInstanceKey,retryable:true});
      try{
        const recovered=verifyRow(await withToken(credentialBroker,cfg,job,token=>transport.readProcess({url:`${cfg.baseUrl}/process-instances/${encodeURIComponent(job.processInstanceKey)}`,processInstanceKey:job.processInstanceKey,timeoutMs:cfg.timeoutMs,headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}})),job.processInstanceKey,job.process);
        if(recovered.state==='TERMINATED')return result(job,job.processInstanceKey,'TERMINATED');
      }catch{}
      throw providerError('CAMUNDA_CANCEL_OUTCOME_UNKNOWN',{providerRunId:job.processInstanceKey,retryable:false,outcomeUnknown:true});
    }
    const after=verifyRow(await withToken(credentialBroker,cfg,job,token=>transport.readProcess({url:`${cfg.baseUrl}/process-instances/${encodeURIComponent(job.processInstanceKey)}`,processInstanceKey:job.processInstanceKey,timeoutMs:cfg.timeoutMs,headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}})),job.processInstanceKey,job.process);
    if(after.state!=='TERMINATED')throw providerError('CAMUNDA_CANCEL_INCOMPLETE',{providerRunId:job.processInstanceKey,retryable:false,outcomeUnknown:true});
    return result(job,job.processInstanceKey,'TERMINATED');
  }
  return Object.freeze({id:'camunda.process.v1',providerId:PROVIDER_ID,capability:CAPABILITY,execute});
}
