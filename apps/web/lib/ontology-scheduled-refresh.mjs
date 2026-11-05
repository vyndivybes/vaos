/** Signed, bounded, fail-closed snapshot maintenance; never ERP execution or source certification. */
import {featureControl} from './feature-flags.mjs';
import {createSupabaseControlStore} from '../../../platform/persistence/supabase-store.mjs';
import {resolveDurableControlConfig} from './durable-control-provider.mjs';
import {createDurableReceiptIngestor} from '../../../platform/ontology/durable-receipt-ingestor.mjs';
import {ONTOLOGY_SOURCE_ACTIONS,createOntologySignedReader} from '../api/ontology-source-status.mjs';

export const ONTOLOGY_REFRESH_CRON='5,15,25,35,45,55 * * * *';
const minutes=new Set([5,15,25,35,45,55]);
const hold=reason=>({status:'HOLD',reason,readOnly:true,agentUsable:false,
 actionAuthorized:false,productionWriteAuthorized:false,sources:[]});

export async function runScheduledOntologyRefresh({
 env,scheduledTime,
 getStore=e=>createSupabaseControlStore(resolveDurableControlConfig(e)),
 getReader=createOntologySignedReader,
}={}){
 if(featureControl(env,'VAOS_ONTOLOGY_AUTO_REFRESH_CONTROL')!=='signed-readonly-v1')
  return {...hold('AUTO_REFRESH_DISABLED'),status:'DISABLED'};
 if(!Number.isSafeInteger(scheduledTime)||scheduledTime<0)
  return hold('SCHEDULE_INVALID');
 const minute=new Date(scheduledTime).getUTCMinutes();
 if(!minutes.has(minute))return hold('SCHEDULE_INVALID');

 // Two faster sources every ten minutes; PO every thirty. Never fetch a partial >100-row page.
 const kinds=minute===5||minute===35
  ? ['inventory','shortages','purchaseOrders']:['inventory','shortages'];
 let store,reader;
 try{store=getStore(env);reader=getReader(env,store);}
 catch{return hold('SIGNED_READER_UNAVAILABLE');}
 const ingestor=createDurableReceiptIngestor({
  enabled:true,writeReceipt:receipt=>store.ingestOntologySourceReceipt(receipt),
 });
 const sources=await Promise.all(kinds.map(async sourceKind=>{
  const expected=ONTOLOGY_SOURCE_ACTIONS[sourceKind];
  try{
   const observation=await reader.execute({
    id:crypto.randomUUID(),intentId:crypto.randomUUID(),
    actionType:expected.actionType,
    payload:{missionId:'ontology:scheduled-signed-read',limit:100},
   });
   const result=await ingestor.store(observation);
   return {sourceKind,status:result.status,
    ...(result.status==='HOLD'?{reason:result.reason}: {})};
  }catch{return {sourceKind,status:'HOLD',reason:'SIGNED_SOURCE_UNAVAILABLE'};}
 }));
 return {status:sources.every(x=>x.status==='SOURCE_UNVERIFIED')?'SOURCE_UNVERIFIED':'HOLD',
  sources,readOnly:true,agentUsable:false,actionAuthorized:false,productionWriteAuthorized:false};
}
