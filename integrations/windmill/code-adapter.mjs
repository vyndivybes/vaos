const PROVIDER_ID='windmill';
const CAPABILITY='code.execute';

function providerError(code,{message=code,retryable=false,outcomeUnknown=false,retryAfterSeconds,providerRunId}={}){
  const e=new Error(message);e.code=code;e.retryable=retryable;e.outcomeUnknown=outcomeUnknown;
  if(Number.isFinite(retryAfterSeconds))e.retryAfterSeconds=retryAfterSeconds;
  if(providerRunId)e.providerRunId=providerRunId;
  return e;
}
function req(input,key,prefix='WINDMILL_JOB_INVALID'){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw providerError(prefix,{message:`${prefix}:${key}`});return v.trim()}
function clone(v){return structuredClone(v)}
function absoluteHttpUrl(value,key){if(typeof value!=='string'||!value.trim())throw providerError('WINDMILL_CONFIG_INVALID',{message:`WINDMILL_CONFIG_INVALID:${key}`});let u;try{u=new URL(value.trim())}catch{throw providerError('WINDMILL_CONFIG_INVALID',{message:`WINDMILL_CONFIG_INVALID:${key}`})}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw providerError('WINDMILL_CONFIG_INVALID',{message:`WINDMILL_CONFIG_INVALID:${key}`});return u.toString().replace(/\/$/,'')}
function bounded(v,key,min,max){const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw providerError('WINDMILL_CONFIG_INVALID',{message:`WINDMILL_CONFIG_INVALID:${key}`});return n}
function normConfig(c){
  if(!c?.scripts||typeof c.scripts!=='object'||Array.isArray(c.scripts)||!Object.keys(c.scripts).length)throw providerError('WINDMILL_CONFIG_INVALID',{message:'WINDMILL_CONFIG_INVALID:scripts'});
  const scripts={};
  for(const [k,p] of Object.entries(c.scripts)){if(typeof k!=='string'||!k.trim()||typeof p!=='string'||!p.trim())throw providerError('WINDMILL_CONFIG_INVALID',{message:'WINDMILL_CONFIG_INVALID:scripts'});scripts[k.trim()]=p.trim()}
  return Object.freeze({baseUrl:absoluteHttpUrl(c.baseUrl,'baseUrl'),workspace:req(c,'workspace','WINDMILL_CONFIG_INVALID'),secretBindingRef:req(c,'secretBindingRef','WINDMILL_CONFIG_INVALID'),scripts:Object.freeze(scripts),dispatchTimeoutMs:bounded(c.dispatchTimeoutMs??15000,'dispatchTimeoutMs',1000,120000),completionTimeoutMs:bounded(c.completionTimeoutMs??120000,'completionTimeoutMs',1000,600000),maxResultBytes:bounded(c.maxResultBytes??65536,'maxResultBytes',256,1048576)});
}
function validateDeps({capabilityRegistry,credentialBroker,transport}){if(!capabilityRegistry||typeof capabilityRegistry.resolve!=='function')throw providerError('WINDMILL_CAPABILITY_REGISTRY_REQUIRED');if(!credentialBroker||typeof credentialBroker.withCredential!=='function')throw providerError('WINDMILL_CREDENTIAL_BROKER_REQUIRED');if(!transport||typeof transport.runScript!=='function'||typeof transport.waitForJob!=='function')throw providerError('WINDMILL_TRANSPORT_REQUIRED')}
function validateJob(job,cfg){const id=req(job,'id'),intentId=req(job,'intentId'),actionType=req(job,'actionType');if(!job?.payload||typeof job.payload!=='object'||Array.isArray(job.payload))throw providerError('WINDMILL_JOB_INVALID',{message:'WINDMILL_JOB_INVALID:payload'});const scriptKey=req(job.payload,'scriptKey');const scriptPath=cfg.scripts[scriptKey];if(!scriptPath)throw providerError('WINDMILL_SCRIPT_NOT_ALLOWED');const args=job.payload.args&&typeof job.payload.args==='object'&&!Array.isArray(job.payload.args)?clone(job.payload.args):{};return Object.freeze({id,intentId,actionType,scriptKey,scriptPath,args})}
function assertQualified(reg){const p=reg.resolve(CAPABILITY,{allowedProviderIds:[PROVIDER_ID]});if(!p||p.providerId!==PROVIDER_ID)throw providerError('WINDMILL_PROVIDER_NOT_QUALIFIED')}
function credReq(cfg,j){return{bindingRef:cfg.secretBindingRef,providerId:PROVIDER_ID,capability:CAPABILITY,executionJobId:j.id,intentId:j.intentId}}
function encPath(p){return p.split('/').map(encodeURIComponent).join('/')}
function retryAfter(h){if(!h||typeof h!=='object')return undefined;const x=Object.entries(h).find(([k])=>k.toLowerCase()==='retry-after');const n=x?Number(x[1]):NaN;return Number.isFinite(n)&&n>=0?n:undefined}
function classifyDispatchException(e,started){if(!started)return e;if(e?.requestSent===false)return providerError('WINDMILL_DISPATCH_UNAVAILABLE',{retryable:true,outcomeUnknown:false});return providerError('WINDMILL_OUTCOME_UNKNOWN',{retryable:false,outcomeUnknown:true})}
function parseDispatch(r){const s=Number(r?.status);if([401,403].includes(s))throw providerError('WINDMILL_AUTHENTICATION_FAILED');if(s===404)throw providerError('WINDMILL_SCRIPT_NOT_FOUND');if(s===429)throw providerError('WINDMILL_RATE_LIMITED',{retryable:true,retryAfterSeconds:retryAfter(r?.headers)});if(s>=500)throw providerError('WINDMILL_OUTCOME_UNKNOWN',{outcomeUnknown:true});if(s<200||s>=300)throw providerError('WINDMILL_DISPATCH_REJECTED');const id=typeof r?.body==='string'?r.body.trim():'';if(!id)throw providerError('WINDMILL_OUTCOME_UNKNOWN',{outcomeUnknown:true});return id}
function verifyJob(j,providerRunId,scriptPath,cfg){if(!j||typeof j!=='object'||j.id!==providerRunId||j.script_path!==scriptPath)throw providerError('WINDMILL_VERIFICATION_FAILED',{providerRunId});if(j.success===false)throw providerError('WINDMILL_JOB_FAILED',{providerRunId});if(j.success!==true)throw providerError('WINDMILL_JOB_STATUS_PENDING',{providerRunId,outcomeUnknown:true});const output=j.result===undefined?null:clone(j.result);const bytes=new TextEncoder().encode(JSON.stringify(output)).byteLength;if(bytes>cfg.maxResultBytes)throw providerError('WINDMILL_RESULT_TOO_LARGE',{providerRunId});return {output,durationMs:Number.isFinite(Number(j.duration_ms))?Number(j.duration_ms):undefined}}
export function createWindmillCodeAdapter({capabilityRegistry,credentialBroker,transport,config}={}){
  validateDeps({capabilityRegistry,credentialBroker,transport});const cfg=normConfig(config);
  async function execute(inputJob){
    const job=validateJob(inputJob,cfg);assertQualified(capabilityRegistry);
    let started=false,response;
    try{response=await credentialBroker.withCredential(credReq(cfg,job),async credential=>{if(credential?.kind!=='bearer')throw providerError('WINDMILL_CREDENTIAL_KIND_INVALID');started=true;return transport.runScript({url:`${cfg.baseUrl}/api/w/${encodeURIComponent(cfg.workspace)}/jobs/run/p/${encPath(job.scriptPath)}`,method:'POST',timeoutMs:cfg.dispatchTimeoutMs,headers:{Authorization:`Bearer ${credential.value}`,'Content-Type':'application/json',Accept:'text/plain','X-VAOS-EXECUTION-JOB-ID':job.id,'X-VAOS-INTENT-ID':job.intentId},body:clone(job.args)})})}catch(e){throw classifyDispatchException(e,started)}
    const providerRunId=parseDispatch(response);
    let completed;
    try{completed=await credentialBroker.withCredential(credReq(cfg,job),async credential=>{if(credential?.kind!=='bearer')throw providerError('WINDMILL_CREDENTIAL_KIND_INVALID');return transport.waitForJob({url:`${cfg.baseUrl}/api/w/${encodeURIComponent(cfg.workspace)}/jobs_u/get/${encodeURIComponent(providerRunId)}`,jobId:providerRunId,timeoutMs:cfg.completionTimeoutMs,headers:{Authorization:`Bearer ${credential.value}`,Accept:'application/json'}})})}catch(e){if(e?.code?.startsWith?.('CREDENTIAL_')||e?.code==='WINDMILL_CREDENTIAL_KIND_INVALID')throw e;throw providerError('WINDMILL_JOB_STATUS_PENDING',{providerRunId,retryable:false,outcomeUnknown:true})}
    const v=verifyJob(completed,providerRunId,job.scriptPath,cfg);
    return Object.freeze({adapterId:'windmill.code.v1',providerId:PROVIDER_ID,capability:CAPABILITY,effect:Object.freeze({effectType:'CODE.SCRIPT_EXECUTED',resourceType:'WINDMILL_JOB',resourceId:providerRunId,state:'SUCCEEDED',scriptKey:job.scriptKey,output:clone(v.output)}),verification:Object.freeze({verified:true,resourceType:'WINDMILL_JOB',resourceId:providerRunId,expectedState:'success',scriptPath:job.scriptPath,durationMs:v.durationMs,evidenceSource:'windmill.api.job-readback',executionJobId:job.id,intentId:job.intentId})});
  }
  return Object.freeze({id:'windmill.code.v1',providerId:PROVIDER_ID,capability:CAPABILITY,execute});
}
