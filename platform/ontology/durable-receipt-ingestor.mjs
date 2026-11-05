/** No automatic production ingestion: explicit gate and trusted signed-client receipt only.
 * This prepares a call to a server-controlled service-role RPC; it never
 * supplies credentials or promotes source extracts to business authority. */
import {checkVyndiSourceReceipt} from '../execution/vyndi-source-receipt.mjs';
const MAP=Object.freeze({
 'INVENTORY.OBSERVE_STOCK':'inventory',
 'PROCUREMENT.OBSERVE_SHORTAGE':'shortages',
 'PROCUREMENT.OBSERVE_OPEN_POS':'purchaseOrders',
});
const HOLD=(reason)=>Object.freeze({status:'HOLD',reason,agentUsable:false,
 actionAuthorized:false,productionWriteAuthorized:false});
export function createDurableReceiptIngestor({writeReceipt,enabled=false}={}){
 return Object.freeze({
  async store(observation){
   if(enabled!==true)return HOLD('DURABLE_ONTOLOGY_INGEST_DISABLED');
   const kind=MAP[observation?.actionType];
   if(!kind||observation?.readOnly!==true||
     observation?.effectClass!=='read'||observation?.sourceReceiptChecked!==true||
     observation?.sourceCompletenessVerified!==false||
     observation?.data?.sourceKind!==kind||
     observation?.data?.complete!==true||observation?.data?.hasMore!==false)
    return HOLD('SOURCE_OBSERVATION_NOT_ADMISSIBLE');
   let checked;
   try{checked=await checkVyndiSourceReceipt(observation.actionType,observation.data);}
   catch{return HOLD('SOURCE_RECEIPT_HASH_OR_SCOPE_INVALID');}
   if(checked!==true)return HOLD('SOURCE_RECEIPT_NOT_VERIFIED');
   if(typeof writeReceipt!=='function')return HOLD('DURABLE_ONTOLOGY_STORE_UNAVAILABLE');
   try{
    const result=await writeReceipt(observation.data);
    if(result?.status!=='SOURCE_UNVERIFIED'||
       result?.durableReceiptStored!==true||
       result?.agentUsable!==false||
       result?.productionWriteAuthorized!==false||
       result?.sourceKind!==kind)
     return HOLD('DURABLE_ONTOLOGY_RECEIPT_NOT_CONFIRMED');
    return Object.freeze({status:'SOURCE_UNVERIFIED',sourceKind:kind,receiptId:result.receiptId,
     durableReceiptStored:true,sourceCompletenessVerified:false,
     agentUsable:false,actionAuthorized:false,productionWriteAuthorized:false});
   }catch{return HOLD('DURABLE_ONTOLOGY_STORE_FAILED');}
  },
 });
}
