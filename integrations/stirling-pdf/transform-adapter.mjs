const PROVIDER_ID='stirling-pdf';
const CAPABILITY='document.transform';

function providerError(code,{message=code,retryable=false,outcomeUnknown=false}={}){
  const e=new Error(message);e.code=code;e.retryable=retryable;e.outcomeUnknown=outcomeUnknown;return e;
}
function req(input,key,prefix='STIRLING_JOB_INVALID'){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw providerError(prefix,{message:`${prefix}:${key}`});return v.trim()}
function clone(v){return structuredClone(v)}
function absoluteHttpUrl(value,key){if(typeof value!=='string'||!value.trim())throw providerError('STIRLING_CONFIG_INVALID',{message:`STIRLING_CONFIG_INVALID:${key}`});let u;try{u=new URL(value.trim())}catch{throw providerError('STIRLING_CONFIG_INVALID',{message:`STIRLING_CONFIG_INVALID:${key}`})}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw providerError('STIRLING_CONFIG_INVALID',{message:`STIRLING_CONFIG_INVALID:${key}`});return u.toString().replace(/\/$/,'')}
function bounded(value,key,min,max){const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw providerError('STIRLING_CONFIG_INVALID',{message:`STIRLING_CONFIG_INVALID:${key}`});return n}
function normalizeConfig(c){
  if(!c?.operations||typeof c.operations!=='object'||Array.isArray(c.operations)||!Object.keys(c.operations).length)throw providerError('STIRLING_CONFIG_INVALID',{message:'STIRLING_CONFIG_INVALID:operations'});
  const operations={};
  for(const [key,o] of Object.entries(c.operations)){
    if(typeof key!=='string'||!key.trim()||!o||typeof o!=='object'||Array.isArray(o))throw providerError('STIRLING_CONFIG_INVALID',{message:'STIRLING_CONFIG_INVALID:operations'});
    const endpointPath=req(o,'endpointPath','STIRLING_CONFIG_INVALID');
    if(!endpointPath.startsWith('/api/v1/'))throw providerError('STIRLING_CONFIG_INVALID',{message:'STIRLING_CONFIG_INVALID:endpointPath'});
    const inputContentTypes=Array.isArray(o.inputContentTypes)&&o.inputContentTypes.length?o.inputContentTypes.map(v=>req({v},'v','STIRLING_CONFIG_INVALID')):(()=>{throw providerError('STIRLING_CONFIG_INVALID',{message:'STIRLING_CONFIG_INVALID:inputContentTypes'})})();
    const allowedOptions=Array.isArray(o.allowedOptions)?o.allowedOptions.map(v=>req({v},'v','STIRLING_CONFIG_INVALID')):[];
    if(o.deterministic!==true)throw providerError('STIRLING_CONFIG_INVALID',{message:'STIRLING_CONFIG_INVALID:deterministic'});
    operations[key.trim()]=Object.freeze({
      endpointPath,
      operation:req(o,'operation','STIRLING_CONFIG_INVALID'),
      inputContentTypes:Object.freeze([...new Set(inputContentTypes)]),
      outputContentType:req(o,'outputContentType','STIRLING_CONFIG_INVALID').toLowerCase(),
      allowedOptions:Object.freeze([...new Set(allowedOptions)]),
      deterministic:true,
      maxOutputBytes:bounded(o.maxOutputBytes??16_777_216,'maxOutputBytes',1,134_217_728),
    });
  }
  return Object.freeze({
    baseUrl:absoluteHttpUrl(c.baseUrl,'baseUrl'),
    secretBindingRef:req(c,'secretBindingRef','STIRLING_CONFIG_INVALID'),
    operations:Object.freeze(operations),
    timeoutMs:bounded(c.timeoutMs??120000,'timeoutMs',1000,600000),
  });
}
function validateDeps({capabilityRegistry,credentialBroker,artifactReader,artifactBroker,transport}){
  if(!capabilityRegistry||typeof capabilityRegistry.resolve!=='function')throw providerError('STIRLING_CAPABILITY_REGISTRY_REQUIRED');
  if(!credentialBroker||typeof credentialBroker.withCredential!=='function')throw providerError('STIRLING_CREDENTIAL_BROKER_REQUIRED');
  if(!artifactReader||typeof artifactReader.read!=='function')throw providerError('STIRLING_ARTIFACT_READER_REQUIRED');
  if(!artifactBroker||typeof artifactBroker.put!=='function')throw providerError('STIRLING_ARTIFACT_BROKER_REQUIRED');
  if(!transport||typeof transport.transform!=='function')throw providerError('STIRLING_TRANSPORT_REQUIRED');
}
function validateJob(job,cfg){
  const id=req(job,'id'),intentId=req(job,'intentId'),actionType=req(job,'actionType');
  if(!job?.payload||typeof job.payload!=='object'||Array.isArray(job.payload))throw providerError('STIRLING_JOB_INVALID',{message:'STIRLING_JOB_INVALID:payload'});
  const operationKey=req(job.payload,'operationKey');
  const operation=cfg.operations[operationKey];
  if(!operation)throw providerError('STIRLING_OPERATION_NOT_ALLOWED');
  const sourceArtifactRef=req(job.payload,'sourceArtifactRef');
  const options=job.payload.options&&typeof job.payload.options==='object'&&!Array.isArray(job.payload.options)?clone(job.payload.options):{};
  for(const key of Object.keys(options)){
    if(!operation.allowedOptions.includes(key))throw providerError('STIRLING_OPTION_NOT_ALLOWED');
  }
  return Object.freeze({id,intentId,actionType,operationKey,operation,sourceArtifactRef,options});
}
function assertQualified(reg){const p=reg.resolve(CAPABILITY,{allowedProviderIds:[PROVIDER_ID]});if(!p||p.providerId!==PROVIDER_ID)throw providerError('STIRLING_PROVIDER_NOT_QUALIFIED')}
function credReq(cfg,job){return{bindingRef:cfg.secretBindingRef,providerId:PROVIDER_ID,capability:CAPABILITY,executionJobId:job.id,intentId:job.intentId}}
function classifyException(error,started){
  if(!started)return error;
  if(error?.requestSent===false)return providerError('STIRLING_DISPATCH_UNAVAILABLE',{retryable:true,outcomeUnknown:false});
  return providerError('STIRLING_TRANSFORM_RETRYABLE',{retryable:true,outcomeUnknown:false});
}
function normalizeSource(source,job){
  if(!source||typeof source!=='object'||!(source.bytes instanceof Uint8Array))throw providerError('STIRLING_SOURCE_ARTIFACT_INVALID');
  if(typeof source.sha256!=='string'||!source.sha256.trim())throw providerError('STIRLING_SOURCE_ARTIFACT_INVALID');
  const contentType=typeof source.contentType==='string'?source.contentType.toLowerCase():'';
  if(!job.operation.inputContentTypes.map(v=>v.toLowerCase()).includes(contentType))throw providerError('STIRLING_INPUT_TYPE_REJECTED');
  return Object.freeze({bytes:source.bytes,sha256:source.sha256.trim(),contentType});
}
function parseResponse(response,operation){
  const status=Number(response?.status);
  if([401,403].includes(status))throw providerError('STIRLING_AUTHENTICATION_FAILED');
  if(status===429)throw providerError('STIRLING_RATE_LIMITED',{retryable:true,outcomeUnknown:false});
  if(status>=500)throw providerError('STIRLING_TRANSFORM_RETRYABLE',{retryable:true,outcomeUnknown:false});
  if(status<200||status>=300)throw providerError('STIRLING_TRANSFORM_REJECTED');
  const bytes=response?.bodyBytes;
  if(!(bytes instanceof Uint8Array))throw providerError('STIRLING_OUTPUT_INVALID');
  const contentType=typeof response?.contentType==='string'
    ?response.contentType.toLowerCase()
    :typeof response?.headers?.['content-type']==='string'
      ?response.headers['content-type'].split(';')[0].trim().toLowerCase()
      :'';
  if(contentType!==operation.outputContentType)throw providerError('STIRLING_OUTPUT_INVALID');
  if(bytes.byteLength>operation.maxOutputBytes)throw providerError('STIRLING_OUTPUT_TOO_LARGE');
  return Object.freeze({bytes,contentType});
}
export function createStirlingTransformAdapter({
  capabilityRegistry,
  credentialBroker,
  artifactReader,
  artifactBroker,
  transport,
  config,
}={}){
  validateDeps({capabilityRegistry,credentialBroker,artifactReader,artifactBroker,transport});
  const cfg=normalizeConfig(config);

  async function execute(inputJob){
    const job=validateJob(inputJob,cfg);
    assertQualified(capabilityRegistry);
    const source=normalizeSource(await artifactReader.read(job.sourceArtifactRef),job);

    let started=false,response;
    try{
      response=await credentialBroker.withCredential(credReq(cfg,job),async credential=>{
        if(credential?.kind!=='api-key')throw providerError('STIRLING_CREDENTIAL_KIND_INVALID');
        started=true;
        return transport.transform({
          url:`${cfg.baseUrl}${job.operation.endpointPath}`,
          method:'POST',
          timeoutMs:cfg.timeoutMs,
          headers:{'X-API-KEY':credential.value,Accept:job.operation.outputContentType},
          operation:job.operation.operation,
          sourceBytes:source.bytes,
          sourceContentType:source.contentType,
          options:clone(job.options),
        });
      });
    }catch(error){throw classifyException(error,started)}

    const transformed=parseResponse(response,job.operation);
    const artifact=await artifactBroker.put({
      executionJobId:job.id,
      intentId:job.intentId,
      kind:'document.transform',
      contentType:transformed.contentType,
      bytes:transformed.bytes,
      sourceRefs:[job.sourceArtifactRef],
    });
    if(!artifact||typeof artifact.artifactRef!=='string'||typeof artifact.sha256!=='string')throw providerError('STIRLING_ARTIFACT_PERSIST_FAILED');

    return Object.freeze({
      adapterId:'stirling.transform.v1',
      providerId:PROVIDER_ID,
      capability:CAPABILITY,
      effect:Object.freeze({
        effectType:'DOCUMENT.TRANSFORMED',
        resourceType:'ARTIFACT',
        resourceId:artifact.artifactRef,
        state:'SUCCEEDED',
        operationKey:job.operationKey,
        outputSha256:artifact.sha256,
        canonicalStateUpdated:false,
      }),
      verification:Object.freeze({
        verified:true,
        sourceArtifactRef:job.sourceArtifactRef,
        sourceSha256:source.sha256,
        outputArtifactRef:artifact.artifactRef,
        outputSha256:artifact.sha256,
        outputContentType:artifact.contentType||transformed.contentType,
        evidenceSource:'stirling.output+vaos.artifact-hash',
        executionJobId:job.id,
        intentId:job.intentId,
      }),
    });
  }

  return Object.freeze({id:'stirling.transform.v1',providerId:PROVIDER_ID,capability:CAPABILITY,execute});
}
