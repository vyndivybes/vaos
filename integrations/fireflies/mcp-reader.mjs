// Read-only, per-user Fireflies MCP reader. Never expose raw provider tools as job actions.
// VAOS caller must supply its authenticated actor, tenant guard, secret broker,
// and an ATOMIC account-wide free-tier quota reservation (shared with other clients).
const ENDPOINT='https://api.fireflies.ai/mcp';
const PROTOCOL='2025-06-18';
const TOOLS=Object.freeze({
  getUser:['get_user','fireflies_get_user'],
  searchMeetings:['get_transcripts','fireflies_get_transcripts'],
  getSummary:['get_summary','fireflies_get_summary'],
});
function fail(code){const e=new Error(code);e.code=code;e.retryable=false;return e}
function text(value,max=180){
  return typeof value==='string'&&value.length>0&&value.length<=max&&
    /^[\w@.:-]+$/.test(value) && value.trim()===value;
}
function readRpc(body,contentType,id){
  let response=body;
  if(typeof body==='string'){
    if(body.length>500000)throw fail('FIREFLIES_RESPONSE_TOO_LARGE');
    if(String(contentType).includes('text/event-stream')){
      const events=body.split(/\r?\n\r?\n/);
      let messages=[];
      for(const event of events){
        const data=event.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');
        if(data&&data!=='[DONE]'){
          try{messages.push(JSON.parse(data))}catch{throw fail('FIREFLIES_RESPONSE_INVALID')}
        }
      }
      response=messages.find(item=>item?.id===id);
    } else {
      try{response=JSON.parse(body)}catch{throw fail('FIREFLIES_RESPONSE_INVALID')}
    }
  }
  if(!response||typeof response!=='object'||Array.isArray(response))throw fail('FIREFLIES_RESPONSE_INVALID');
  let size;
  try{size=JSON.stringify(response).length}catch{throw fail('FIREFLIES_RESPONSE_INVALID')}
  if(size>500000)throw fail('FIREFLIES_RESPONSE_TOO_LARGE');
  if(response.id!==id||response.error||!('result' in response))throw fail('FIREFLIES_REMOTE_RESPONSE_REJECTED');
  return response.result;
}
function normalizeContent(value){
  if(!value||typeof value!=='object'||value.isError===true||!Array.isArray(value.content))throw fail('FIREFLIES_TOOL_RESULT_INVALID');
  const items=value.content.filter(item=>item?.type==='text'&&typeof item.text==='string');
  if(items.length>20||items.some(item=>item.text.length>100000))throw fail('FIREFLIES_RESPONSE_TOO_LARGE');
  return items.map(item=>({type:'text',text:item.text}));
}
export function createFirefliesMcpReader({
  enabled=false,transport,resolveCredential,authorize,reserveQuota,
}={}){
  if(!transport||typeof transport.request!=='function'||
    typeof resolveCredential!=='function'||typeof authorize!=='function'||typeof reserveQuota!=='function'){
    throw fail('FIREFLIES_PORT_REQUIRED');
  }
  async function perform(operation,context,args={}){
    if(!enabled)throw fail('FIREFLIES_DISABLED');
    if(!context||!text(context.tenantId)||!text(context.actorId)||!text(context.accountId))
      throw fail('FIREFLIES_CONTEXT_INVALID');
    const allowed=await authorize({tenantId:context.tenantId,actorId:context.actorId,
      accountId:context.accountId,operation});
    if(allowed!==true)throw fail('FIREFLIES_ACCESS_DENIED');
    let credential;
    try{credential=await resolveCredential({tenantId:context.tenantId,actorId:context.actorId,
      accountId:context.accountId})}catch{throw fail('FIREFLIES_CREDENTIAL_UNAVAILABLE')}
    if(!credential||typeof credential.accessToken!=='string'||credential.accessToken.length<8||
      credential.accountId!==context.accountId)throw fail('FIREFLIES_ACCOUNT_MISMATCH');
    // Reserve once per outgoing HTTP request, not per user operation. Shared,
    // atomic quota broker must reject after its account-wide daily budget.
    let seq=0,sessionId=null;
    const rpc=async(method,params,reply=true)=>{
      let reserved;
      try{reserved=await reserveQuota({provider:'fireflies',accountId:context.accountId,
        tenantId:context.tenantId,units:1})}catch{throw fail('FIREFLIES_DAILY_QUOTA_BLOCKED')}
      if(reserved!==true)throw fail('FIREFLIES_DAILY_QUOTA_BLOCKED');
      const id=reply?++seq:undefined;
      const headers={
        Authorization:'Bearer '+credential.accessToken,
        'Content-Type':'application/json',
        Accept:'application/json, text/event-stream',
        'MCP-Protocol-Version':PROTOCOL,
      };
      if(sessionId)headers['Mcp-Session-Id']=sessionId;
      let response;
      try{
        response=await transport.request({
          url:ENDPOINT,method:'POST',headers,timeoutMs:15000,
          allowedResponseTypes:['application/json','text/event-stream'],
          body:JSON.stringify({jsonrpc:'2.0',...(reply?{id}:{}),method,...(params?{params}:{})}),
        });
      }catch{throw fail('FIREFLIES_REMOTE_UNAVAILABLE')}
      if(response?.status===401||response?.status===403)throw fail('FIREFLIES_AUTH_FAILED');
      if(!Number.isInteger(response?.status)||response.status<200||response.status>=300)
        throw fail('FIREFLIES_REMOTE_UNAVAILABLE');
      const sid=response.headers?.['mcp-session-id'];
      if(typeof sid==='string'&&sid.length<=256&&!/[\r\n]/.test(sid))sessionId=sid;
      if(!reply)return null;
      return readRpc(response.body,response.headers?.['content-type']||'',id);
    };
    const initialized=await rpc('initialize',{protocolVersion:PROTOCOL,capabilities:{},
      clientInfo:{name:'VAOS-Fireflies-ReadOnly',version:'0.1.0'}});
    if(!initialized||typeof initialized!=='object'||!initialized.capabilities)
      throw fail('FIREFLIES_INIT_INVALID');
    await rpc('notifications/initialized',undefined,false);
    const listed=await rpc('tools/list',{});
    if(!Array.isArray(listed?.tools)||listed.tools.length>150)throw fail('FIREFLIES_TOOLS_INVALID');
    const matched=TOOLS[operation].find(name=>listed.tools.some(tool=>tool?.name===name));
    if(!matched)throw fail('FIREFLIES_APPROVED_TOOL_UNAVAILABLE');
    const result=await rpc('tools/call',{name:matched,arguments:args});
    return Object.freeze({
      source:'fireflies',endpoint:ENDPOINT,operation,accountId:context.accountId,
      advisoryOnly:true,trustedInstructions:false,observedAt:new Date().toISOString(),
      content:normalizeContent(result),
    });
  }
  return Object.freeze({
    getUser:context=>perform('getUser',context),
    searchMeetings:(context,{limit=5}={})=>{
      if(!Number.isInteger(limit)||limit<1||limit>10)throw fail('FIREFLIES_INPUT_INVALID');
      return perform('searchMeetings',context,{limit});
    },
    getSummary:(context,transcriptId)=>{
      if(!text(transcriptId,180))throw fail('FIREFLIES_INPUT_INVALID');
      return perform('getSummary',context,{transcriptId});
    },
  });
}
