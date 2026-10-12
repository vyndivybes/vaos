import {makeCommercialReader} from '../../apps/web/api/voice-commercial.mjs';
import {getVyndiBridgeRoute} from '../../packages/contracts/vyndi-write-bridge.mjs';

// These are the only VYNDI domain operations reachable from founder Slack.
// No write action, external automation, approval or financial posting is admissible.
const ACTION_BY_ROUTE=Object.freeze({
  PROJECT:'PROJECT.OBSERVE_SCHEDULE',
  PROCUREMENT:'PROCUREMENT.OBSERVE_SHORTAGE',
  INVENTORY:'INVENTORY.OBSERVE_STOCK',
  PRODUCTION:'PRODUCTION.OBSERVE_WIP',
  FINANCE:'FINANCE.OBSERVE_LEDGER',
  PEOPLE:'PEOPLE.OBSERVE_WORKFORCE',
  MAINTENANCE:'MAINTENANCE.OBSERVE_ASSET',
  CONFIGURATION:'ENGINEERING.OBSERVE_CONFIGURATION',
});
const EXECUTIVE_ROUTES=Object.freeze(['PROJECT','PROCUREMENT','PRODUCTION','FINANCE']);
function sourceError(){const e=new Error('BUSINESS_SOURCE_UNVERIFIED');e.code='BUSINESS_SOURCE_UNVERIFIED';e.retryable=false;return e;}

export async function readFounderBusinessDomain(route,env,{createReader=makeCommercialReader}={}){
  const actionType=ACTION_BY_ROUTE[route];
  if(!actionType)throw sourceError();
  const registered=getVyndiBridgeRoute(actionType);
  if(registered?.effectClass!=='read'||registered.executionEnabled!==true)throw sourceError();
  const id=crypto.randomUUID();
  const intentId=crypto.randomUUID();
  const result=await createReader(env).execute({
    actionType,id:'slack-business-read:'+id,intentId:'slack-business-read:'+intentId,
    payload:{limit:50,missionId:'slack-founder-readonly'},
  });
  if(result?.actionType!==actionType||result?.sourceAuthority!==registered.authority
    ||!result.data||typeof result.data!=='object')throw sourceError();
  // #vaos-ops is a public workspace channel. No source records, financial values,
  // PII, supplier names, or raw model output may be sent there.
  return Object.freeze({
    route,status:'PASS',actionAuthorized:false,
    answer:'VAOS '+route+' signed read-only observation: source '+registered.authority+
      ' responded through the VYNDI OS authority bridge. Records and sensitive figures are withheld from this public Slack channel. '+
      'This verifies read connectivity only; it is not an audit, release, purchase, payment, or business-write authorization.',
  });
}

export async function readFounderExecutiveBrief(env,{createReader=makeCommercialReader}={}){
  // Bound to four reads per explicit request. A failed domain cannot erase the
  // evidence of the others; errors and provider payloads are never published.
  const outcomes=await Promise.all(EXECUTIVE_ROUTES.map(async route=>{
    try{const r=await readFounderBusinessDomain(route,env,{createReader});
      return {route,status:r.status};
    }catch{return {route,status:'HOLD'};}
  }));
  const complete=outcomes.every(x=>x.status==='PASS');
  return Object.freeze({
    route:'EXECUTIVE',status:complete?'PASS':'HOLD',actionAuthorized:false,
    answer:'VAOS executive connectivity brief (read-only): '+
      outcomes.map(x=>x.route+' '+x.status).join('; ')+
      '. This confirms source connectivity, not business accuracy. '+
      'Sensitive records remain in their authoritative systems. No releases, approvals, invoices, payments or production writes were initiated.',
  });
}
