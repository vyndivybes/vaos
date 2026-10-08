const PROVIDER_ID='playwright';
const CAPABILITY='browser.automate';

function err(code,{message=code,retryable=false,outcomeUnknown=false}={}){const e=new Error(message);e.code=code;e.retryable=retryable;e.outcomeUnknown=outcomeUnknown;return e}
function req(input,key,prefix='PLAYWRIGHT_JOB_INVALID'){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw err(prefix,{message:`${prefix}:${key}`});return v.trim()}
function clone(v){return structuredClone(v)}
function normalizeOrigin(value){
  let u;try{u=new URL(value)}catch{throw err('PLAYWRIGHT_CONFIG_INVALID',{message:'PLAYWRIGHT_CONFIG_INVALID:allowedOrigins'})}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw err('PLAYWRIGHT_CONFIG_INVALID',{message:'PLAYWRIGHT_CONFIG_INVALID:allowedOrigins'});
  return u.origin;
}
function normalizeConfig(config){
  if(!Array.isArray(config?.allowedOrigins)||!config.allowedOrigins.length)throw err('PLAYWRIGHT_CONFIG_INVALID',{message:'PLAYWRIGHT_CONFIG_INVALID:allowedOrigins'});
  const allowedOrigins=[...new Set(config.allowedOrigins.map(normalizeOrigin))];
  const timeoutMs=Number(config?.timeoutMs??45000);
  if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>180000)throw err('PLAYWRIGHT_CONFIG_INVALID',{message:'PLAYWRIGHT_CONFIG_INVALID:timeoutMs'});
  return Object.freeze({allowedOrigins,timeoutMs,allowDownloads:Boolean(config?.allowDownloads),requireTrace:config?.requireTrace!==false});
}
function validateDeps({capabilityRegistry,credentialBroker,browserExecutor}){
  if(!capabilityRegistry||typeof capabilityRegistry.resolve!=='function')throw err('PLAYWRIGHT_CAPABILITY_REGISTRY_REQUIRED');
  if(!credentialBroker||typeof credentialBroker.withCredential!=='function')throw err('PLAYWRIGHT_CREDENTIAL_BROKER_REQUIRED');
  if(!browserExecutor||typeof browserExecutor.runTask!=='function')throw err('PLAYWRIGHT_EXECUTOR_REQUIRED');
}
function assertQualified(reg){const p=reg.resolve(CAPABILITY,{allowedProviderIds:[PROVIDER_ID]});if(!p||p.providerId!==PROVIDER_ID)throw err('PLAYWRIGHT_PROVIDER_NOT_QUALIFIED')}
function parseTarget(value){
  if(typeof value!=='string'||!value.trim())throw err('PLAYWRIGHT_TARGET_INVALID');
  let u;try{u=new URL(value.trim())}catch{throw err('PLAYWRIGHT_TARGET_INVALID')}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw err('PLAYWRIGHT_TARGET_INVALID');
  return u;
}
function validateJob(job){
  const id=req(job,'id'),intentId=req(job,'intentId'),actionType=req(job,'actionType');
  if(!job?.payload||typeof job.payload!=='object'||Array.isArray(job.payload))throw err('PLAYWRIGHT_JOB_INVALID',{message:'PLAYWRIGHT_JOB_INVALID:payload'});
  const taskKey=req(job.payload,'taskKey');
  const target=parseTarget(job.payload.targetUrl);
  const effectClass=req(job.payload,'effectClass');
  if(!['read','write'].includes(effectClass))throw err('PLAYWRIGHT_JOB_INVALID',{message:'PLAYWRIGHT_JOB_INVALID:effectClass'});
  const credentialBindingRef=req(job.payload,'credentialBindingRef');
  const input=job.payload.input&&typeof job.payload.input==='object'&&!Array.isArray(job.payload.input)?clone(job.payload.input):{};
  return Object.freeze({id,intentId,actionType,taskKey,targetUrl:target.toString(),targetOrigin:target.origin,effectClass,credentialBindingRef,input});
}
function assertAllowed(origin,config){if(!config.allowedOrigins.includes(origin))throw err('PLAYWRIGHT_TARGET_NOT_ALLOWED')}
function credentialRequest(job){return{bindingRef:job.credentialBindingRef,providerId:PROVIDER_ID,capability:CAPABILITY,executionJobId:job.id,intentId:job.intentId}}
function verifyResult(result,job,config){
  if(!result||typeof result!=='object'||result.status!=='succeeded')throw err('PLAYWRIGHT_VERIFICATION_FAILED');
  const final=parseTarget(result.finalUrl);
  if(!config.allowedOrigins.includes(final.origin))throw err('PLAYWRIGHT_VERIFICATION_FAILED');
  const v=result.verification;
  if(!v||v.verified!==true||typeof v.evidenceRef!=='string'||!v.evidenceRef||typeof v.artifactHash!=='string'||!v.artifactHash)throw err('PLAYWRIGHT_VERIFICATION_FAILED');
  if(config.requireTrace&&(typeof v.traceRef!=='string'||!v.traceRef))throw err('PLAYWRIGHT_VERIFICATION_FAILED');
  if(!config.allowDownloads&&Array.isArray(result.downloads)&&result.downloads.length)throw err('PLAYWRIGHT_DOWNLOAD_NOT_ALLOWED');
  return Object.freeze({
    output: result.output&&typeof result.output==='object'&&!Array.isArray(result.output)?clone(result.output):{},
    evidenceRef:v.evidenceRef,
    traceRef:typeof v.traceRef==='string'?v.traceRef:undefined,
    screenshotRef:typeof v.screenshotRef==='string'?v.screenshotRef:undefined,
    artifactHash:v.artifactHash,
    finalUrl:final.toString()
  });
}
export function createPlaywrightBrowserAdapter({capabilityRegistry,credentialBroker,browserExecutor,config}={}){
  validateDeps({capabilityRegistry,credentialBroker,browserExecutor});
  const cfg=normalizeConfig(config);
  async function execute(inputJob){
    const job=validateJob(inputJob);
    assertAllowed(job.targetOrigin,cfg);
    assertQualified(capabilityRegistry);
    let started=false;let raw;
    try{
      raw=await credentialBroker.withCredential(credentialRequest(job),async credential=>{
        if(credential?.kind!=='browser-session')throw err('PLAYWRIGHT_CREDENTIAL_KIND_INVALID');
        started=true;
        return browserExecutor.runTask({
          executionJobId:job.id,intentId:job.intentId,actionType:job.actionType,taskKey:job.taskKey,
          targetUrl:job.targetUrl,effectClass:job.effectClass,input:clone(job.input),
          session:{kind:credential.kind,value:credential.value},timeoutMs:cfg.timeoutMs,
          allowDownloads:cfg.allowDownloads,trace:cfg.requireTrace
        });
      });
    }catch(error){
      if(!started)throw error;
      if(error?.started===false)throw err('PLAYWRIGHT_EXECUTOR_UNAVAILABLE',{retryable:true,outcomeUnknown:false});
      throw err('PLAYWRIGHT_OUTCOME_UNKNOWN',{retryable:false,outcomeUnknown:true});
    }
    const verified=verifyResult(raw,job,cfg);
    return Object.freeze({
      adapterId:'playwright.browser.v1',providerId:PROVIDER_ID,capability:CAPABILITY,
      effect:Object.freeze({effectType:'BROWSER.TASK_COMPLETED',resourceType:'BROWSER_EVIDENCE',resourceId:verified.evidenceRef,state:'SUCCEEDED',taskKey:job.taskKey,output:clone(verified.output)}),
      verification:Object.freeze({verified:true,resourceType:'BROWSER_EVIDENCE',resourceId:verified.evidenceRef,expectedState:'succeeded',traceRef:verified.traceRef,screenshotRef:verified.screenshotRef,artifactHash:verified.artifactHash,finalUrl:verified.finalUrl,evidenceSource:'playwright.sealed-artifacts',executionJobId:job.id,intentId:job.intentId})
    });
  }
  return Object.freeze({id:'playwright.browser.v1',providerId:PROVIDER_ID,capability:CAPABILITY,execute});
}
