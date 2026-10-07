const PROVIDER_ID='airbyte';
const CAPABILITY='data.replicate';
const ACTIVE_STATUS=new Set(['running','queued','pending']);
const FAILED_STATUS=new Set(['failed','cancelled','canceled']);

function providerError(code,{message=code,retryable=false,outcomeUnknown=false,retryAfterSeconds,providerRunId}={}){
  const e=new Error(message);e.code=code;e.retryable=retryable;e.outcomeUnknown=outcomeUnknown;
  if(Number.isFinite(retryAfterSeconds))e.retryAfterSeconds=retryAfterSeconds;
  if(providerRunId!==undefined)e.providerRunId=String(providerRunId);
  return e;
}
function req(input,key,prefix='AIRBYTE_JOB_INVALID'){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw providerError(prefix,{message:`${prefix}:${key}`});return v.trim()}
function absoluteHttpUrl(value,key){if(typeof value!=='string'||!value.trim())throw providerError('AIRBYTE_CONFIG_INVALID',{message:`AIRBYTE_CONFIG_INVALID:${key}`});let u;try{u=new URL(value.trim())}catch{throw providerError('AIRBYTE_CONFIG_INVALID',{message:`AIRBYTE_CONFIG_INVALID:${key}`})}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw providerError('AIRBYTE_CONFIG_INVALID',{message:`AIRBYTE_CONFIG_INVALID:${key}`});return u.toString().replace(/\/$/,'')}
function bounded(v,key,min,max){const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw providerError('AIRBYTE_CONFIG_INVALID',{message:`AIRBYTE_CONFIG_INVALID:${key}`});return n}
function normConfig(c){
  if(!c?.connections||typeof c.connections!=='object'||Array.isArray(c.connections)||!Object.keys(c.connections).length)throw providerError('AIRBYTE_CONFIG_INVALID',{message:'AIRBYTE_CONFIG_INVALID:connections'});
  const connections={};for(const [k,id] of Object.entries(c.connections)){if(typeof k!=='string'||!k.trim()||typeof id!=='string'||!id.trim())throw providerError('AIRBYTE_CONFIG_INVALID',{message:'AIRBYTE_CONFIG_INVALID:connections'});connections[k.trim()]=id.trim()}
  return Object.freeze({apiBaseUrl:absoluteHttpUrl(c.apiBaseUrl,'apiBaseUrl'),secretBindingRef:req(c,'secretBindingRef','AIRBYTE_CONFIG_INVALID'),connections:Object.freeze(connections),dispatchTimeoutMs:bounded(c.dispatchTimeoutMs??15000,'dispatchTimeoutMs',1000,120000),completionTimeoutMs:bounded(c.completionTimeoutMs??300000,'completionTimeoutMs',1000,900000)});
}
function validateDeps({capabilityRegistry,credentialBroker,transport}){if(!capabilityRegistry||typeof capabilityRegistry.resolve!=='function')throw providerError('AIRBYTE_CAPABILITY_REGISTRY_REQUIRED');if(!credentialBroker||typeof credentialBroker.withCredential!=='function')throw providerError('AIRBYTE_CREDENTIAL_BROKER_REQUIRED');if(!transport||typeof transport.createJob!=='function'||typeof transport.waitForJob!=='function')throw providerError('AIRBYTE_TRANSPORT_REQUIRED')}
function validateJob(job,cfg){const id=req(job,'id'),intentId=req(job,'intentId'),actionType=req(job,'actionType');if(!job?.payload||typeof job.payload!=='object'||Array.isArray(job.payload))throw providerError('AIRBYTE_JOB_INVALID',{message:'AIRBYTE_JOB_INVALID:payload'});const connectionKey=req(job.payload,'connectionKey');const connectionId=cfg.connections[connectionKey];if(!connectionId)throw providerError('AIRBYTE_CONNECTION_NOT_ALLOWED');return Object.freeze({id,intentId,actionType,connectionKey,connectionId})}
function assertQualified(reg){const p=reg.resolve(CAPABILITY,{allowedProviderIds:[PROVIDER_ID]});if(!p||p.providerId!==PROVIDER_ID)throw providerError('AIRBYTE_PROVIDER_NOT_QUALIFIED')}
function credReq(cfg,j){return{bindingRef:cfg.secretBindingRef,providerId:PROVIDER_ID,capability:CAPABILITY,executionJobId:j.id,intentId:j.intentId}}
function retryAfter(h){if(!h||typeof h!=='object')return undefined;const x=Object.entries(h).find(([k])=>k.toLowerCase()==='retry-after');const n=x?Number(x[1]):NaN;return Number.isFinite(n)&&n>=0?n:undefined}
function classifyDispatchException(e,started){if(!started)return e;if(e?.requestSent===false)return providerError('AIRBYTE_DISPATCH_UNAVAILABLE',{retryable:true,outcomeUnknown:false});return providerError('AIRBYTE_OUTCOME_UNKNOWN',{retryable:false,outcomeUnknown:true})}
function parseCreate(r){
  const s=Number(r?.status);
  if([401,403].includes(s))throw providerError('AIRBYTE_AUTHENTICATION_FAILED');
  if(s===404)throw providerError('AIRBYTE_CONNECTION_NOT_FOUND');
  if(s===409)throw providerError('AIRBYTE_CONNECTION_BUSY',{retryable:true,outcomeUnknown:false});
  if(s===429)throw providerError('AIRBYTE_RATE_LIMITED',{retryable:true,outcomeUnknown:false,retryAfterSeconds:retryAfter(r?.headers)});
  if(s>=500)throw providerError('AIRBYTE_OUTCOME_UNKNOWN',{retryable:false,outcomeUnknown:true});
  if(s<200||s>=300)throw providerError('AIRBYTE_DISPATCH_REJECTED');
  const b=r?.body;const id=b?.jobId;
  if(!(typeof id==='number'||(typeof id==='string'&&id.trim())))throw providerError('AIRBYTE_OUTCOME_UNKNOWN',{outcomeUnknown:true});
  return {jobId:id,jobType:b?.jobType,status:typeof b?.status==='string'?b.status.toLowerCase():undefined};
}
function verifyJob(j,providerRunId,connectionId,connectionKey){
  if(!j||typeof j!=='object'||String(j.jobId)!==String(providerRunId)||j.jobType!=='sync')throw providerError('AIRBYTE_VERIFICATION_FAILED',{providerRunId});
  if(j.connectionId!==undefined&&j.connectionId!==connectionId)throw providerError('AIRBYTE_VERIFICATION_FAILED',{providerRunId});
  const status=typeof j.status==='string'?j.status.toLowerCase():'';
  if(ACTIVE_STATUS.has(status))throw providerError('AIRBYTE_SYNC_INCOMPLETE',{providerRunId,retryable:false,outcomeUnknown:true});
  if(FAILED_STATUS.has(status))throw providerError('AIRBYTE_SYNC_FAILED',{providerRunId,retryable:false});
  if(status!=='succeeded')throw providerError('AIRBYTE_VERIFICATION_FAILED',{providerRunId});
  const summary={};
  if(Number.isFinite(Number(j.recordsSynced)))summary.recordsSynced=Number(j.recordsSynced);
  if(Number.isFinite(Number(j.bytesSynced)))summary.bytesSynced=Number(j.bytesSynced);
  return {summary,connectionKey};
}
export function createAirbyteReplicationAdapter({capabilityRegistry,credentialBroker,transport,config}={}){
  validateDeps({capabilityRegistry,credentialBroker,transport});const cfg=normConfig(config);
  async function execute(inputJob){
    const job=validateJob(inputJob,cfg);assertQualified(capabilityRegistry);
    let started=false,response;
    try{response=await credentialBroker.withCredential(credReq(cfg,job),async credential=>{if(credential?.kind!=='bearer')throw providerError('AIRBYTE_CREDENTIAL_KIND_INVALID');started=true;return transport.createJob({url:`${cfg.apiBaseUrl}/jobs`,method:'POST',timeoutMs:cfg.dispatchTimeoutMs,headers:{Authorization:`Bearer ${credential.value}`,'Content-Type':'application/json',Accept:'application/json','X-VAOS-EXECUTION-JOB-ID':job.id,'X-VAOS-INTENT-ID':job.intentId},body:{jobType:'sync',connectionId:job.connectionId}})})}catch(e){throw classifyDispatchException(e,started)}
    const created=parseCreate(response);const providerRunId=created.jobId;
    let completed;
    try{completed=await credentialBroker.withCredential(credReq(cfg,job),async credential=>{if(credential?.kind!=='bearer')throw providerError('AIRBYTE_CREDENTIAL_KIND_INVALID');return transport.waitForJob({jobId:providerRunId,timeoutMs:cfg.completionTimeoutMs,headers:{Authorization:`Bearer ${credential.value}`,Accept:'application/json'}})})}catch(e){if(e?.code?.startsWith?.('CREDENTIAL_')||e?.code==='AIRBYTE_CREDENTIAL_KIND_INVALID')throw e;throw providerError('AIRBYTE_SYNC_STATUS_PENDING',{providerRunId,retryable:false,outcomeUnknown:true})}
    const verified=verifyJob(completed,providerRunId,job.connectionId,job.connectionKey);
    return Object.freeze({adapterId:'airbyte.replication.v1',providerId:PROVIDER_ID,capability:CAPABILITY,effect:Object.freeze({effectType:'DATA.REPLICATION_COMPLETED',resourceType:'AIRBYTE_JOB',resourceId:String(providerRunId),state:'SUCCEEDED',connectionKey:job.connectionKey,summary:Object.freeze({...verified.summary})}),verification:Object.freeze({verified:true,resourceType:'AIRBYTE_JOB',resourceId:String(providerRunId),expectedState:'succeeded',connectionKey:job.connectionKey,evidenceSource:'airbyte.api.job-readback',executionJobId:job.id,intentId:job.intentId})});
  }
  return Object.freeze({id:'airbyte.replication.v1',providerId:PROVIDER_ID,capability:CAPABILITY,execute});
}
