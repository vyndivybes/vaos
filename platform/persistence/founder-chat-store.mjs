function required(x){if(typeof x!=='string'||!x.trim())throw Error('FOUNDER_CHAT_CONFIG_MISSING');return x.trim();}
export function createFounderChatStore({url,serverSecret,fetchImpl=globalThis.fetch}={}){
 const base=required(url).replace(/\/$/,'');
 const key=required(serverSecret);
 if(typeof fetchImpl!=='function')throw Error('FOUNDER_CHAT_CONFIG_MISSING');
 async function invoke(operation,payload){
  let r;
  try{r=await fetchImpl(base+'/functions/v1/vaos-control',{method:'POST',
   headers:{'x-vaos-server-key':key,'Content-Type':'application/json','Cache-Control':'no-store'},
   body:JSON.stringify({operation,payload})});}catch{throw Error('FOUNDER_CHAT_STORAGE_UNAVAILABLE');}
  if(!r?.ok)throw Error('FOUNDER_CHAT_STORAGE_UNAVAILABLE');
  try{return await r.json();}catch{throw Error('FOUNDER_CHAT_STORAGE_UNAVAILABLE');}
 }
 return Object.freeze({
  get:input=>invoke('founderChatGet',input),
  claim:input=>invoke('founderChatClaim',input),
  append:input=>invoke('founderChatAppend',input)
 });
}
