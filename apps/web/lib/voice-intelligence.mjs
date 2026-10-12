/** Authoritative read-only answer model for VAOS founder requests.
 * Never use repository metadata as a substitute for live business records.
 * Only bounded counts and states, no personal information or currency guesses.
 */
import {GROUP_DIVISIONS} from './group-portfolio.mjs';
const sensitive=/\\b(secret|token|password|credentials|api key|private key)\\b/i;
const criticalWrites=/\\b(approve|reject|execute|delete|transfer|dispatch|submit|authorize|authorise|activate|deactivate|override|merge|deploy|issue|write|post invoice|pay supplier)\\b/i;
const imperative=/^(?:please[ ,]+)?(?:create|change|edit|update|modify|post|purchase|pay|send|remove)\\b|\\b(?:can you|could you|please|i authorize you to|i want you to)[ ,]+(?:create|change|edit|update|modify|post|purchase|pay|send|remove)\\b/i;
const banned={test:q=>sensitive.test(q)||criticalWrites.test(q)||imperative.test(q)};
const checks=[
 {domain:'group',re:/\b(group|all divisions|across divisions|whole company|consolidat|v[aā]y[uū] shastr)\b/i},
 {domain:'missions',re:/\b(mission|agent mission|task handoff|digital employee mission)\b/i},
 {domain:'crm',re:/\b(crm|conversion|prospect|customer follow.up|customer master|lead qualification|deal pipeline)\b/i},
 {domain:'finance',re:/\b(financ\w*|revenues?|profits?|losses|cash|ledger|expenses?|expenditures?|budgets?|invoices?|receivables?|payables?|money|payment status|journals?|bank|accounting)\b/i},
 {domain:'procurement',re:/\b(procure\w*|purchase orders?|material shortages?|shortages?|suppliers?|replenishment|material requirements?|supply chain)\b/i},
 {domain:'inventory',re:/\b(inventory|stock|warehouse|sku|on.hand|stocktaking|stores?)\b/i},
 {domain:'production',re:/\b(production|manufactur\w*|job cards?|wip|work in progress|shop floor|frame build|assembly)\b/i},
 {domain:'people',re:/\b(hr\b|human resources|payroll|headcount|workforce|personnel|attendance|employees?|staff|leave balances?)\b/i},
 {domain:'engineering',re:/\b(engineer\w*|configuration|change orders?|release gate|fea|quality design|design baselines?|geometry|composites?)\b/i},
 {domain:'maintenance',re:/\b(maintenance|equipment|machine|assets?|repair work order)\b/i},
 {domain:'project',re:/\b(project schedule|programme schedule|project milestone|project plan|programme tasks|project task)\b/i},
 {domain:'commercial',re:/\b(sales|customer orders?|orders?|sales pipeline|order pipeline|deliveries|quotations?)\b/i},
 {domain:'documentation',re:/\b(code|repository|github|source files?|documentation|readme|vibpe)\b/i},
];
export const VOICE_DOMAIN_ACTIONS=Object.freeze({
 commercial:'COMMERCIAL.OBSERVE_PIPELINE',
 finance:'FINANCE.OBSERVE_LEDGER',
 procurement:'PROCUREMENT.OBSERVE_SHORTAGE',
 inventory:'INVENTORY.OBSERVE_STOCK',
 production:'PRODUCTION.OBSERVE_WIP',
 people:'PEOPLE.OBSERVE_WORKFORCE',
 engineering:'ENGINEERING.OBSERVE_CONFIGURATION',
 maintenance:'MAINTENANCE.OBSERVE_ASSET',
});
export function resolveVoiceIntent(question){
 const q=typeof question==='string'?question.trim():'';
 if(q.length<5||q.length>300||banned.test(q))return {domain:'unsupported',reason:'BLOCKED_OR_UNBOUNDED'};
 // A request for revenue/profit takes precedence over the group selector;
 // financial consolidation is still a HOLD even if a single ledger is readable.
 if(/\b(group|all divisions|across divisions|whole company|consolidat)\b/i.test(q))
  return {domain:'group',reason:'GROUP_SCOPE'};
 for(const item of checks){
  if(item.re.test(q))return {domain:item.domain,reason:'DOMAIN_MATCH'};
 }
 return {domain:'unsupported',reason:'NO_QUALIFIED_SOURCE'};
}
const n=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const recordRows=(data,key='records')=>{
 const records=data?.[key];
 if(!Array.isArray(records)||records.length>100
  ||records.some(x=>!x||typeof x!=='object'||Array.isArray(x)))
  throw Error('SOURCE_SCHEMA_UNVERIFIED');
 return records;
};
const label=(n,thing)=>n+' '+thing+(n===1?'':'s');
const notes=' These are bounded observations, not a completeness certificate or statutory audit.';
export function interpretVoiceRecords(domain,data,{limit=100}={}){
 if(!VOICE_DOMAIN_ACTIONS[domain])throw Error('SOURCE_SCHEMA_UNVERIFIED');
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('SOURCE_SCHEMA_UNVERIFIED');
 let answer='',count=0;
 const prefix='Authorized VYNDI OS source: ';
 const partial=' The source read covers up to '+limit+' most recent or selected rows; additional records may exist.';
 if(domain==='commercial'){
  const records=recordRows(data);count=records.length;
  const statuses=new Map();let committedUnits=0;
  for(const row of records){
   if(typeof row.status!=='string'||row.status.length>50||n(Number(row.units))===null)throw Error('SOURCE_SCHEMA_UNVERIFIED');
   const status=row.status.toLowerCase();statuses.set(status,(statuses.get(status)||0)+1);
   if(status==='confirmed')committedUnits+=Number(row.units);
  }
  const ordered=['lead','confirmed','delivered','cancelled'];
  answer=prefix+label(count,'sales order')+' observed. '+ordered.map(x=>label(statuses.get(x)||0,x+' order')).join('; ')
    +'. '+committedUnits+' ordered units on confirmed orders.'
    +' These are sales orders, not CRM customer conversions, collected cash or recognized revenue.'+partial;
 }else if(domain==='finance'){
  const ledger=recordRows(data,'ledger'),journals=recordRows(data,'journals');
  count=ledger.length+journals.length;
  answer=prefix+label(ledger.length,'general-ledger entry')+' and '+label(journals.length,'journal')+' observed.'
   +' The bridge does not provide a qualified cash balance, revenue summary, overdue invoices, budget variance, or profit calculation.'
   +' No financial amount can be inferred from the number of entries.'+partial;
 }else if(domain==='people'){
  const people=recordRows(data,'people'),authority=recordRows(data,'authority');
  count=people.length;
  answer=prefix+label(people.length,'personnel record')+' and '+label(authority.length,'people-office authority row')+' observed.'
   +' These counts are not verified active headcount or payroll-readiness approvals. Individual staff information is withheld.'+partial;
 }else if(domain==='engineering'){
  const changes=recordRows(data,'changeOrders'),baselines=recordRows(data,'baselines');
  count=changes.length+baselines.length;
  answer=prefix+label(changes.length,'engineering change order')+' and '+label(baselines.length,'engineering baseline')+' observed.'
   +' An entry is not proof of technical validation, production release or design authority closure.'+partial;
 }else if(domain==='maintenance'){
  const equipment=recordRows(data,'equipment'),orders=recordRows(data,'workOrders');
  count=orders.length;
  answer=prefix+label(equipment.length,'equipment record')+' and '+label(orders.length,'maintenance work order')+' observed.'
   +' This does not independently verify asset serviceability or release-to-service status.'+partial;
 }else{
  const records=recordRows(data);count=records.length;
  const metric={procurement:'material shortage line',inventory:'inventory-balance record',production:'production job card'}[domain];
  answer=prefix+(count?label(count,metric)+' observed.':'No matching source rows returned for '+metric+'. This is not proof of no risk.')
    +(domain==='procurement'?' These are shortage lines, not a verified total quantity of interchangeable material units.':
      domain==='inventory'?' Stock records may have different units and reservations; no total stock quantity or valuation is inferred.':
      ' Job cards represent recorded work and not accepted finished goods.')+partial;
 }
 return {status:'OBSERVED',answer:answer+notes,sourceSystem:'VYNDI_OS',sourceAuthority:VOICE_DOMAIN_ACTIONS[domain],recordsObserved:count};
}
export function formatVoiceAnswer(intent,result){
 if(intent.domain==='unsupported')
  return {status:'HOLD',answer:'That request does not match a commissioned read-only VAOS source. Try sales orders, inventory, production, material shortages, finance journals, HR records, engineering changes or a specific mission.'};
 if(intent.domain==='crm')
  return {status:'HOLD',answer:'CRM customer and lead-conversion records are not currently exposed through the qualified VAOS signed read bridge. Sales orders are available separately, but must not be presented as CRM conversion.'};
 if(intent.domain==='group')
  return {status:'HOLD',answer:'The Vāyú Shastr portfolio defines '+GROUP_DIVISIONS.length+' management divisions. However division attribution, elimination of internal transfers and a qualified group balance are still incomplete. Group revenue, cash, profit and forecasts cannot yet be certified. Open Group Overview for source connection health.'};
 if(intent.domain==='project')
  return {status:'HOLD',answer:'The project schedule requires an identified approved program ID. No project was specified; I cannot infer a programme-wide schedule from unrelated records. Open Projects or provide the exact program ID.'};
 if(intent.domain==='missions')
  return {status:'HOLD',answer:'Mission status requires a verified mission identifier or a qualified runnable-mission observation. Open Mission Tracking to identify it; a generic project excerpt is not an authoritative mission status.'};
 if(intent.domain==='documentation')return {status:'HOLD',answer:'Engineering and software documentation must be retrieved from cited sources; a repository excerpt is not an authoritative live-business observation.'};
 if(!result||result.status!=='OBSERVED')return {status:'HOLD',answer:'The '+intent.domain+' authoritative source is unavailable or its response could not be verified. No numbers or status can be asserted.'};
 return {status:'OBSERVED',answer:result.answer,sourceAuthority:result.sourceAuthority,sourceSystem:'VYNDI_OS',recordsObserved:result.recordsObserved};
}
