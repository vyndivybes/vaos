// Safe, bounded, fixed-destination read-only probe. Redirects are never followed. Never stores or displays
// any upstream response body, auth material, URL query, headers or exception text.
const DISCOVERY_URL='https://cloud.activepieces.com/.well-known/oauth-authorization-server';
const HOST='https://cloud.activepieces.com';
export function classifyDiscoveryError(error){
  const message=String(error?.message||'');
  if(/(?:1042|worker.*another worker|same zone)/i.test(message)) return 'MCP_DISCOVERY_WORKER_TO_WORKER_BLOCKED';
  if(/(?:request context|global scope)/i.test(message)) return 'MCP_DISCOVERY_REQUEST_CONTEXT_INVALID';
  if(/(?:AbortSignal\.timeout is not a function|timeout.*not implemented)/i.test(message)) return 'MCP_DISCOVERY_TIMEOUT_API_UNAVAILABLE';
  if(error?.name==='TimeoutError'||error?.name==='AbortError') return 'MCP_DISCOVERY_TIMEOUT';
  if(error?.name==='TypeError') return 'MCP_DISCOVERY_FETCH_TYPE_ERROR';
  return 'MCP_DISCOVERY_FETCH_OTHER';
}
export async function checkActivepiecesDiscovery({fetchImpl=fetch}={}){
  let res;
  try{
    res=await fetchImpl(DISCOVERY_URL,{
      method:'GET',redirect:'manual',
      headers:{Accept:'application/json'},
      signal:AbortSignal.timeout(12000),
    });
  }catch(error){
    return {ok:false,code:classifyDiscoveryError(error),httpStatus:null};
  }
  if(!res||!Number.isInteger(res.status)||res.status<200||res.status>=300)
    return {ok:false,code:'MCP_DISCOVERY_HTTP_'+(res?.status||'UNKNOWN'),httpStatus:res?.status||null};
  try{
    const raw=await res.text();
    if(raw.length>32768) return {ok:false,code:'MCP_DISCOVERY_METADATA_INVALID',httpStatus:res.status};
    const j=JSON.parse(raw);
    if(!j||j.issuer!==HOST ||
        !['authorization_endpoint','registration_endpoint','token_endpoint'].every(k=>{
          try{const u=new URL(j[k]);return u.origin===HOST&&u.protocol==='https:'&&u.username===''&&u.password===''}catch{return false}
        }))return {ok:false,code:'MCP_DISCOVERY_METADATA_UNTRUSTED',httpStatus:res.status};
    return {ok:true,code:'MCP_DISCOVERY_OK',httpStatus:res.status};
  }catch{
    return {ok:false,code:'MCP_DISCOVERY_METADATA_INVALID',httpStatus:res.status};
  }
}
