// Server-side conversation ledger adapter. Never expose VAOS_DB_RPC_SECRET to the browser.
function required(v){if(typeof v!=='string'||!v.trim())throw Error('FOUNDER_CONVERSATION_CONFIG_MISSING');return v.trim();}
export function createFounderConversationStore({url,serverSecret,fetchImpl=globalThis.fetch}={}){
 const base=required(url).replace(/\/$/,'');const key=required(serverSecret);
 if(typeof fetchImpl!=='function')throw Error('FOUNDER_CONVERSATION_CONFIG_MISSING');
 async function call(operation,payload){
  let res;try{res=await fetchImpl(base+'/functions/v1/vaos-control',{method:'POST',
   headers:{'x-vaos-server-key':key,'Content-Type':'application/json','Cache-Control':'no-store'},
   body:JSON.stringify({operation,payload})});}catch{throw Error('FOUNDER_CONVERSATION_STORAGE_UNAVAILABLE');}
  if(!res?.ok)throw Error('FOUNDER_CONVERSATION_STORAGE_UNAVAILABLE');
  try{return await res.json();}catch{throw Error('FOUNDER_CONVERSATION_STORAGE_UNAVAILABLE');}
 }
 return Object.freeze({
  history:data=>call('founderConversationHistory',data),
  link:data=>call('founderConversationLink',data)
 });
}
