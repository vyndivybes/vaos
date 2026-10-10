// Server-only persistence. Never import from browser code.
function requireValue(value){
 if(typeof value!=='string'||!value.trim())throw Error('FOUNDER_INBOX_CONFIG_MISSING');
 return value.trim();
}
export function createFounderInboxStore({url,serverSecret,fetchImpl=globalThis.fetch}={}){
 const base=requireValue(url).replace(/\/$/,'');
 const key=requireValue(serverSecret);
 if(typeof fetchImpl!=='function')throw Error('FOUNDER_INBOX_CONFIG_MISSING');
 async function invoke(operation,payload){
  let response;
  try{response=await fetchImpl(base+'/functions/v1/vaos-control',{
   method:'POST',headers:{'x-vaos-server-key':key,'Content-Type':'application/json','Cache-Control':'no-store'},
   body:JSON.stringify({operation,payload})});
  }catch{throw Error('FOUNDER_INBOX_UNAVAILABLE');}
  if(!response?.ok)throw Error('FOUNDER_INBOX_UNAVAILABLE');
  try{return await response.json();}catch{throw Error('FOUNDER_INBOX_UNAVAILABLE');}
 }
 return Object.freeze({
  append:input=>invoke('founderInboxAppend',input),
  list:input=>invoke('founderInboxList',input)
 });
}
