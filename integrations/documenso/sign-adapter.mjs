const PROVIDER_ID='documenso';
const CAPABILITY='document.sign';
const ACTIVE_STATUS=new Set(['DRAFT','PENDING']);
const FAILED_STATUS=new Set(['REJECTED','CANCELLED','CANCELED']);

function providerError(code,{message=code,retryable=false,outcomeUnknown=false,providerRunId}={}){
  const e=new Error(message);e.code=code;e.retryable=retryable;e.outcomeUnknown=outcomeUnknown;
  if(providerRunId)e.providerRunId=String(providerRunId);
  return e;
}
function req(input,key,prefix='DOCUMENSO_JOB_INVALID'){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw providerError(prefix,{message:`${prefix}:${key}`});return v.trim()}
function clone(v){return structuredClone(v)}
function absoluteHttpUrl(value,key){if(typeof value!=='string'||!value.trim())throw providerError('DOCUMENSO_CONFIG_INVALID',{message:`DOCUMENSO_CONFIG_INVALID:${key}`});let u;try{u=new URL(value.trim())}catch{throw providerError('DOCUMENSO_CONFIG_INVALID',{message:`DOCUMENSO_CONFIG_INVALID:${key}`})}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw providerError('DOCUMENSO_CONFIG_INVALID',{message:`DOCUMENSO_CONFIG_INVALID:${key}`});return u.toString().replace(/\/$/,'')}
function bounded(value,key,min,max){const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw providerError('DOCUMENSO_CONFIG_INVALID',{message:`DOCUMENSO_CONFIG_INVALID:${key}`});return n}
function normalizeConfig(c){
  if(!c?.profiles||typeof c.profiles!=='object'||Array.isArray(c.profiles)||!Object.keys(c.profiles).length)throw providerError('DOCUMENSO_CONFIG_INVALID',{message:'DOCUMENSO_CONFIG_INVALID:profiles'});
  const profiles={};
  for(const [key,p] of Object.entries(c.profiles)){
    if(typeof key!=='string'||!key.trim()||!p||typeof p!=='object'||Array.isArray(p))throw providerError('DOCUMENSO_CONFIG_INVALID',{message:'DOCUMENSO_CONFIG_INVALID:profiles'});
    const recipients=Array.isArray(p.recipients)&&p.recipients.length?p.recipients.map(r=>Object.freeze({
      slot:req(r,'slot','DOCUMENSO_CONFIG_INVALID'),
      role:req(r,'role','DOCUMENSO_CONFIG_INVALID').toUpperCase(),
      signingOrder:bounded(r.signingOrder??1,'signingOrder',1,1000),
    })):(()=>{throw providerError('DOCUMENSO_CONFIG_INVALID',{message:'DOCUMENSO_CONFIG_INVALID:recipients'})})();
    const slots=new Set(recipients.map(r=>r.slot));
    if(slots.size!==recipients.length)throw providerError('DOCUMENSO_CONFIG_INVALID',{message:'DOCUMENSO_CONFIG_INVALID:recipientSlots'});
    const fields=Array.isArray(p.fields)?p.fields.map(f=>{
      const slot=req(f,'slot','DOCUMENSO_CONFIG_INVALID');
      if(!slots.has(slot))throw providerError('DOCUMENSO_CONFIG_INVALID',{message:'DOCUMENSO_CONFIG_INVALID:fieldSlot'});
      return Object.freeze({
        slot,
        type:req(f,'type','DOCUMENSO_CONFIG_INVALID').toUpperCase(),
        page:bounded(f.page,'page',1,10000),
        positionX:req(f,'positionX','DOCUMENSO_CONFIG_INVALID'),
        positionY:req(f,'positionY','DOCUMENSO_CONFIG_INVALID'),
        width:req(f,'width','DOCUMENSO_CONFIG_INVALID'),
        height:req(f,'height','DOCUMENSO_CONFIG_INVALID'),
      });
    }):[];
    profiles[key.trim()]=Object.freeze({
      title:req(p,'title','DOCUMENSO_CONFIG_INVALID'),
      visibility:typeof p.visibility==='string'&&p.visibility.trim()?p.visibility.trim().toUpperCase():'ADMIN',
      recipients:Object.freeze(recipients),
      fields:Object.freeze(fields),
    });
  }
  return Object.freeze({
    baseUrl:absoluteHttpUrl(c.baseUrl,'baseUrl'),
    secretBindingRef:req(c,'secretBindingRef','DOCUMENSO_CONFIG_INVALID'),
    profiles:Object.freeze(profiles),
    dispatchTimeoutMs:bounded(c.dispatchTimeoutMs??15000,'dispatchTimeoutMs',1000,120000),
    completionTimeoutMs:bounded(c.completionTimeoutMs??300000,'completionTimeoutMs',1000,900000),
    maxSignedBytes:bounded(c.maxSignedBytes??16_777_216,'maxSignedBytes',1,134_217_728),
  });
}
function validateDeps({capabilityRegistry,credentialBroker,artifactReader,artifactBroker,transport}){
  if(!capabilityRegistry||typeof capabilityRegistry.resolve!=='function')throw providerError('DOCUMENSO_CAPABILITY_REGISTRY_REQUIRED');
  if(!credentialBroker||typeof credentialBroker.withCredential!=='function')throw providerError('DOCUMENSO_CREDENTIAL_BROKER_REQUIRED');
  if(!artifactReader||typeof artifactReader.read!=='function')throw providerError('DOCUMENSO_ARTIFACT_READER_REQUIRED');
  if(!artifactBroker||typeof artifactBroker.put!=='function')throw providerError('DOCUMENSO_ARTIFACT_BROKER_REQUIRED');
  if(!transport||typeof transport.createEnvelope!=='function'||typeof transport.distributeEnvelope!=='function'||typeof transport.waitForEnvelope!=='function'||typeof transport.downloadSigned!=='function')throw providerError('DOCUMENSO_TRANSPORT_REQUIRED');
}
function validateSigner(value,slot){
  if(!value||typeof value!=='object'||Array.isArray(value))throw providerError('DOCUMENSO_SIGNER_REQUIRED',{message:`DOCUMENSO_SIGNER_REQUIRED:${slot}`});
  const name=req(value,'name','DOCUMENSO_SIGNER_REQUIRED');
  const email=req(value,'email','DOCUMENSO_SIGNER_REQUIRED').toLowerCase();
  if(!email.includes('@'))throw providerError('DOCUMENSO_SIGNER_REQUIRED',{message:`DOCUMENSO_SIGNER_REQUIRED:${slot}`});
  return Object.freeze({name,email});
}
function validateJob(job,cfg){
  const id=req(job,'id'),intentId=req(job,'intentId'),actionType=req(job,'actionType');
  if(!job?.payload||typeof job.payload!=='object'||Array.isArray(job.payload))throw providerError('DOCUMENSO_JOB_INVALID',{message:'DOCUMENSO_JOB_INVALID:payload'});
  const signatureKey=req(job.payload,'signatureKey');
  const profile=cfg.profiles[signatureKey];
  if(!profile)throw providerError('DOCUMENSO_PROFILE_NOT_ALLOWED');
  const sourceArtifactRef=req(job.payload,'sourceArtifactRef');
  const signers={};
  const supplied=job.payload.signers;
  if(!supplied||typeof supplied!=='object'||Array.isArray(supplied))throw providerError('DOCUMENSO_SIGNER_REQUIRED');
  for(const recipient of profile.recipients)signers[recipient.slot]=validateSigner(supplied[recipient.slot],recipient.slot);
  return Object.freeze({id,intentId,actionType,signatureKey,profile,sourceArtifactRef,signers:Object.freeze(signers)});
}
function assertQualified(reg){const p=reg.resolve(CAPABILITY,{allowedProviderIds:[PROVIDER_ID]});if(!p||p.providerId!==PROVIDER_ID)throw providerError('DOCUMENSO_PROVIDER_NOT_QUALIFIED')}
function credReq(cfg,job){return{bindingRef:cfg.secretBindingRef,providerId:PROVIDER_ID,capability:CAPABILITY,executionJobId:job.id,intentId:job.intentId}}
function authHeader(credential){if(credential?.kind!=='api-key')throw providerError('DOCUMENSO_CREDENTIAL_KIND_INVALID');return credential.value}
function normalizeSource(source){
  if(!source||typeof source!=='object'||!(source.bytes instanceof Uint8Array))throw providerError('DOCUMENSO_SOURCE_ARTIFACT_INVALID');
  if(typeof source.sha256!=='string'||!source.sha256.trim())throw providerError('DOCUMENSO_SOURCE_ARTIFACT_INVALID');
  if(String(source.contentType||'').toLowerCase()!=='application/pdf')throw providerError('DOCUMENSO_SOURCE_TYPE_INVALID');
  return Object.freeze({
    bytes:source.bytes,
    sha256:source.sha256.trim(),
    contentType:'application/pdf',
    fileName:typeof source.fileName==='string'&&source.fileName.trim()?source.fileName.trim():'document.pdf',
  });
}
function buildPayload(job){
  const recipients=job.profile.recipients.map(r=>{
    const signer=job.signers[r.slot];
    const fields=job.profile.fields
      .filter(f=>f.slot===r.slot)
      .map(f=>({
        type:f.type,
        page:f.page,
        positionX:f.positionX,
        positionY:f.positionY,
        width:f.width,
        height:f.height,
      }));
    return {
      name:signer.name,
      email:signer.email,
      role:r.role,
      signingOrder:r.signingOrder,
      fields,
    };
  });
  return Object.freeze({
    type:'DOCUMENT',
    title:job.profile.title,
    externalId:job.id,
    visibility:job.profile.visibility,
    recipients,
  });
}
function classifyCreateException(error,started){
  if(!started)return error;
  if(error?.requestSent===false)return providerError('DOCUMENSO_CREATE_UNAVAILABLE',{retryable:true,outcomeUnknown:false});
  return providerError('DOCUMENSO_CREATE_OUTCOME_UNKNOWN',{retryable:false,outcomeUnknown:true});
}
function parseEnvelopeId(response){
  const status=Number(response?.status);
  if([401,403].includes(status))throw providerError('DOCUMENSO_AUTHENTICATION_FAILED');
  if(status===429)throw providerError('DOCUMENSO_RATE_LIMITED',{retryable:true,outcomeUnknown:false});
  if(status>=500)throw providerError('DOCUMENSO_CREATE_OUTCOME_UNKNOWN',{retryable:false,outcomeUnknown:true});
  if(status<200||status>=300)throw providerError('DOCUMENSO_CREATE_REJECTED');
  const id=typeof response?.body?.id==='string'?response.body.id.trim():typeof response?.body?.envelopeId==='string'?response.body.envelopeId.trim():'';
  if(!id)throw providerError('DOCUMENSO_CREATE_OUTCOME_UNKNOWN',{retryable:false,outcomeUnknown:true});
  return id;
}
function classifyDistribution(response,envelopeId){
  const status=Number(response?.status);
  if([401,403].includes(status))throw providerError('DOCUMENSO_AUTHENTICATION_FAILED',{providerRunId:envelopeId});
  if(status===429)throw providerError('DOCUMENSO_RATE_LIMITED',{providerRunId:envelopeId,retryable:true,outcomeUnknown:false});
  if(status>=500)throw providerError('DOCUMENSO_DISTRIBUTION_OUTCOME_UNKNOWN',{providerRunId:envelopeId,retryable:false,outcomeUnknown:true});
  if(status<200||status>=300||response?.body?.success===false)throw providerError('DOCUMENSO_DISTRIBUTION_REJECTED',{providerRunId:envelopeId});
}
function verifyEnvelope(row,envelopeId,job){
  if(!row||typeof row!=='object'||row.id!==envelopeId)throw providerError('DOCUMENSO_VERIFICATION_FAILED',{providerRunId:envelopeId});
  const status=String(row.status||'').toUpperCase();
  if(ACTIVE_STATUS.has(status))throw providerError('DOCUMENSO_SIGNATURE_INCOMPLETE',{providerRunId:envelopeId,retryable:false,outcomeUnknown:true});
  if(FAILED_STATUS.has(status))throw providerError('DOCUMENSO_SIGNATURE_FAILED',{providerRunId:envelopeId,retryable:false,outcomeUnknown:false});
  if(status!=='COMPLETED'||row.externalId!==job.id)throw providerError('DOCUMENSO_VERIFICATION_FAILED',{providerRunId:envelopeId});
  const recipients=Array.isArray(row.recipients)?row.recipients:[];
  for(const expected of job.profile.recipients){
    const signer=job.signers[expected.slot];
    const found=recipients.find(r=>String(r.email||'').toLowerCase()===signer.email&&String(r.role||'').toUpperCase()===expected.role);
    if(!found||String(found.signingStatus||'').toUpperCase()!=='SIGNED')throw providerError('DOCUMENSO_VERIFICATION_FAILED',{providerRunId:envelopeId});
  }
  const items=Array.isArray(row.envelopeItems)?row.envelopeItems:[];
  if(items.length!==1||typeof items[0]?.id!=='string'||!items[0].id.trim())throw providerError('DOCUMENSO_VERIFICATION_FAILED',{providerRunId:envelopeId});
  return Object.freeze({itemId:items[0].id.trim()});
}
function parseDownload(response,cfg,envelopeId){
  const status=Number(response?.status);
  if(status===404||status===409||status===425)throw providerError('DOCUMENSO_SIGNED_DOWNLOAD_PENDING',{providerRunId:envelopeId,retryable:true,outcomeUnknown:false});
  if([401,403].includes(status))throw providerError('DOCUMENSO_AUTHENTICATION_FAILED',{providerRunId:envelopeId});
  if(status<200||status>=300)throw providerError('DOCUMENSO_SIGNED_DOWNLOAD_FAILED',{providerRunId:envelopeId});
  if(!(response?.bodyBytes instanceof Uint8Array))throw providerError('DOCUMENSO_SIGNED_TYPE_INVALID',{providerRunId:envelopeId});
  const type=String(response.contentType||response?.headers?.['content-type']||'').split(';')[0].trim().toLowerCase();
  if(type!=='application/pdf')throw providerError('DOCUMENSO_SIGNED_TYPE_INVALID',{providerRunId:envelopeId});
  if(response.bodyBytes.byteLength>cfg.maxSignedBytes)throw providerError('DOCUMENSO_SIGNED_TOO_LARGE',{providerRunId:envelopeId});
  return Object.freeze({bytes:response.bodyBytes,contentType:type});
}
export function createDocumensoSignAdapter({
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
    const source=normalizeSource(await artifactReader.read(job.sourceArtifactRef));

    let createStarted=false,createResponse;
    try{
      createResponse=await credentialBroker.withCredential(credReq(cfg,job),async credential=>{
        createStarted=true;
        return transport.createEnvelope({
          url:`${cfg.baseUrl}/envelope/create`,
          method:'POST',
          timeoutMs:cfg.dispatchTimeoutMs,
          headers:{Authorization:authHeader(credential),Accept:'application/json'},
          payload:buildPayload(job),
          files:[{name:source.fileName,contentType:source.contentType,bytes:source.bytes}],
        });
      });
    }catch(error){throw classifyCreateException(error,createStarted)}
    const envelopeId=parseEnvelopeId(createResponse);

    let sendStarted=false,sendResponse;
    try{
      sendResponse=await credentialBroker.withCredential(credReq(cfg,job),async credential=>{
        sendStarted=true;
        return transport.distributeEnvelope({
          url:`${cfg.baseUrl}/envelope/distribute`,
          method:'POST',
          timeoutMs:cfg.dispatchTimeoutMs,
          headers:{Authorization:authHeader(credential),'Content-Type':'application/json',Accept:'application/json'},
          body:{envelopeId},
        });
      });
    }catch(error){
      if(!sendStarted)throw error;
      if(error?.requestSent===false)throw providerError('DOCUMENSO_DISTRIBUTION_UNAVAILABLE',{providerRunId:envelopeId,retryable:true,outcomeUnknown:false});
      throw providerError('DOCUMENSO_DISTRIBUTION_OUTCOME_UNKNOWN',{providerRunId:envelopeId,retryable:false,outcomeUnknown:true});
    }
    classifyDistribution(sendResponse,envelopeId);

    let envelopeRow;
    try{
      envelopeRow=await credentialBroker.withCredential(credReq(cfg,job),async credential=>transport.waitForEnvelope({
        url:`${cfg.baseUrl}/envelope/${encodeURIComponent(envelopeId)}`,
        envelopeId,
        timeoutMs:cfg.completionTimeoutMs,
        headers:{Authorization:authHeader(credential),Accept:'application/json'},
      }));
    }catch(error){
      if(error?.code?.startsWith?.('CREDENTIAL_')||error?.code==='DOCUMENSO_CREDENTIAL_KIND_INVALID')throw error;
      throw providerError('DOCUMENSO_SIGNATURE_INCOMPLETE',{providerRunId:envelopeId,retryable:false,outcomeUnknown:true});
    }
    const verifiedEnvelope=verifyEnvelope(envelopeRow,envelopeId,job);

    let signedResponse;
    try{
      signedResponse=await credentialBroker.withCredential(credReq(cfg,job),async credential=>transport.downloadSigned({
        url:`${cfg.baseUrl}/envelope/item/${encodeURIComponent(verifiedEnvelope.itemId)}/download?version=signed`,
        envelopeId,
        envelopeItemId:verifiedEnvelope.itemId,
        timeoutMs:cfg.dispatchTimeoutMs,
        headers:{Authorization:authHeader(credential),Accept:'application/pdf'},
      }));
    }catch(error){
      if(error?.code?.startsWith?.('CREDENTIAL_')||error?.code==='DOCUMENSO_CREDENTIAL_KIND_INVALID')throw error;
      throw providerError('DOCUMENSO_SIGNED_DOWNLOAD_PENDING',{providerRunId:envelopeId,retryable:true,outcomeUnknown:false});
    }
    const signed=parseDownload(signedResponse,cfg,envelopeId);

    const artifact=await artifactBroker.put({
      executionJobId:job.id,
      intentId:job.intentId,
      kind:'document.signed',
      contentType:signed.contentType,
      bytes:signed.bytes,
      sourceRefs:[job.sourceArtifactRef,`documenso:envelope:${envelopeId}`],
    });
    if(!artifact||typeof artifact.artifactRef!=='string'||typeof artifact.sha256!=='string')throw providerError('DOCUMENSO_ARTIFACT_PERSIST_FAILED',{providerRunId:envelopeId});

    return Object.freeze({
      adapterId:'documenso.sign.v1',
      providerId:PROVIDER_ID,
      capability:CAPABILITY,
      effect:Object.freeze({
        effectType:'DOCUMENT.SIGNATURE_COMPLETED',
        resourceType:'DOCUMENSO_ENVELOPE',
        resourceId:envelopeId,
        state:'COMPLETED',
        signedArtifactRef:artifact.artifactRef,
        canonicalStateUpdated:false,
      }),
      verification:Object.freeze({
        verified:true,
        resourceType:'DOCUMENSO_ENVELOPE',
        resourceId:envelopeId,
        sourceArtifactRef:job.sourceArtifactRef,
        sourceSha256:source.sha256,
        signedArtifactRef:artifact.artifactRef,
        signedSha256:artifact.sha256,
        envelopeItemId:verifiedEnvelope.itemId,
        evidenceSource:'documenso.envelope-readback+signed-artifact-hash',
        executionJobId:job.id,
        intentId:job.intentId,
      }),
    });
  }

  return Object.freeze({id:'documenso.sign.v1',providerId:PROVIDER_ID,capability:CAPABILITY,execute});
}
