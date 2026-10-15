// Founder Slack operational intent and private, non-authoritative intake evidence.
// This module never invokes VYNDI sales-order, production-job or inventory mutations.
const INTAKE_PREFIX='runtime/slack-production-intake/v1/';
const CONTEXT_PREFIX='runtime/slack-founder-context/v1/';
const DAY_MS=86400000;

function safeDM(context){
 return context?.kind==='dm'&&/^D[A-Z0-9]{8,}$/.test(context.channel||'');
}
export function parseFounderProductionRequest(text){
 if(typeof text!=='string'||text.length>500)return null;
 const q=text.trim();
 if(!/\b(?:inform|notify|tell|record|register|prepare|raise)\b/i.test(q))return null;
 if(!/\bproduction\b/i.test(q))return null;
 if(!/\b(?:demand|ord(?:er|cer)|orcer|additional|more)\b/i.test(q))return null;
 const match=q.match(/\b(?:for|of|add)\s+(\d{1,3})\s+more\b/i)
  ||q.match(/\b(\d{1,3})\s+(?:additional|more)\b/i);
 if(!match)return null;
 const quantity=Number(match[1]);
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>20)return null;
 const model=/\bVYNDI\s+ALTITUDE\b/i.test(q)?'VYNDI Altitude':null;
 const material=/\bCARBON\b/i.test(q)?'CARBON':null;
 const sizeMatch=q.match(/\b(XS|XL|S|M|L)\s+FRAME\b/i);
 const size=sizeMatch?.[1]?.toUpperCase()||null;
 const orderRef=(q.match(/\b(?:sales|customer)\s*order\s*(?:no|number|ref|id|#)\s*[:#-]?\s*([A-Z0-9_-]{4,35})\b/i)||[])[1]||null;
 return Object.freeze({
  kind:'PRODUCTION_DEMAND_INTAKE',quantity,model,material,size,orderRef,
  claimedConfirmed:/\bconfirmed\b/i.test(q),
  productionReleaseAuthorized:false
 });
}

export async function readFounderProductionIntake(env,requestId){
 if(!/^Ev[A-Za-z0-9_-]{4,80}$/.test(requestId||''))return null;
 if(typeof env?.VAOS_ARTIFACTS?.get!=='function')return null;
 const object=await env.VAOS_ARTIFACTS.get(INTAKE_PREFIX+requestId+'.json');
 if(!object)return null;
 try{const value=JSON.parse(await object.text());return value?.schemaVersion==='vaos.production-intake.v1'?value:null}
 catch{return null}
}
export async function prepareFounderProductionIntake(parsed,env,context,{now=()=>Date.now()}={}){
 if(!parsed||!safeDM(context)||!/^Ev[A-Za-z0-9_-]{4,80}$/.test(context.eventId||''))
  return {status:'HOLD',answer:'Production requests can be recorded only from a verified founder direct message.',actionAuthorized:false};
 if(typeof env?.VAOS_ARTIFACTS?.put!=='function'||typeof env?.VAOS_ARTIFACTS?.get!=='function')
  return {status:'HOLD',answer:'Production intake storage is unavailable. No request was recorded.',actionAuthorized:false};
 const requestId=context.eventId;
 let record=await readFounderProductionIntake(env,requestId);
 let duplicate=Boolean(record);
 if(!record){
  record={
   schemaVersion:'vaos.production-intake.v1',requestId,
   state:'PENDING_SOURCE_VALIDATION',status:'PENDING_SOURCE_VALIDATION',
   department:'PRODUCTION',quantity:parsed.quantity,
   model:parsed.model,size:parsed.size,material:parsed.material,
   suppliedSalesOrderReference:parsed.orderRef,
   founderClaimedConfirmed:parsed.claimedConfirmed,
   salesOrderVerified:false,productionReleaseAuthorized:false,
   productionNotified:false,productionOrderCreated:false,
   source:'SIGNED_FOUNDER_SLACK_DM',createdAt:new Date(now()).toISOString()
  };
  try{
   const result=await env.VAOS_ARTIFACTS.put(INTAKE_PREFIX+requestId+'.json',JSON.stringify(record),{
    onlyIf:new Headers({'If-None-Match':'*'}),
    httpMetadata:{contentType:'application/json'}
   });
   if(result===null){duplicate=true;record=await readFounderProductionIntake(env,requestId);}
  }catch{return {status:'HOLD',actionAuthorized:false,answer:'Production intake storage failed. No production action was taken.'}}
 }
 if(!record)return {status:'HOLD',actionAuthorized:false,answer:'Production intake record not verified.'};
 const answer='Production intake '+requestId+' recorded for review: '+
  record.quantity+' '+(record.material||'unspecified material')+' '+
  (record.model||'unspecified model')+' '+(record.size?record.size+' frame':'unspecified frame size')+
  '. Status: PENDING_SOURCE_VALIDATION. Founder-described confirmed demand is not yet a verified sales order.'+
  ' No confirmed sales order, production job card, release or department notification was created.'+
  ' Authoritative demand reference and production validation remain required.';
 return {status:record.status,requestId,duplicate,actionAuthorized:false,
  orderCreated:false,productionNotified:false,answer};
}

export function isSlackContextFollowUp(text){
 return typeof text==='string'&&text.length<=120&&/^(?:and\s+)?(?:(?:what(?:'s| is)?|any|the|its|that|this|their|your)\s+)?(?:status|updates?|progress|what happened|more details|details)(?:\s+(?:of|about|on|for|now|yet|it|that|this|the above|them|the request|its|please|\?))*[?!. ]*$/i.test(text.trim());
}

function contextKey(context){
 return safeDM(context)?CONTEXT_PREFIX+context.channel+'.json':null;
}
export async function saveFounderSlackContext(env,context,{route,requestId=null,at=Date.now()}={}){
 const key=contextKey(context);
 if(!key||!['PRODUCTION','PEOPLE','PROCUREMENT','INVENTORY','FINANCE','PROJECT','COMMERCIAL','MAINTENANCE','CONFIGURATION'].includes(route)||!env?.VAOS_ARTIFACTS?.put)return false;
 const value={schemaVersion:'vaos.slack-context.v1',route,
  requestId:/^Ev[A-Za-z0-9_-]{4,80}$/.test(requestId||'')?requestId:null,
  at:Number.isFinite(at)?at:Date.now()};
 try{await env.VAOS_ARTIFACTS.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}});return true}
 catch{return false}
}
export async function readFounderSlackContext(env,context,now=Date.now()){
 const key=contextKey(context);
 if(!key||!env?.VAOS_ARTIFACTS?.get)return null;
 try{
  const object=await env.VAOS_ARTIFACTS.get(key);
  if(!object)return null;
  const v=JSON.parse(await object.text());
  if(v.schemaVersion!=='vaos.slack-context.v1'||!Number.isFinite(v.at)||now-v.at>DAY_MS||now<v.at)return null;
  if(!['PRODUCTION','PEOPLE','PROCUREMENT','INVENTORY','FINANCE','PROJECT','COMMERCIAL','MAINTENANCE','CONFIGURATION'].includes(v.route))return null;
  return {route:v.route,requestId:v.requestId||null};
 }catch{return null}
}
