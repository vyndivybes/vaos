// Only independently produced audit evidence can qualify a Zapier run.
// This read-only module never sends a hook, replays an event or promotes a Zap.
const PREFIX='qualification/zapier/';
const HOLD=(reason='ZAPIER_READBACK_REQUIRED',ack=false)=>({
 status:'HOLD',reason,provider:'zapier',acknowledgmentVerified:ack,
 independentReadbackVerified:false,productionActivation:false,actionAuthorized:false,
 answer:'VAOS Zapier: HOLD ('+reason+'). Existing Catch Hook configuration and HTTP acceptance do not establish a successful Zap run or Slack delivery. Production execution remains disabled.'
});
export async function readZapierQualificationEvidence(env){
 const store=env?.VAOS_ARTIFACTS;
 if(!store?.list||!store?.get)return HOLD('ZAPIER_AUDIT_STORE_UNAVAILABLE');
 try{
  const listed=await store.list({prefix:PREFIX,limit:15});
  const keys=(listed?.objects||[]).map(x=>x.key).filter(x=>
   /^qualification\/zapier\/[a-f0-9-]{36}\.json$/.test(x)).slice(-15);
  if(keys.length===0)return HOLD('ZAPIER_QUALIFICATION_EVIDENCE_MISSING');
  // Never substitute our own dispatch acknowledgement for Zapier run-history
  // or the independent, matching Slack message readback.
  let acknowledged=false;
  for(const key of keys){
   const file=await store.get(key);
   if(!file)continue;
   let entry;try{entry=JSON.parse(await file.text())}catch{continue}
   if(entry?.providerId==='zapier'&&entry.status==='ACKNOWLEDGED_UNVERIFIED'&&
      Number.isInteger(entry.providerStatus)&&entry.providerStatus>=200&&entry.providerStatus<300)
    acknowledged=true;
  }
  return HOLD(acknowledged?'ZAPIER_INDEPENDENT_EXECUTION_EVIDENCE_REQUIRED':'ZAPIER_SYNTHETIC_DELIVERY_UNVERIFIED',acknowledged);
 }catch{return HOLD('ZAPIER_AUDIT_READ_FAILED')}
}
