const PROVIDER_ID='paperwork';
const ACTIVE=new Set(['queued','processing']);
const FAILED=new Set(['failed','cancelled','expired']);

function err(code,{message=code,retryable=false,outcomeUnknown=false,providerRunId,retryAfterSeconds}={}){
  const e=new Error(message);e.code=code;e.retryable=retryable;e.outcomeUnknown=outcomeUnknown;
  if(providerRunId)e.providerRunId=String(providerRunId);
  if(Number.isFinite(retryAfterSeconds))e.retryAfterSeconds=retryAfterSeconds;
  return e;
}
function req(input,key,prefix='PAPERWORK_JOB_INVALID'){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw err(prefix,{message:`${prefix}:${key}`});return v.trim()}
function clone(v){return structuredClone(v)}
function bounded(v,key,min,max){const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw err('PAPERWORK_CONFIG_INVALID',{message:`PAPERWORK_CONFIG_INVALID:${key}`});return n}
function urlBase(value){let u;try{u=new URL(value)}catch{throw err('PAPERWORK_CONFIG_INVALID',{message:'PAPERWORK_CONFIG_INVALID:apiBaseUrl'})}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw err('PAPERWORK_CONFIG_INVALID',{message:'PAPERWORK_CONFIG_INVALID:apiBaseUrl'});return u.toString().replace(/\/$/,'')}
function mapProfiles(value,name){
  if(!value||typeof value!=='object'||Array.isArray(value))return Object.freeze({});
  const out={};for(const [k,v] of Object.entries(value)){if(typeof k!=='string'||!k.trim()||!v||typeof v!=='object'||Array.isArray(v))throw err('PAPERWORK_CONFIG_INVALID',{message:`PAPERWORK_CONFIG_INVALID:${name}`});out[k.trim()]=Object.freeze(clone(v))}
  return Object.freeze(out);
}
function normalizeConfig(c){
  return Object.freeze({
    apiBaseUrl:urlBase(c?.apiBaseUrl),
    secretBindingRef:req(c,'secretBindingRef','PAPERWORK_CONFIG_INVALID'),
    waitSeconds:bounded(c?.waitSeconds??0,'waitSeconds',0,120),
    readWaitSeconds:bounded(c?.readWaitSeconds??30,'readWaitSeconds',0,120),
    ttlSeconds:bounded(c?.ttlSeconds??86400,'ttlSeconds',1,604800),
    maxOutputBytes:bounded(c?.maxOutputBytes??16_777_216,'maxOutputBytes',1,134_217_728),
    classifications:mapProfiles(c?.classifications,'classifications'),
    fills:mapProfiles(c?.fills,'fills'),
    redactions:mapProfiles(c?.redactions,'redactions'),
  });
}
function validateDeps({capabilityRegistry,credentialBroker,fileBridge,transport,artifactBroker,needsArtifact}){
  if(!capabilityRegistry||typeof capabilityRegistry.resolve!=='function')throw err('PAPERWORK_CAPABILITY_REGISTRY_REQUIRED');
  if(!credentialBroker||typeof credentialBroker.withCredential!=='function')throw err('PAPERWORK_CREDENTIAL_BROKER_REQUIRED');
  if(!fileBridge||typeof fileBridge.ensureFile!=='function')throw err('PAPERWORK_FILE_BRIDGE_REQUIRED');
  if(!transport||typeof transport.startRun!=='function'||typeof transport.readRun!=='function')throw err('PAPERWORK_TRANSPORT_REQUIRED');
  if(needsArtifact&&(!artifactBroker||typeof artifactBroker.put!=='function'||typeof transport.downloadOutput!=='function'))throw err('PAPERWORK_ARTIFACT_OUTPUT_REQUIRED');
}
function assertQualified(reg,capability){const p=reg.resolve(capability,{allowedProviderIds:[PROVIDER_ID]});if(!p||p.providerId!==PROVIDER_ID)throw err('PAPERWORK_PROVIDER_NOT_QUALIFIED')}
function credReq(cfg,job,capability){return{bindingRef:cfg.secretBindingRef,providerId:PROVIDER_ID,capability,executionJobId:job.id,intentId:job.intentId}}
function headers(credential,job){if(credential?.kind!=='bearer')throw err('PAPERWORK_CREDENTIAL_KIND_INVALID');return{Authorization:`Bearer ${credential.value}`,'Content-Type':'application/json',Accept:'application/json','Idempotency-Key':job.id}}
function retryAfter(h){const row=h&&typeof h==='object'?Object.entries(h).find(([k])=>k.toLowerCase()==='retry-after'):null;const n=row?Number(row[1]):NaN;return Number.isFinite(n)&&n>=0?n:undefined}
function classifyStartError(error,started){
  if(!started)return error;
  if(error?.requestSent===false)return err('PAPERWORK_DISPATCH_UNAVAILABLE',{retryable:true});
  return err('PAPERWORK_DISPATCH_RETRYABLE',{retryable:true,outcomeUnknown:false});
}
function parseStart(response){
  const status=Number(response?.status);
  if([401,403].includes(status))throw err('PAPERWORK_AUTHENTICATION_FAILED');
  if(status===402)throw err('PAPERWORK_ACCOUNT_BLOCKED');
  if(status===429)throw err('PAPERWORK_RATE_LIMITED',{retryable:true,retryAfterSeconds:retryAfter(response?.headers)});
  if(status===409)throw err('PAPERWORK_IDEMPOTENCY_CONFLICT');
  if(status>=500)throw err('PAPERWORK_DISPATCH_RETRYABLE',{retryable:true});
  if(![200,202].includes(status))throw err('PAPERWORK_REQUEST_REJECTED');
  const run=response?.body;
  const id=typeof run?.id==='string'&&run.id.trim()?run.id.trim():'';
  if(!id)throw err('PAPERWORK_DISPATCH_RETRYABLE',{retryable:true});
  return {id,run};
}
async function resolveRun({initial,credentialBroker,transport,cfg,job,capability}){
  let run=initial.run;
  let status=String(run?.status||'').toLowerCase();
  if(ACTIVE.has(status)){
    try{
      run=await credentialBroker.withCredential(credReq(cfg,job,capability),async credential=>transport.readRun({
        url:`${cfg.apiBaseUrl}/v1/runs/${encodeURIComponent(initial.id)}?wait=${cfg.readWaitSeconds}`,
        method:'GET',headers:headers(credential,job),
      }));
    }catch(error){
      if(error?.code?.startsWith?.('CREDENTIAL_'))throw error;
      throw err('PAPERWORK_RUN_STATUS_PENDING',{providerRunId:initial.id,retryable:false,outcomeUnknown:true});
    }
    status=String(run?.status||'').toLowerCase();
  }
  if(ACTIVE.has(status))throw err('PAPERWORK_RUN_INCOMPLETE',{providerRunId:initial.id,retryable:false,outcomeUnknown:true});
  if(FAILED.has(status))throw err('PAPERWORK_RUN_FAILED',{providerRunId:initial.id});
  if(status!=='processed'||run?.id!==initial.id)throw err('PAPERWORK_VERIFICATION_FAILED',{providerRunId:initial.id});
  return run;
}
async function start({path,body,credentialBroker,transport,cfg,job,capability}){
  let started=false,response;
  try{
    response=await credentialBroker.withCredential(credReq(cfg,job,capability),async credential=>{
      started=true;
      return transport.startRun({
        url:`${cfg.apiBaseUrl}${path}?wait=${cfg.waitSeconds}`,
        method:'POST',headers:headers(credential,job),
        body:{...body,metadata:{executionJobId:job.id,intentId:job.intentId},ttl:cfg.ttlSeconds},
      });
    });
  }catch(error){throw classifyStartError(error,started)}
  return resolveRun({initial:parseStart(response),credentialBroker,transport,cfg,job,capability});
}
async function downloadAndSeal({run,sourceRefs,kind,credentialBroker,transport,artifactBroker,cfg,job,capability}){
  if(!run?.output?.file)throw err('PAPERWORK_OUTPUT_FILE_MISSING',{providerRunId:run.id});
  let response;
  try{
    response=await credentialBroker.withCredential(credReq(cfg,job,capability),async credential=>transport.downloadOutput({
      url:`${cfg.apiBaseUrl}/v1/runs/${encodeURIComponent(run.id)}/output/file`,
      method:'GET',headers:{Authorization:headers(credential,job).Authorization,Accept:'application/pdf'},
    }));
  }catch{throw err('PAPERWORK_OUTPUT_NOT_READY',{providerRunId:run.id,retryable:true})}
  const status=Number(response?.status);
  if(status===409)throw err('PAPERWORK_OUTPUT_NOT_READY',{providerRunId:run.id,retryable:true});
  if(status<200||status>=300)throw err('PAPERWORK_OUTPUT_DOWNLOAD_FAILED',{providerRunId:run.id});
  if(!(response?.bodyBytes instanceof Uint8Array))throw err('PAPERWORK_OUTPUT_INVALID',{providerRunId:run.id});
  const type=String(response.contentType||response?.headers?.['content-type']||'').split(';')[0].trim().toLowerCase();
  if(type!=='application/pdf')throw err('PAPERWORK_OUTPUT_INVALID',{providerRunId:run.id});
  if(response.bodyBytes.byteLength>cfg.maxOutputBytes)throw err('PAPERWORK_OUTPUT_TOO_LARGE',{providerRunId:run.id});
  const artifact=await artifactBroker.put({executionJobId:job.id,intentId:job.intentId,kind,contentType:type,bytes:response.bodyBytes,sourceRefs});
  if(!artifact?.artifactRef||!artifact?.sha256)throw err('PAPERWORK_ARTIFACT_PERSIST_FAILED',{providerRunId:run.id});
  return artifact;
}
function baseJob(job){
  const id=req(job,'id'),intentId=req(job,'intentId'),actionType=req(job,'actionType');
  if(!job?.payload||typeof job.payload!=='object'||Array.isArray(job.payload))throw err('PAPERWORK_JOB_INVALID',{message:'PAPERWORK_JOB_INVALID:payload'});
  return {id,intentId,actionType,payload:job.payload};
}

export function createPaperworkClassifyAdapter({capabilityRegistry,credentialBroker,fileBridge,transport,config}={}){
  const capability='document.classify';validateDeps({capabilityRegistry,credentialBroker,fileBridge,transport,needsArtifact:false});const cfg=normalizeConfig(config);
  async function execute(inputJob){
    const job=baseJob(inputJob);const key=req(job.payload,'classificationKey');const profile=cfg.classifications[key];if(!profile)throw err('PAPERWORK_CLASSIFICATION_NOT_ALLOWED');
    const action=req(profile,'action','PAPERWORK_CONFIG_INVALID');const resultField=req(profile,'resultField','PAPERWORK_CONFIG_INVALID');
    if(!Array.isArray(profile.allowedLabels)||!profile.allowedLabels.length)throw err('PAPERWORK_CONFIG_INVALID',{message:'PAPERWORK_CONFIG_INVALID:allowedLabels'});
    const sourceArtifactRef=req(job.payload,'sourceArtifactRef');assertQualified(capabilityRegistry,capability);
    const file=await fileBridge.ensureFile({artifactRef:sourceArtifactRef,executionJobId:job.id,intentId:job.intentId});
    const run=await start({path:'/v1/extract',body:{file:{id:file.fileId},action,citations:true},credentialBroker,transport,cfg,job,capability});
    const value=run.output?.value;const label=value?.[resultField];const citations=run.output?.citations?.[resultField];
    if(typeof label!=='string'||!profile.allowedLabels.includes(label)||!Array.isArray(citations)||!citations.length)throw err('PAPERWORK_CLASSIFICATION_REJECTED',{providerRunId:run.id});
    return Object.freeze({adapterId:'paperwork.classify.v1',providerId:PROVIDER_ID,capability,effect:Object.freeze({effectType:'DOCUMENT.CLASSIFIED',resourceType:'PAPERWORK_RUN',resourceId:run.id,state:'SUCCEEDED',classification:label,canonicalStateUpdated:false}),verification:Object.freeze({verified:true,resourceId:run.id,sourceArtifactRef,sourceSha256:file.sourceSha256,citations:clone(citations),evidenceSource:'paperwork.extract-classification',executionJobId:job.id,intentId:job.intentId})});
  }
  return Object.freeze({id:'paperwork.classify.v1',providerId:PROVIDER_ID,capability,execute});
}

export function createPaperworkFillAdapter({capabilityRegistry,credentialBroker,fileBridge,artifactBroker,transport,config}={}){
  const capability='document.fill';validateDeps({capabilityRegistry,credentialBroker,fileBridge,artifactBroker,transport,needsArtifact:true});const cfg=normalizeConfig(config);
  async function execute(inputJob){
    const job=baseJob(inputJob);const key=req(job.payload,'fillKey');const profile=cfg.fills[key];if(!profile)throw err('PAPERWORK_FILL_NOT_ALLOWED');
    const action=req(profile,'action','PAPERWORK_CONFIG_INVALID');const output=typeof profile.output==='string'&&profile.output.trim()?profile.output.trim():'flattened';
    assertQualified(capabilityRegistry,capability);
    const hasValues=job.payload.values&&typeof job.payload.values==='object'&&!Array.isArray(job.payload.values);
    const hasFiles=Array.isArray(job.payload.sourceArtifactRefs)&&job.payload.sourceArtifactRefs.length>0;
    if(hasValues===hasFiles)throw err('PAPERWORK_FILL_INPUT_INVALID');
    const body={action,output};const sourceRefs=[];
    if(hasValues){
      const allowed=new Set(Array.isArray(profile.allowedValueKeys)?profile.allowedValueKeys:[]);
      for(const k of Object.keys(job.payload.values))if(!allowed.has(k))throw err('PAPERWORK_FILL_FIELD_NOT_ALLOWED');
      body.values=clone(job.payload.values);
    }else{
      if(profile.allowSourceFiles!==true)throw err('PAPERWORK_FILL_SOURCE_FILES_NOT_ALLOWED');
      body.files=[];
      for(const ref of job.payload.sourceArtifactRefs){
        if(typeof ref!=='string'||!ref.trim())throw err('PAPERWORK_FILL_INPUT_INVALID');
        const file=await fileBridge.ensureFile({artifactRef:ref.trim(),executionJobId:job.id,intentId:job.intentId});
        body.files.push({id:file.fileId});sourceRefs.push(ref.trim());
      }
    }
    const run=await start({path:'/v1/fill',body,credentialBroker,transport,cfg,job,capability});
    const artifact=await downloadAndSeal({run,sourceRefs,kind:'document.fill',credentialBroker,transport,artifactBroker,cfg,job,capability});
    return Object.freeze({adapterId:'paperwork.fill.v1',providerId:PROVIDER_ID,capability,effect:Object.freeze({effectType:'DOCUMENT.FILLED',resourceType:'ARTIFACT',resourceId:artifact.artifactRef,state:'SUCCEEDED',outputArtifactRef:artifact.artifactRef,outputSha256:artifact.sha256,canonicalStateUpdated:false}),verification:Object.freeze({verified:true,resourceId:run.id,outputArtifactRef:artifact.artifactRef,outputSha256:artifact.sha256,evidenceSource:'paperwork.fill+artifact-hash',executionJobId:job.id,intentId:job.intentId})});
  }
  return Object.freeze({id:'paperwork.fill.v1',providerId:PROVIDER_ID,capability,execute});
}

export function createPaperworkRedactAdapter({capabilityRegistry,credentialBroker,fileBridge,artifactBroker,transport,config}={}){
  const capability='document.redact';validateDeps({capabilityRegistry,credentialBroker,fileBridge,artifactBroker,transport,needsArtifact:true});const cfg=normalizeConfig(config);
  async function execute(inputJob){
    const job=baseJob(inputJob);const key=req(job.payload,'redactionKey');const profile=cfg.redactions[key];if(!profile)throw err('PAPERWORK_REDACTION_NOT_ALLOWED');
    const action=req(profile,'action','PAPERWORK_CONFIG_INVALID');const sourceArtifactRef=req(job.payload,'sourceArtifactRef');assertQualified(capabilityRegistry,capability);
    const file=await fileBridge.ensureFile({artifactRef:sourceArtifactRef,executionJobId:job.id,intentId:job.intentId});
    const run=await start({path:'/v1/redact',body:{file:{id:file.fileId},action},credentialBroker,transport,cfg,job,capability});
    const artifact=await downloadAndSeal({run,sourceRefs:[sourceArtifactRef],kind:'document.redact',credentialBroker,transport,artifactBroker,cfg,job,capability});
    return Object.freeze({adapterId:'paperwork.redact.v1',providerId:PROVIDER_ID,capability,effect:Object.freeze({effectType:'DOCUMENT.REDACTED',resourceType:'ARTIFACT',resourceId:artifact.artifactRef,state:'SUCCEEDED',outputArtifactRef:artifact.artifactRef,outputSha256:artifact.sha256,canonicalStateUpdated:false}),verification:Object.freeze({verified:true,resourceId:run.id,sourceArtifactRef,sourceSha256:file.sourceSha256,outputArtifactRef:artifact.artifactRef,outputSha256:artifact.sha256,evidenceSource:'paperwork.redact+artifact-hash',executionJobId:job.id,intentId:job.intentId})});
  }
  return Object.freeze({id:'paperwork.redact.v1',providerId:PROVIDER_ID,capability,execute});
}
