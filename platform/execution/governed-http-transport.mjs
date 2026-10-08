function fail(code,{message=code,requestSent=false,outcomeUnknown=false}={}){const e=new Error(message);e.code=code;e.retryable=false;e.requestSent=requestSent;e.outcomeUnknown=outcomeUnknown;return e}
function validateOrigin(value){let u;try{u=new URL(value)}catch{throw fail('GOV_HTTP_CONFIG_INVALID')}if(u.protocol!=='https:'||u.username||u.password)throw fail('GOV_HTTP_CONFIG_INVALID');return u.origin}
function byteLength(value){return new TextEncoder().encode(value).byteLength}
function headersObject(headers){const out={};if(headers&&typeof headers.entries==='function'){for(const [k,v] of headers.entries())out[String(k).toLowerCase()]=String(v)}return out}
function contentTypeBase(value){return typeof value==='string'?value.split(';')[0].trim().toLowerCase():''}
function parseJson(text){try{return JSON.parse(text)}catch{throw fail('GOV_HTTP_RESPONSE_INVALID_JSON',{requestSent:true,outcomeUnknown:false})}}

export function createGovernedHttpTransport({
  allowedOrigins,
  fetchImpl=globalThis.fetch,
  maxRequestBytes=1_048_576,
  maxResponseBytes=4_194_304,
}={}){
  if(!Array.isArray(allowedOrigins)||allowedOrigins.length===0)throw fail('GOV_HTTP_ALLOWED_ORIGINS_REQUIRED');
  const origins=new Set(allowedOrigins.map(validateOrigin));
  if(typeof fetchImpl!=='function')throw fail('GOV_HTTP_FETCH_REQUIRED');
  if(!Number.isInteger(maxRequestBytes)||maxRequestBytes<1)throw fail('GOV_HTTP_CONFIG_INVALID');
  if(!Number.isInteger(maxResponseBytes)||maxResponseBytes<1)throw fail('GOV_HTTP_CONFIG_INVALID');

  async function request({
    url,
    method='GET',
    headers={},
    body,
    timeoutMs=30_000,
    allowedResponseTypes=['application/json','text/plain'],
  }={}){
    let target;try{target=new URL(url)}catch{throw fail('GOV_HTTP_URL_INVALID')}
    if(target.protocol!=='https:'||target.username||target.password)throw fail('GOV_HTTP_URL_INVALID');
    if(!origins.has(target.origin))throw fail('GOV_HTTP_ORIGIN_NOT_ALLOWED');
    const normalizedMethod=String(method||'GET').toUpperCase();
    if(!['GET','POST','PUT','PATCH','DELETE','HEAD'].includes(normalizedMethod))throw fail('GOV_HTTP_METHOD_NOT_ALLOWED');
    if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>600_000)throw fail('GOV_HTTP_TIMEOUT_INVALID');
    if(!Array.isArray(allowedResponseTypes)||allowedResponseTypes.some(v=>typeof v!=='string'||!v.trim()))throw fail('GOV_HTTP_RESPONSE_TYPE_INVALID');

    let encodedBody;
    const requestHeaders={...headers};
    if(body!==undefined&&body!==null){
      if(typeof body==='string')encodedBody=body;
      else if(body instanceof Uint8Array)encodedBody=body;
      else{
        encodedBody=JSON.stringify(body);
        if(!Object.keys(requestHeaders).some(k=>k.toLowerCase()==='content-type'))requestHeaders['Content-Type']='application/json';
      }
      const size=typeof encodedBody==='string'?byteLength(encodedBody):encodedBody.byteLength;
      if(size>maxRequestBytes)throw fail('GOV_HTTP_REQUEST_TOO_LARGE');
    }

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    let response;
    try{
      response=await fetchImpl(target.toString(),{
        method:normalizedMethod,
        headers:requestHeaders,
        body:['GET','HEAD'].includes(normalizedMethod)?undefined:encodedBody,
        redirect:'manual',
        signal:controller.signal,
      });
    }catch(error){
      const timedOut=error?.name==='AbortError'||controller.signal.aborted;
      throw fail(timedOut?'GOV_HTTP_TIMEOUT':'GOV_HTTP_NETWORK_ERROR',{
        requestSent:true,
        outcomeUnknown:true,
      });
    }finally{
      clearTimeout(timer);
    }

    const status=Number(response?.status);
    if(!Number.isInteger(status))throw fail('GOV_HTTP_RESPONSE_INVALID',{requestSent:true});
    if(status>=300&&status<400)throw fail('GOV_HTTP_REDIRECT_BLOCKED',{requestSent:true,outcomeUnknown:false});

    const responseHeaders=headersObject(response?.headers);
    const declaredLength=Number(response?.headers?.get?.('content-length'));
    if(Number.isFinite(declaredLength)&&declaredLength>maxResponseBytes)throw fail('GOV_HTTP_RESPONSE_TOO_LARGE',{requestSent:true});

    const contentType=contentTypeBase(response?.headers?.get?.('content-type'));
    const normalizedAllowed=allowedResponseTypes.map(v=>v.toLowerCase());
    if(normalizedAllowed.length&&contentType&&!normalizedAllowed.includes(contentType)&&!normalizedAllowed.some(v=>v.endsWith('/*')&&contentType.startsWith(v.slice(0,-1)))){
      throw fail('GOV_HTTP_CONTENT_TYPE_REJECTED',{requestSent:true});
    }

    let raw=new Uint8Array(0);
    if(normalizedMethod!=='HEAD'&&typeof response?.arrayBuffer==='function'){
      raw=new Uint8Array(await response.arrayBuffer());
      if(raw.byteLength>maxResponseBytes)throw fail('GOV_HTTP_RESPONSE_TOO_LARGE',{requestSent:true});
    }
    const textValue=new TextDecoder().decode(raw);
    let parsedBody=null;
    if(raw.byteLength){
      if(contentType==='application/json'||contentType.endsWith('+json'))parsedBody=parseJson(textValue);
      else parsedBody=textValue;
    }

    return Object.freeze({
      status,
      headers:Object.freeze(responseHeaders),
      body:parsedBody,
    });
  }

  return Object.freeze({request});
}
