function fail(code,message=code){const e=new Error(message);e.code=code;e.retryable=false;return e}
function requiredText(input,key){const v=input?.[key];if(typeof v!=='string'||!v.trim())throw fail('ARTIFACT_INPUT_INVALID',`ARTIFACT_INPUT_INVALID:${key}`);return v.trim()}
function normalizeBytes(value){if(value instanceof Uint8Array)return value;if(value instanceof ArrayBuffer)return new Uint8Array(value);if(typeof value==='string')return new TextEncoder().encode(value);throw fail('ARTIFACT_INPUT_INVALID','ARTIFACT_INPUT_INVALID:bytes')}
function normalizeRefs(value){if(value===undefined)return[];if(!Array.isArray(value)||value.some(v=>typeof v!=='string'||!v.trim()))throw fail('ARTIFACT_INPUT_INVALID','ARTIFACT_INPUT_INVALID:sourceRefs');return [...new Set(value.map(v=>v.trim()))]}
function hex(bytes){return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('')}
async function defaultSha256(bytes){if(!globalThis.crypto?.subtle)throw fail('ARTIFACT_SHA256_UNAVAILABLE');return hex(await globalThis.crypto.subtle.digest('SHA-256',bytes))}
function cleanPrefix(value){return String(value||'').replace(/^\/+|\/+$/g,'')}

export function createR2ArtifactStore({bucket,prefix='vaos-artifacts'}={}){
  if(!bucket||typeof bucket.head!=='function'||typeof bucket.put!=='function')throw fail('ARTIFACT_R2_BUCKET_REQUIRED');
  const root=cleanPrefix(prefix);
  async function putImmutable({sha256,bytes,contentType,kind,executionJobId,intentId,sourceRefs=[]}){
    const key=`${root?root+'/':''}sha256/${sha256}`;
    const existing=await bucket.head(key);
    if(existing){
      const existingType=existing.httpMetadata?.contentType||existing.customMetadata?.contentType||null;
      const existingHash=existing.customMetadata?.sha256||sha256;
      if(Number(existing.size)!==bytes.byteLength||existingType!==contentType||existingHash!==sha256){
        throw fail('ARTIFACT_HASH_METADATA_CONFLICT');
      }
      return {outcome:'REPLAY',key,size:Number(existing.size)};
    }
    const customMetadata={
      sha256:String(sha256),
      contentType:String(contentType),
      kind:String(kind),
      executionJobId:String(executionJobId),
      intentId:String(intentId),
      sourceRefs:JSON.stringify(sourceRefs),
    };
    await bucket.put(key,bytes,{
      httpMetadata:{contentType},
      customMetadata,
    });
    const readback=await bucket.head(key);
    if(!readback||Number(readback.size)!==bytes.byteLength)throw fail('ARTIFACT_R2_VERIFICATION_FAILED');
    return {outcome:'CREATED',key,size:bytes.byteLength};
  }
  return Object.freeze({putImmutable});
}

export function createArtifactBroker({
  store,
  sha256=defaultSha256,
  maxBytes=16_777_216,
  allowedContentTypes=null,
}={}){
  if(!store||typeof store.putImmutable!=='function')throw fail('ARTIFACT_STORE_REQUIRED');
  if(typeof sha256!=='function')throw fail('ARTIFACT_SHA256_REQUIRED');
  if(!Number.isInteger(maxBytes)||maxBytes<1)throw fail('ARTIFACT_CONFIG_INVALID:maxBytes');
  if(allowedContentTypes!==null&&(!Array.isArray(allowedContentTypes)||allowedContentTypes.some(v=>typeof v!=='string'||!v.trim())))throw fail('ARTIFACT_CONFIG_INVALID:allowedContentTypes');
  const allowed=allowedContentTypes?new Set(allowedContentTypes.map(v=>v.toLowerCase())):null;

  async function put(input={}){
    const executionJobId=requiredText(input,'executionJobId');
    const intentId=requiredText(input,'intentId');
    const kind=requiredText(input,'kind');
    const contentType=requiredText(input,'contentType').toLowerCase();
    const bytes=normalizeBytes(input.bytes);
    const sourceRefs=normalizeRefs(input.sourceRefs);
    if(bytes.byteLength>maxBytes)throw fail('ARTIFACT_TOO_LARGE');
    if(allowed&&!allowed.has(contentType))throw fail('ARTIFACT_CONTENT_TYPE_REJECTED');
    const digest=await sha256(bytes);
    if(typeof digest!=='string'||!digest.trim())throw fail('ARTIFACT_SHA256_INVALID');
    const sha=digest.trim();
    const stored=await store.putImmutable({sha256:sha,bytes,contentType,kind,executionJobId,intentId,sourceRefs});
    return Object.freeze({
      outcome:stored.outcome,
      artifactRef:`r2:sha256:${sha}`,
      sha256:sha,
      size:bytes.byteLength,
      contentType,
      kind,
      sourceRefs:sourceRefs.slice(),
      executionJobId,
      intentId,
    });
  }
  return Object.freeze({put});
}


/** Read immutable content-addressed PDF artifacts and independently check bytes. */
export function createR2ArtifactReader({bucket,prefix='vaos-artifacts',maxBytes=16_777_216}={}){
  if(!bucket||typeof bucket.get!=='function')throw fail('ARTIFACT_R2_BUCKET_REQUIRED');
  if(!Number.isInteger(maxBytes)||maxBytes<1)throw fail('ARTIFACT_CONFIG_INVALID:maxBytes');
  const root=cleanPrefix(prefix);
  return Object.freeze({
    async read(ref){
      if(typeof ref!=='string'||!/^r2:sha256:[a-f0-9]{64}$/.test(ref))
        throw fail('ARTIFACT_REFERENCE_INVALID');
      const sha=ref.slice('r2:sha256:'.length);
      const key=`${root?root+'/':''}sha256/${sha}`;
      const obj=await bucket.get(key);
      if(!obj)throw fail('ARTIFACT_NOT_FOUND');
      if(Number(obj.size)>maxBytes)throw fail('ARTIFACT_TOO_LARGE');
      if(obj.httpMetadata?.contentType!=='application/pdf')
        throw fail('ARTIFACT_CONTENT_TYPE_REJECTED');
      if(obj.customMetadata?.sha256 && obj.customMetadata.sha256!==sha)
        throw fail('ARTIFACT_HASH_VERIFICATION_FAILED');
      let bytes;
      try{bytes=new Uint8Array(await obj.arrayBuffer())}
      catch{throw fail('ARTIFACT_READ_FAILED')}
      if(bytes.byteLength>maxBytes||bytes.byteLength!==Number(obj.size))
        throw fail('ARTIFACT_SIZE_MISMATCH');
      const digest=await defaultSha256(bytes);
      if(digest!==sha)throw fail('ARTIFACT_HASH_VERIFICATION_FAILED');
      if(bytes.byteLength<5||new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')
        throw fail('ARTIFACT_CONTENT_TYPE_REJECTED');
      return Object.freeze({bytes,sha256:sha,contentType:'application/pdf'});
    },
  });
}
