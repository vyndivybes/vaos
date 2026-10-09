// Project-scoped ephemeral MCP client. OAuth token never leaves the Durable Object.
const DEST='https://cloud.activepieces.com/mcp/platform';
const err=code=>Object.assign(new Error(code),{code});
function parsed(raw,contentType=''){
  if(raw.length>200000)throw err('AP_RESPONSE_TOO_LARGE');
  try{
    if(contentType.includes('text/event-stream')){
      const line=raw.split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trim())
        .find(x=>x.startsWith('{')&&x.includes('"jsonrpc"'));
      if(!line)throw Error('SSE_EMPTY');return JSON.parse(line);
    }
    return JSON.parse(raw);
  }catch{throw err('AP_RESPONSE_JSON_INVALID')}
}
export function createActivepiecesToolClient({accessToken,fetchImpl=fetch}={}){
  if(typeof accessToken!=='string'||accessToken.length<8)throw err('AP_CREDENTIAL_UNAVAILABLE');
  let sessionId=null,sequence=0,initialized=false;
  const rpc=async(method,params,reply=true)=>{
    const id=reply?++sequence:undefined;
    const headers={'Authorization':'Bearer '+accessToken,'Content-Type':'application/json',
      'Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2025-03-26'};
    if(sessionId)headers['Mcp-Session-Id']=sessionId;
    let response;
    try{
      response=await fetchImpl(DEST,{method:'POST',redirect:'manual',headers,
        body:JSON.stringify({jsonrpc:'2.0',...(reply?{id}:{}),method,...(params?{params}:{})}),
        signal:AbortSignal.timeout(method==='tools/call'?125000:12000)});
    }catch{throw err(method==='tools/call'?'AP_MCP_TOOL_NETWORK_UNKNOWN':'AP_MCP_INIT_NETWORK_FAILED')}
    if(!response||response.status<200||response.status>=300)throw err('AP_MCP_HTTP_'+String(response?.status||'UNKNOWN'));
    const sid=response.headers?.get('mcp-session-id');
    if(typeof sid==='string'&&sid.length<=256)sessionId=sid;
    if(!reply)return null;
    const result=parsed(await response.text(),response.headers?.get('content-type')||'');
    if(result.id!==id||result.error||!result.result)throw err('AP_MCP_REMOTE_ERROR');
    return result.result;
  };
  const init=async()=>{
    if(initialized)return;
    const result=await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},
      clientInfo:{name:'VAOS-synthetic-qualifier',version:'1.0'}});
    if(!result?.capabilities)throw err('AP_MCP_INIT_INVALID');
    await rpc('notifications/initialized',null,false);
    initialized=true;
  };
  return {
    tools:async()=>{await init();const result=await rpc('tools/list',{});if(!Array.isArray(result.tools))throw err('AP_TOOLS_INVALID');return result.tools;},
    call:async(name,args={})=>{
      if(!/^ap_[a-z_]{3,64}$/.test(name))throw err('AP_TOOL_NAME_INVALID');
      await init();return rpc('tools/call',{name,arguments:args});
    }
  };
}
