/** Execute only the eight existing signed VYNDI read contracts for mission handoffs.
 * The returned receipt deliberately excludes source rows, staff records and financial values.
 */
import {makeCommercialReader} from '../api/voice-commercial.mjs';
import {VOICE_DOMAIN_ACTIONS,interpretVoiceRecords} from './voice-intelligence.mjs';
import {getVyndiBridgeRoute} from '../../../packages/contracts/vyndi-write-bridge.mjs';
import {checkVyndiSourceReceipt} from '../../../platform/execution/vyndi-source-receipt.mjs';

const DOMAIN_BY_ACTION = new Map(Object.entries(VOICE_DOMAIN_ACTIONS)
  .map(([domain,actionType])=>[actionType,domain]));
const PO_ACTION='PROCUREMENT.OBSERVE_OPEN_POS';
const RECEIPT_HEX=/^[a-f0-9]{64}$/i;
const NONCE_HEX=/^[a-f0-9]{32}$/i;

export function createMissionDepartmentReader({getReader=makeCommercialReader,now=()=>new Date()}={}){
 if(typeof getReader!=='function'||typeof now!=='function')throw Error('DEPARTMENT_READ_PORT_INVALID');
 return async function readDepartment({env,actionType,missionId,workPackageId,handoffId,handoffVersion}={}){
  const domain=DOMAIN_BY_ACTION.get(actionType);
  const route=getVyndiBridgeRoute(actionType);
  if((!domain&&actionType!==PO_ACTION)||route?.effectClass!=='read'||route.executionEnabled!==true
     ||route.employeeId===undefined||!Number.isInteger(handoffVersion)||handoffVersion<1
     ||typeof missionId!=='string'||!missionId||typeof handoffId!=='string'||!handoffId
     ||typeof workPackageId!=='string'||!workPackageId){
   throw Error('DEPARTMENT_READ_NOT_ALLOWED');
  }
  const key='vaos-mission-read:'+handoffId+':'+handoffVersion;
  const reader=getReader(env);
  if(typeof reader?.execute!=='function')throw Error('DEPARTMENT_READ_UNAVAILABLE');
  const result=await reader.execute({
   actionType,id:key,intentId:key,
   payload:{missionId,limit:50},
  });
  if(result?.actionType!==actionType||result?.sourceAuthority!==route.authority){
   throw Error('DEPARTMENT_READ_AUTHORITY_MISMATCH');
  }
  if(!NONCE_HEX.test(result.nonce||'')||!RECEIPT_HEX.test(result.bodySha256||'')){
   throw Error('DEPARTMENT_READ_RECEIPT_INVALID');
  }
  let recordsObserved;
  if(actionType===PO_ACTION){
   // The voice domain registry maps procurement to shortages, not purchase orders.
   // Validate the signed, complete PO content receipt instead of mislabelling PO rows.
   const data=result.data;
   if(result.readOnly!==true||result.effectClass!=='read'||
      result.sourceReceiptChecked!==true||result.sourceCompletenessVerified!==false||
      result.actionAuthorized!==false||result.productionWriteAuthorized!==false||
      data?.complete!==true||data?.hasMore!==false||
      !Array.isArray(data.records)||data.records.length>50||
      data.records.some(row=>!row||typeof row!=='object'||Array.isArray(row)||
        typeof row.id!=='string'||!row.id.trim()))
    throw Error('DEPARTMENT_READ_SOURCE_INVALID');
   let valid=false;
   try{valid=await checkVyndiSourceReceipt(actionType,data);}
   catch{throw Error('DEPARTMENT_READ_SOURCE_INVALID');}
   if(!valid)throw Error('DEPARTMENT_READ_SOURCE_INVALID');
   recordsObserved=data.sourceCount;
  }else{
   // Preserve existing departmental source interpretation for all original reads.
   const verified=interpretVoiceRecords(domain,result.data,{limit:50});
   if(verified.status!=='OBSERVED'||!Number.isSafeInteger(verified.recordsObserved)
       ||verified.recordsObserved<0||verified.recordsObserved>100)
    throw Error('DEPARTMENT_READ_SOURCE_INVALID');
   recordsObserved=verified.recordsObserved;
  }
  const received=now();
  if(!(received instanceof Date)||!Number.isFinite(received.valueOf()))throw Error('DEPARTMENT_READ_CLOCK_INVALID');
  return Object.freeze({
   status:'OBSERVED',
   sourceAuthority:route.authority,
   recordsObserved,
   requestNonce:result.nonce,
   requestBodySha256:result.bodySha256,
   gatewayReceivedAt:received.toISOString(),
  });
 };
}

export const readMissionDepartment=createMissionDepartmentReader();
