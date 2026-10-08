function fail(code,{message=code,retryable=false,outcomeUnknown=false,providerRunId}={}){const e=new Error(message);e.code=code;e.retryable=retryable;e.outcomeUnknown=outcomeUnknown;if(providerRunId)e.providerRunId=String(providerRunId);return e}
function req(input,key){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw fail('PAPERWORK_FILE_INPUT_INVALID',{message:`PAPERWORK_FILE_INPUT_INVALID:${key}`});return v.trim()}

export function createPaperworkFileBridge({artifactReader,credentialPort,transport}={}){
  if(!artifactReader||typeof artifactReader.read!=='function')throw fail('PAPERWORK_FILE_ARTIFACT_READER_REQUIRED');
  if(!credentialPort||typeof credentialPort.withToken!=='function')throw fail('PAPERWORK_FILE_CREDENTIAL_PORT_REQUIRED');
  for(const name of ['createFile','uploadBytes','readFile'])if(typeof transport?.[name]!=='function')throw fail('PAPERWORK_FILE_TRANSPORT_REQUIRED');
  const cache=new Map();

  async function ensureFile({artifactRef,executionJobId,intentId}={}){
    artifactRef=req({artifactRef},'artifactRef');
    executionJobId=req({executionJobId},'executionJobId');
    intentId=req({intentId},'intentId');

    const cached=cache.get(artifactRef);
    if(cached){
      const row=await credentialPort.withToken(token=>transport.readFile({fileId:cached.fileId,token}));
      if(!row||row.id!==cached.fileId)throw fail('PAPERWORK_FILE_VERIFICATION_FAILED',{providerRunId:cached.fileId});
      const status=String(row.status||'').toLowerCase();
      if(status!=='ready')throw fail('PAPERWORK_FILE_NOT_READY',{retryable:false,outcomeUnknown:true,providerRunId:cached.fileId});
      return Object.freeze({...cached});
    }

    const source=await artifactReader.read(artifactRef);
    if(!source||typeof source!=='object'||!(source.bytes instanceof Uint8Array))throw fail('PAPERWORK_FILE_SOURCE_INVALID');
    const sourceSha256=req(source,'sha256');
    const contentType=req(source,'contentType').toLowerCase();
    const fileName=typeof source.fileName==='string'&&source.fileName.trim()?source.fileName.trim():'document.bin';

    const created=await credentialPort.withToken(token=>transport.createFile({
      token,
      body:{name:fileName,mimeType:contentType},
      executionJobId,intentId,
    }));
    const fileId=typeof created?.id==='string'&&created.id.trim()?created.id.trim():'';
    const uploadUrl=typeof created?.uploadUrl==='string'&&created.uploadUrl.trim()?created.uploadUrl.trim():'';
    if(!fileId||!uploadUrl)throw fail('PAPERWORK_FILE_REGISTER_FAILED');

    cache.set(artifactRef,Object.freeze({fileId,artifactRef,sourceSha256,contentType,fileName}));

    let uploaded;
    try{
      uploaded=await transport.uploadBytes({url:uploadUrl,bytes:source.bytes,contentType});
    }catch(error){
      if(error?.requestSent===false)throw fail('PAPERWORK_FILE_UPLOAD_UNAVAILABLE',{retryable:true,providerRunId:fileId});
      throw fail('PAPERWORK_FILE_UPLOAD_UNKNOWN',{retryable:false,outcomeUnknown:true,providerRunId:fileId});
    }
    const uploadStatus=Number(uploaded?.status);
    if(!Number.isInteger(uploadStatus)||uploadStatus<200||uploadStatus>=300)throw fail('PAPERWORK_FILE_UPLOAD_FAILED',{providerRunId:fileId});

    const row=await credentialPort.withToken(token=>transport.readFile({fileId,token}));
    if(!row||row.id!==fileId)throw fail('PAPERWORK_FILE_VERIFICATION_FAILED',{providerRunId:fileId});
    const status=String(row.status||'').toLowerCase();
    if(status!=='ready')throw fail('PAPERWORK_FILE_NOT_READY',{retryable:false,outcomeUnknown:true,providerRunId:fileId});
    if(row.mimeType&&String(row.mimeType).toLowerCase()!==contentType)throw fail('PAPERWORK_FILE_VERIFICATION_FAILED',{providerRunId:fileId});
    return Object.freeze({fileId,artifactRef,sourceSha256,contentType,fileName});
  }

  return Object.freeze({ensureFile});
}
