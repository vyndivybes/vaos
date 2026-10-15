/** Authoritative read-only answer model for VAOS founder requests.
 * Never use repository metadata as a substitute for live business records.
 * Only bounded counts and states, no personal information or currency guesses.
 */
import {GROUP_DIVISIONS} from './group-portfolio.mjs';
const sensitive=/\b(secret|token|password|credentials|api key|private key)\b/i;
const criticalWrites=/\b(approve|reject|execute|delete|transfer|dispatch|submit|authorize|authorise|activate|deactivate|override|merge|deploy|issue|write|post invoice|pay supplier)\b/i;
const imperative=/^(?:please[ ,]+)?(?:create|change|edit|update|modify|post|purchase|pay|send|remove)\b|\b(?:can you|could you|please|i authorize you to|i want you to)[ ,]+(?:create|change|edit|update|modify|post|purchase|pay|send|remove)\b/i;
const banned={test:q=>sensitive.test(q)||criticalWrites.test(q)||imperative.test(q)||/^\s*(?:please\s+)?release\s+(?:production|the build|the frameset)(?:\s+now)?[.!?]?\s*$/i.test(q)};

// Read-only explanations about governed authority are NOT approval requests.
// Do not let a question-word disguise an instruction to perform an action.
export function isGovernanceExplanation(question){
 const q=typeof question==='string'?question.trim():'';
 return q.length>=10&&q.length<=300
  &&/\b(?:can|could|may|are|is|what|why|how|whether|explain)\b/i.test(q)
  &&/\b(?:approve|authori[sz]e|release|payment|pay|procure|purchase|dispatch|execute)\b/i.test(q)
  &&/\b(?:explain|limit(?:ation)?s?|authorit(?:y|ies)|permissions?|allowed|permitted|by yourself|without a bom|without an approved bom)\b/i.test(q)
  &&!/\b(?:do it|now|go ahead|please approve|please pay|actually approve|proceed with payment|execute the payment|i authorize|make the payment)\b/i.test(q);
}
// Browser speech recognition can render "Toray prepreg" as "Torah pre-break".
// The paired phonetic terms are a bounded engineering alias, never a general
// match for "Torah" or an authorization to make production changes.
const PREPREG_SPEECH_ALIAS=/\b(?:toray|torah)\s+pre[-\s]?(?:preg|break|brake)\b/i;
export function isEngineeringAuthorityQuestion(question){
 return typeof question==='string'&&(
  PREPREG_SPEECH_ALIAS.test(question)
  ||/\b(?:toray|prepreg|carbon (?:fiber|fibre|composite)|vedm|frameset|laminate|tsai.wu|hashin|engineering validation|engineering readiness|geometry revision)\b/i.test(question)
  ||/\b(?:manufacturing|production|released|approved)\s+(?:bom|bill of materials)\b/i.test(question)
  ||/\b(?:procurement|purchase|production)\b.{0,75}\b(?:without|before)\b.{0,45}\b(?:bom|engineering release)\b/i.test(question)
  ||/\b(?:bom|bill of materials)\b.{0,65}\b(?:procurement|release|manufactur)/i.test(question)
 );
}
export function isMissionRecoveryQuestion(question){
 return typeof question==='string'&&(
  /\b(?:handoffs?|mission|departmental tasks?)\b.{0,150}\b(?:interrupt(?:ed|ion)?|recover(?:ed|y)?|restart|resume|saved report)\b/i.test(question)
  ||/\b(?:recover|restart|resume)\b.{0,150}\b(?:handoffs?|mission|departmental tasks?|saved reports?)\b/i.test(question)
 );
}

const checks=[
 {domain:'group',re:/\b(group|all divisions|across divisions|whole company|consolidat|v[aā]y[uū] shastr)\b/i},
 {domain:'missions',re:/\b(missions?|agent missions?|task handoffs?|digital employee missions?)\b/i},
 {domain:'crm',re:/\b(crm|conversion|prospect|customer follow.up|customer master|lead qualification|deal pipeline)\b/i},
 {domain:'finance',re:/\b(financ\w*|revenues?|profits?|losses|cash|ledger|expenses?|expenditures?|budgets?|invoices?|receivables?|payables?|money|payment status|journals?|bank|accounting)\b/i},
 {domain:'procurement',re:/\b(procure\w*|purchase orders?|material shortages?|shortages?|suppliers?|replenishment|material requirements?|supply chain)\b/i},
 {domain:'inventory',re:/\b(inventory|stock|warehouse|sku|on.hand|stocktaking|stores?)\b/i},
 {domain:'production',re:/\b(production|manufactur\w*|job cards?|wip|work in progress|shop floor|frame build|assembly)\b/i},
 {domain:'people',re:/\b(hr\b|human resources|payroll|headcount|workforce|personnel|people|attendance|employees?|staff|leave balances?)\b/i},
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
 if(q.length<5||q.length>300||sensitive.test(q))return {domain:'unsupported',reason:'BLOCKED_OR_UNBOUNDED'};
 if(isEngineeringAuthorityQuestion(q)&&(!banned.test(q)||isGovernanceExplanation(q)))
  return {domain:'engineering',reason:'CONTROLLED_ENGINEERING_AUTHORITY'};
 if(isGovernanceExplanation(q))return {domain:'governance',reason:'READ_ONLY_AUTHORITY_EXPLANATION'};
 if(banned.test(q))return {domain:'unsupported',reason:'BLOCKED_OR_UNBOUNDED'};
 // Exact social turns have no business source and must not trigger a lookup.
 // Anchoring prevents a greeting from swallowing a following business request.
 if(/^(?:(?:hey|hello|hi|good morning|good afternoon|good evening)[\s,!.-]+)?(?:jarvis|vaos)[.!?\s]*$/i.test(q)
   ||/^(?:hello|good morning|good afternoon|good evening)[.!?\s]*$/i.test(q))
  return {domain:'conversation',reason:'GREETING'};
 if(isMissionRecoveryQuestion(q))return {domain:'missions',reason:'MISSION_RECOVERY_EXPLANATION'};
 const native=[
  ['finance',/வரவு|செலவு|நிதி|பணம்|വരുമാനം|ചെലവ്|ധനം|वित्त|खर्च|पैसा|राजस्व/],
  ['procurement',/கொள்முதல்|சப்ளையர்|பொருள் பற்றாக்குறை|വാങ്ങൽ|വിതരണക്കാര|सप्लायर|खरीद|कमी/],
  ['inventory',/கையிருப்பு|சரக்கு|സ്റ്റോക്ക്|ഇൻവെന്ററി|स्टॉक|भंडार/],
  ['production',/உற்பத்தி|வேலை அட்டை|ഉൽപ്പാദനം|നിർമ്മാണം|उत्पादन|निर्माण/],
  ['engineering',/பொறியியல்|வடிவமைப்பு|എഞ്ചിനീയറിംഗ്|രൂപകൽപ്പന|इंजीनियरिंग|डिजाइन/],
  ['people',/ஊழியர்|பணியாளர்|ജീവനക്കാർ|ജീവനക്കാരൻ|कर्मचारी|वेतन/],
  ['commercial',/விற்பனை|வாடிக்கையாளர்|വിൽപ്പന|ഉപഭോക്താ|बिक्री|ग्राहक/],
  ['maintenance',/பராமரிப்பு|അറ്റകുറ്റ|പരിപാലനം|रखरखाव/],
 ];
 const match=native.find(([,pattern])=>pattern.test(q));if(match)return {domain:match[0],reason:'NATIVE_LANGUAGE_DOMAIN_MATCH'};
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
    +'. '+committedUnits+' ordered units on orders carrying recorded status "confirmed".'
    +' Status labels are not independently verified real customer transactions; records may be synthetic or prelaunch.'
    +' These are sales-order records, not evidence of collected cash or recognized revenue.'+partial;
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
   +' These counts are not verified active headcount or payroll-readiness approvals. Records may include synthetic or prelaunch entries. Individual staff information is withheld.'+partial;
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
    +(domain==='procurement'?' These are shortage lines, not confirmed shortages for approved builds or a verified total quantity of interchangeable material units. Records may be proposed or demonstration data.':
      domain==='inventory'?' Stock records may have different units and reservations; no total stock quantity or valuation is inferred.':
      ' Job cards are recorded entries, potentially planned or demonstration records; they are not proof of actual production or accepted finished goods.')+partial;
 }
 return {status:'OBSERVED',answer:answer+notes,sourceSystem:'VYNDI_OS',sourceAuthority:VOICE_DOMAIN_ACTIONS[domain],recordsObserved:count};
}
export function formatVoiceAnswer(intent,result){
 if(intent.domain==='unsupported')
  return {status:'HOLD',answer:'That request does not match a commissioned read-only VAOS source. Try sales orders, inventory, production, material shortages, finance journals, HR records, engineering changes or a specific mission.'};
 if(intent.domain==='crm')
  return {status:'HOLD',answer:'CRM customer and lead-conversion records are not currently exposed through the qualified VAOS signed read bridge. Sales orders are available separately, but must not be presented as CRM conversion.'};
 if(intent.domain==='group')
  return {status:'HOLD',answer:'The Vāyú Shastr portfolio defines '+GROUP_DIVISIONS.length+' management divisions. However division attribution, elimination of internal transfers and a qualified group balance are not yet consolidated. Group revenue, cash, profit and forecasts cannot yet be certified. Open Group Overview for source connection health.'};
 if(intent.domain==='project')
  return {status:'HOLD',answer:'The project schedule requires an identified approved program ID. No project was specified; I cannot infer a programme-wide schedule from unrelated records. Open Projects or provide the exact program ID.'};
 if(intent.domain==='missions')
  return {status:'HOLD',answer:'Mission status requires a verified mission identifier or a qualified runnable-mission observation. Open Mission Tracking to identify it; a generic project excerpt is not an authoritative mission status.'};
 if(intent.domain==='documentation')return {status:'HOLD',answer:'Engineering and software documentation must be retrieved from cited sources; a repository excerpt is not an authoritative live-business observation.'};
 if(!result||result.status!=='OBSERVED')return {status:'HOLD',answer:'The '+intent.domain+' authoritative source is unavailable or its response could not be verified. No numbers or status can be asserted.'};
 return {status:'OBSERVED',answer:result.answer,sourceAuthority:result.sourceAuthority,sourceSystem:'VYNDI_OS',recordsObserved:result.recordsObserved};
}
