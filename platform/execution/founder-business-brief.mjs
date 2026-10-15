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

// Only validated, bounded operational fields may be exposed in a signed founder DM.
// Raw HR/supplier identifiers, contact details, free-text descriptions and notes
// never pass through to Slack. Unknown schemas are not silently treated as zero.
export function summarizeFounderPrivateDepartment(route,data,topic=''){
 if(route==='PROCUREMENT'&&topic==='SUPPLIER_DETAILS')
  return 'Supplier directory/details are not available from this bridge. The configured Procurement read covers material shortages, not supplier master/contact records.';
 const rows=Array.isArray(data)?data:Array.isArray(data?.records)?data.records:
  route==='PEOPLE'&&Array.isArray(data?.people)?data.people:null;
 if(!rows||rows.length>50||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))
  return 'VYNDI OS '+route+' data was read, but the detailed record schema is not qualified for a Slack summary. No quantities or records have been inferred.';
 const complete=data?.complete===true||data?.pagination?.hasMore===false;
 const extent=complete?'complete reported result':'possibly partial result';
 const statusCounts=new Map();
 for(const row of rows){
  const status=typeof row.status==='string'&&/^[a-zA-Z_ -]{1,32}$/.test(row.status)?row.status.toLowerCase():null;
  if(status)statusCounts.set(status,(statusCounts.get(status)||0)+1);
 }
 const groups=[...statusCounts].slice(0,8).map(([key,count])=>count+' '+key).join(', ');
 if(route==='PEOPLE')
  return 'People/HR: '+rows.length+' records in '+extent+
   (groups?'; recorded states: '+groups:'; personnel states were not qualified')+
   '. Employee names, payroll and personal information remain withheld. This is an operational snapshot, not an HR audit.';
 if(route==='PROCUREMENT'){
  const shortages=rows.slice(0,5).map(r=>{
   const sku=typeof r.sku==='string'&&/^[A-Za-z0-9_-]{2,50}$/.test(r.sku)?r.sku:null;
   const raw=Number(r.shortage_quantity);
   const quantity=r.shortage_quantity!==null&&r.shortage_quantity!==undefined&&Number.isFinite(raw)&&raw>0&&raw<1000000?raw:null;
   const unit=typeof r.unit==='string'&&/^[a-zA-Z0-9%/_-]{1,12}$/.test(r.unit)?r.unit:'units';
   if(!sku||quantity===null)return null;
   return sku+' — '+quantity+' '+unit;
  }).filter(Boolean);
  return 'Procurement: '+rows.length+' shortage rows in '+extent+
   (shortages.length?'. Listed: '+shortages.join('; '):'. Shortage values were not qualified')+
   '. This is not a supplier master or purchase-order authority. No purchase was authorized.';
 }
 if(route==='PRODUCTION'){
  const details=rows.slice(0,5).map(row=>{
   const id=[row.jobCardNumber,row.jobCardId,row.id].find(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{2,50}$/.test(v));
   const status=typeof row.status==='string'&&/^[a-zA-Z_ -]{1,32}$/.test(row.status)?row.status:'status unverified';
   const q=Number.isInteger(row.quantity)&&row.quantity>=0&&row.quantity<=100000?row.quantity:null;
   const model=typeof row.model==='string'&&/^[a-zA-Z0-9 _-]{2,50}$/.test(row.model)?row.model:null;
   const size=typeof row.size==='string'&&/^(XS|S|M|L|XL)$/i.test(row.size)?row.size:null;
   return (id||'unnumbered job')+' — '+status+(q===null?'':' — qty '+q)+
    (model?' — '+model:'')+(size?' '+size:'');
  });
  return 'Production: '+rows.length+' job cards in '+extent+
   (groups?'; states: '+groups:'')+
   (details.length?'. Listed: '+details.join('; '):'. No job cards in the reported result.')+
   '. No production release or inventory movement was authorized.';
 }
 return 'VAOS '+route+': '+rows.length+' verified-schema records in '+extent+
  (groups?'; states: '+groups:'')+
  '. Sensitive record details remain in VYNDI OS. No action was authorized.';
}

export async function readFounderBusinessDomain(route,env,{createReader=makeCommercialReader,privateDM=false,topic=''}={}){
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
  if(privateDM===true){
    return Object.freeze({route,status:'PASS',actionAuthorized:false,
      answer:summarizeFounderPrivateDepartment(route,result.data,topic)});
  }
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
