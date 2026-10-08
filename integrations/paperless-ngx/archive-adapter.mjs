const PROVIDER_ID='paperless-ngx';
const CAPABILITY='document.archive';
const ACTIVE_TASKS=new Set(['PENDING','STARTED','RUNNING','RECEIVED','RETRY']);
const FAILED_TASKS=new Set(['FAILURE','FAILED','REVOKED']);

function providerError(code,{message=code,retryable=false,outcomeUnknown=false,providerRunId}={}){
  const e=new Error(message);e.code=code;e.retryable=retryable;e.outcomeUnknown=outcomeUnknown;
  if(providerRunId)e.providerRunId=String(providerRunId);
  return e;
}
function req(input,key,prefix='PAPERLESS_JOB_INVALID'){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw providerError(prefix,{message:`${prefix}:${key}`});return v.trim()}
function clone(v){return structuredClone(v)}
function absoluteHttpUrl(value,key){if(typeof value!=='string'||!value.trim())throw providerError('PAPERLESS_CONFIG_INVALID',{message:`PAPERLESS_CONFIG_INVALID:${key}`});let u;try{u=new URL(value.trim())}catch{throw providerError('PAPERLESS_CONFIG_INVALID',{message:`PAPERLESS_CONFIG_INVALID:${key}`})}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw providerError('PAPERLESS_CONFIG_INVALID',{message:`PAPERLESS_CONFIG_INVALID:${key}`});return u.toString().replace(/\/$/,'')}
function bounded(value,key,min,max){const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw providerError('PAPERLESS_CONFIG_INVALID',{message:`PAPERLESS_CONFIG_INVALID:${key}`});return n}
function normalizeConfig(c){
  if(!c?.intakeProfiles||typeof c.intakeProfiles!=='object'||Array.isArray(c.intakeProfiles)||!Object.keys(c.intakeProfiles).length)throw providerError('PAPERLESS_CONFIG_INVALID',{message:'PAPERLESS_CONFIG_INVALID:intakeProfiles'});
  const profiles={};
  for(const [key,p] of Object.entries(c.intakeProfiles)){
    if(typeof key!=='string'||!key.trim()||!p||typeof p!=='object'||Array.isArray(p))throw providerError('PAPERLESS_CONFIG_INVALID',{message:'PAPERLESS_CONFIG_INVALID:intakeProfiles'});
    const out={};
    for(const field of ['documentType','storagePath','correspondent']){
      if(p[field]!==undefined){
        const n=Number(p[field]);if(!Number.isInteger(n)||n<1)throw providerError('PAPERLESS_CONFIG_INVALID',{message:`PAPERLESS_CONFIG_INVALID:intakeProfiles.${field}`});
        out[field]=n;
      }
    }
    profiles[key.trim()]=Object.freeze(out);
  }
  return Object.freeze({
    baseUrl:absoluteHttpUrl(c.baseUrl,'baseUrl'),
    secretBindingRef:req(c,'secretBindingRef','PAPERLESS_CONFIG_INVALID'),
    apiVersion:bounded(c.apiVersion??10,'apiVersion',1,99),
    intakeProfiles:Object.freeze(profiles),
    dispatchTimeoutMs:bounded(c.dispatchTimeoutMs??15000,'dispatchTimeoutMs',1000,120000),
    completionTimeoutMs:bounded(c.completionTimeoutMs??120000,'completionTimeoutMs',1000,600000),
  });
}
function validateDeps({capabilityRegistry,credentialBroker,transport}){
  if(!capabilityRegistry||typeof capabilityRegistry.resolve!=='function')throw providerError('PAPERLESS_CAPABILITY_REGISTRY_REQUIRED');
  if(!credentialBroker||typeof credentialBroker.withCredential!=='function')throw providerError('PAPERLESS_CREDENTIAL_BROKER_REQUIRED');
  if(!transport||typeof transport.postDocument!=='function'||typeof transport.waitForTask!=='function'||typeof transport.readDocument!=='function')throw providerError('PAPERLESS_TRANSPORT_REQUIRED');
}
function validateJob(job,cfg){
  const id=req(job,'id'),intentId=req(job,'intentId'),actionType=req(job,'actionType');
  if(!job?.payload||typeof job.payload!=='object'||Array.isArray(job.payload))throw providerError('PAPERLESS_JOB_INVALID',{message:'PAPERLESS_JOB_INVALID:payload'});
  const intakeKey=req(job.payload,'intakeKey');
  const profile=cfg.intakeProfiles[intakeKey];
  if(!profile)throw providerError('PAPERLESS_INTAKE_NOT_ALLOWED');
  const sourceArtifactRef=req(job.payload,'sourceArtifactRef');
  const sourceSha256=req(job.payload,'sourceSha256');
  const fileName=req(job.payload,'fileName');
  const title=typeof job.payload.title==='string'&&job.payload.title.trim()?job.payload.title.trim():fileName;
  const metadata=job.payload.metadata&&typeof job.payload.metadata==='object'&&!Array.isArray(job.payload.metadata)?clone(job.payload.metadata):{};
  if(metadata.tags!==undefined&&(!Array.isArray(metadata.tags)||metadata.tags.some(v=>typeof v!=='string'||!v.trim())))throw providerError('PAPERLESS_JOB_INVALID',{message:'PAPERLESS_JOB_INVALID:metadata.tags'});
  return Object.freeze({id,intentId,actionType,intakeKey,profile,sourceArtifactRef,sourceSha256,fileName,title,metadata});
}
function assertQualified(reg){const p=reg.resolve(CAPABILITY,{allowedProviderIds:[PROVIDER_ID]});if(!p||p.providerId!==PROVIDER_ID)throw providerError('PAPERLESS_PROVIDER_NOT_QUALIFIED')}
function credReq(cfg,job){return{bindingRef:cfg.secretBindingRef,providerId:PROVIDER_ID,capability:CAPABILITY,executionJobId:job.id,intentId:job.intentId}}
function authHeaders(credential,cfg){
  if(credential?.kind!=='token')throw providerError('PAPERLESS_CREDENTIAL_KIND_INVALID');
  return {Authorization:`Token ${credential.value}`,Accept:`application/json; version=${cfg.apiVersion}`};
}
function multipart(job){
  const out={
    documentArtifactRef:job.sourceArtifactRef,
    fileName:job.fileName,
    title:job.title,
  };
  if(job.profile.documentType!==undefined)out.document_type=job.profile.documentType;
  if(job.profile.storagePath!==undefined)out.storage_path=job.profile.storagePath;
  if(job.profile.correspondent!==undefined)out.correspondent=job.profile.correspondent;
  if(Array.isArray(job.metadata.tags)&&job.metadata.tags.length)out.tags=job.metadata.tags.slice();
  return Object.freeze(out);
}
function classifyPostException(error,started){
  if(!started)return error;
  if(error?.requestSent===false)return providerError('PAPERLESS_DISPATCH_UNAVAILABLE',{retryable:true,outcomeUnknown:false});
  return providerError('PAPERLESS_OUTCOME_UNKNOWN',{retryable:false,outcomeUnknown:true});
}
function parsePost(response){
  const status=Number(response?.status);
  if([401,403].includes(status))throw providerError('PAPERLESS_AUTHENTICATION_FAILED');
  if(status===429)throw providerError('PAPERLESS_RATE_LIMITED',{retryable:true,outcomeUnknown:false});
  if(status>=500)throw providerError('PAPERLESS_OUTCOME_UNKNOWN',{retryable:false,outcomeUnknown:true});
  if(status!==200)throw providerError('PAPERLESS_DISPATCH_REJECTED');
  const taskId=typeof response?.body==='string'?response.body.trim():typeof response?.body?.task_id==='string'?response.body.task_id.trim():'';
  if(!taskId)throw providerError('PAPERLESS_OUTCOME_UNKNOWN',{retryable:false,outcomeUnknown:true});
  return taskId;
}
function classifyTask(task,taskId){
  if(!task||typeof task!=='object')throw providerError('PAPERLESS_TASK_STATUS_PENDING',{providerRunId:taskId,outcomeUnknown:true});
  const returnedId=typeof task.taskId==='string'?task.taskId:typeof task.task_id==='string'?task.task_id:null;
  if(returnedId&&returnedId!==taskId)throw providerError('PAPERLESS_VERIFICATION_FAILED',{providerRunId:taskId});
  const status=String(task.status||'').toUpperCase();
  if(ACTIVE_TASKS.has(status))throw providerError('PAPERLESS_TASK_INCOMPLETE',{providerRunId:taskId,retryable:false,outcomeUnknown:true});
  if(FAILED_TASKS.has(status))throw providerError('PAPERLESS_ARCHIVE_FAILED',{providerRunId:taskId,retryable:false,outcomeUnknown:false});
  if(status!=='SUCCESS')throw providerError('PAPERLESS_VERIFICATION_FAILED',{providerRunId:taskId});
  const documentId=task.documentId??task.document_id??task.result;
  const normalized=Number(documentId);
  if(!Number.isInteger(normalized)||normalized<1)throw providerError('PAPERLESS_VERIFICATION_FAILED',{providerRunId:taskId});
  return normalized;
}
function verifyDocument(row,documentId,job,taskId){
  if(!row||typeof row!=='object'||Number(row.id)!==documentId)throw providerError('PAPERLESS_VERIFICATION_FAILED',{providerRunId:taskId});
  if(typeof row.checksum!=='string'||row.checksum!==job.sourceSha256)throw providerError('PAPERLESS_VERIFICATION_FAILED',{providerRunId:taskId});
  const archiveSha256=typeof row.archive_checksum==='string'&&row.archive_checksum.trim()?row.archive_checksum.trim():null;
  return Object.freeze({archiveSha256,documentId});
}
export function createPaperlessArchiveAdapter({capabilityRegistry,credentialBroker,transport,config}={}){
  validateDeps({capabilityRegistry,credentialBroker,transport});
  const cfg=normalizeConfig(config);
  async function execute(inputJob){
    const job=validateJob(inputJob,cfg);
    assertQualified(capabilityRegistry);
    let started=false,response;
    try{
      response=await credentialBroker.withCredential(credReq(cfg,job),async credential=>{
        started=true;
        return transport.postDocument({
          url:`${cfg.baseUrl}/api/documents/post_document/`,
          method:'POST',
          timeoutMs:cfg.dispatchTimeoutMs,
          headers:authHeaders(credential,cfg),
          multipart:multipart(job),
        });
      });
    }catch(error){throw classifyPostException(error,started)}
    const taskId=parsePost(response);
    let task;
    try{
      task=await credentialBroker.withCredential(credReq(cfg,job),async credential=>transport.waitForTask({
        url:`${cfg.baseUrl}/api/tasks/?task_id=${encodeURIComponent(taskId)}`,
        taskId,
        timeoutMs:cfg.completionTimeoutMs,
        headers:authHeaders(credential,cfg),
      }));
    }catch(error){
      if(error?.code?.startsWith?.('CREDENTIAL_')||error?.code==='PAPERLESS_CREDENTIAL_KIND_INVALID')throw error;
      throw providerError('PAPERLESS_TASK_STATUS_PENDING',{providerRunId:taskId,retryable:false,outcomeUnknown:true});
    }
    const documentId=classifyTask(task,taskId);
    let row;
    try{
      row=await credentialBroker.withCredential(credReq(cfg,job),async credential=>transport.readDocument({
        url:`${cfg.baseUrl}/api/documents/${documentId}/`,
        documentId,
        timeoutMs:cfg.dispatchTimeoutMs,
        headers:authHeaders(credential,cfg),
      }));
    }catch(error){
      if(error?.code?.startsWith?.('CREDENTIAL_')||error?.code==='PAPERLESS_CREDENTIAL_KIND_INVALID')throw error;
      throw providerError('PAPERLESS_DOCUMENT_READBACK_PENDING',{providerRunId:taskId,retryable:false,outcomeUnknown:true});
    }
    const verified=verifyDocument(row,documentId,job,taskId);
    return Object.freeze({
      adapterId:'paperless.archive.v1',
      providerId:PROVIDER_ID,
      capability:CAPABILITY,
      effect:Object.freeze({
        effectType:'DOCUMENT.ARCHIVED',
        resourceType:'PAPERLESS_DOCUMENT',
        resourceId:String(documentId),
        state:'ARCHIVED',
        canonicalStateUpdated:false,
        intakeKey:job.intakeKey,
      }),
      verification:Object.freeze({
        verified:true,
        resourceType:'PAPERLESS_DOCUMENT',
        resourceId:String(documentId),
        taskId,
        sourceArtifactRef:job.sourceArtifactRef,
        sourceSha256:job.sourceSha256,
        archiveSha256:verified.archiveSha256,
        evidenceSource:'paperless.api.task-and-document-readback',
        executionJobId:job.id,
        intentId:job.intentId,
      }),
    });
  }
  return Object.freeze({id:'paperless.archive.v1',providerId:PROVIDER_ID,capability:CAPABILITY,execute});
}
