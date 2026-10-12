// Bounded, founder-initiated Slack DM one-shot synthetic qualification.
// A separate signed Slack Events admission is the sole caller. No business data,
// approvals, provider replays, or production provider activation are allowed.
import {createZapierWebhookHandler} from '../../apps/web/api/zapier-webhook.mjs';
const MARKER='qualification/zapier/slack-one-shot-20261012-round3.json';
const ORIGIN='https://vaos.vayushastr.workers.dev';
const hold=(answer,ack=false)=>({
 status:'HOLD',acknowledgmentVerified:ack,independentReadbackVerified:false,
 productionActivation:false,actionAuthorized:false,answer
});
export async function runZapierOneShot(env,{send=fetch,id=()=>crypto.randomUUID(),now=()=>Date.now()}={}){
 if(env?.VAOS_ZAPIER_ONESHOT_CONTROL!=='approved-synthetic-v1')
   return hold('VAOS Zapier synthetic test: HOLD. One-shot qualification is disabled.');
 const store=env?.VAOS_ARTIFACTS;
 if(!store?.get||!store?.put||typeof env.ZAPIER_CATCH_HOOK_URL!=='string')
   return hold('VAOS Zapier synthetic test: HOLD. The hook or evidence store is not ready.');
 const handler=createZapierWebhookHandler({isMaker:()=>true,send,id});
 let check;
 try{check=await handler({method:'GET',headers:{},url:ORIGIN+'/api/zapier-webhook',env})}
 catch{return hold('VAOS Zapier synthetic test: HOLD. Hook preflight unavailable.')}
 if(check.status!==200||(await check.json())?.hookConfigured!==true)
   return hold('VAOS Zapier synthetic test: HOLD. The configured hook is not qualified.');
 try{
  if(await store.get(MARKER))
   return hold('VAOS Zapier synthetic test: HOLD. One-shot attempt already admitted; no retry. Review qualification evidence.');
  // Atomic If-None-Match admission prevents parallel Slack-event invocations.
  const admitted=await store.put(MARKER,JSON.stringify({
    schemaVersion:'vaos.zapier.slack-one-shot.v1',state:'ADMITTED',
    at:new Date(now()).toISOString(),actionAuthorized:false
  }),{onlyIf:new Headers({'If-None-Match':'*'}),httpMetadata:{contentType:'application/json'}});
  if(admitted===null)return hold('VAOS Zapier synthetic test: HOLD. One-shot attempt already admitted; no retry.');
 }catch{return hold('VAOS Zapier synthetic test: HOLD. Audit admission unavailable; no webhook sent.')}
 let result;
 try{
  const http=await handler({
    method:'POST',url:ORIGIN+'/api/zapier-webhook',
    headers:{origin:ORIGIN,'content-type':'application/json'},
    body:{confirm:'run-synthetic-zapier-once'},env
  });
  result=await http.json();
 }catch{result={reason:'ZAPIER_OUTCOME_UNKNOWN'}}
 const accepted=result?.acknowledgmentVerified===true;
 try{await store.put(MARKER,JSON.stringify({
  schemaVersion:'vaos.zapier.slack-one-shot.v1',state:'HOLD',
  providerAcknowledged:accepted,eventId:typeof result?.eventId==='string'?result.eventId:null,
  reason:typeof result?.reason==='string'&&/^ZAPIER_[A-Z_]+$|^INDEPENDENT_ZAPIER_READBACK_REQUIRED$/.test(result.reason)
    ?result.reason:'ZAPIER_OUTCOME_UNKNOWN',
  at:new Date(now()).toISOString(),actionAuthorized:false
 }),{httpMetadata:{contentType:'application/json'}})}catch{}
 const ident=typeof result?.eventId==='string'&&/^[a-f0-9-]{36}$/.test(result.eventId)
   ?' Event ID: '+result.eventId+'.':' No reliable event ID was returned.';
 const diagnostic=!accepted&&['NETWORK','TIMEOUT','OTHER'].includes(result?.transportFailureCode)?' Transport: '+result.transportFailureCode+'.':'';
 return hold('VAOS Zapier synthetic test: '+(accepted?'Catch Hook HTTP acknowledged':'delivery HOLD')+'.'+ident+diagnostic+
  ' Independent Zap History and matching Slack delivery are still REQUIRED before production qualification. No automated retry or business action was authorized.',accepted);
}
