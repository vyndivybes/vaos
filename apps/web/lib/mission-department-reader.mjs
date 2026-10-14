/** Execute only the eight existing signed VYNDI read contracts for mission handoffs.
 * The returned receipt deliberately excludes source rows, staff records and financial values.
 */
import {makeCommercialReader} from '../api/voice-commercial.mjs';
import {VOICE_DOMAIN_ACTIONS,interpretVoiceRecords} from './voice-intelligence.mjs';
import {getVyndiBridgeRoute} from '../../../packages/contracts/vyndi-write-bridge.mjs';

const DOMAIN_BY_ACTION = new Map(Object.entries(VOICE_DOMAIN_ACTIONS)
  .map(([domain,actionType])=>[actionType,domain]));
const RECEIPT_HEX=/^[a-f0-9]{64}$/i;
const NONCE_HEX=/^[a-f0-9]{32}$/i;

export function createMissionDepartmentReader({getReader=makeCommercialReader,now=()=>new Date()}={}){
 if(typeof getReader!=='function'||typeof now!=='function')throw Error('DEPARTMENT_READ_PORT_INVALID');
 return async function readDepartment({env,actionType,missionId,workPackageId,handoffId,handoffVersion}={}){
  const domain=DOMAIN_BY_ACTION.get(actionType);
  const route=getVyndiBridgeRoute(actionType);
  if(!domain||route?.effectClass!=='read'||route.executionEnabled!==true
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
  // Shares the schema validator already used by VAOS Founder Data Agent and voice.
  const verified=interpretVoiceRecords(domain,result.data,{limit:50});
  if(verified.status!=='OBSERVED'||!Number.isSafeInteger(verified.recordsObserved)
      ||verified.recordsObserved<0||verified.recordsObserved>100){
   throw Error('DEPARTMENT_READ_SOURCE_INVALID');
  }
  const received=now();
  if(!(received instanceof Date)||!Number.isFinite(received.valueOf()))throw Error('DEPARTMENT_READ_CLOCK_INVALID');
  return Object.freeze({
   status:'OBSERVED',
   sourceAuthority:route.authority,
   recordsObserved:verified.recordsObserved,
   requestNonce:result.nonce,
   requestBodySha256:result.bodySha256,
   gatewayReceivedAt:received.toISOString(),
  });
 };
}

export const readMissionDepartment=createMissionDepartmentReader();
