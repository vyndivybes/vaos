/** Governed, read-only founder advisory. Deliberately does not turn row
 * counts into company-wide balances or six-month production forecasts.
 */
import {VOICE_DOMAIN_ACTIONS,interpretVoiceRecords} from './voice-intelligence.mjs';
export const ADVISORY_LANGUAGES=Object.freeze({
 en:{name:'English',speech:'en-IN',ai:null},
 ta:{name:'தமிழ்',speech:'ta-IN',ai:'tam_Taml'},
 ml:{name:'മലയാളം',speech:'ml-IN',ai:'mal_Mlym'},
 hi:{name:'हिन्दी',speech:'hi-IN',ai:'hin_Deva'},
});
const advisors=[
 {domain:'procurement',priority:['procurement','inventory','production'],re:/\b(procure|supply|supplier|purchase|shortage|material|vendor)/i},
 {domain:'commercial',priority:['commercial','production','inventory'],re:/\b(sales|orders?|customers?|demand|market|revenue|crm|pricing)/i},
 {domain:'finance',priority:['finance','commercial','procurement'],re:/\b(cash|budget|fund|profit|financ|expense|liquid|invoice)/i},
 {domain:'production',priority:['production','procurement','inventory'],re:/\b(production|manufactur|job cards?|capacity|quality|assembly)/i},
 {domain:'inventory',priority:['inventory','procurement','commercial'],re:/\b(inventory|stock|warehouse|turnover)/i},
 {domain:'people',priority:['people','production','finance'],re:/\b(hr|human resource|headcount|workforce|staff|payroll)/i},
];
const planning=/\b(plan|planning|forecast|predict|projection|scenario|what if|better way|optimis|optimiz|improv|recommend|advis|strategy|strategic|compare|benchmark|industry|market trend|business analysis|web research|research online)/i;
const deny=/\b(approve|reject|pay|transfer|execute|dispatch|submit|delete|deploy|authorize|authorise|secret|api key|password|token)\b/i;
export function isAdvisoryQuestion(q){return typeof q==='string'&&q.trim().length>=5&&q.length<=300&&planning.test(q)&&!deny.test(q);}
export function chooseAdviceSources(question){
 if(/\b(group|all divisions|whole company|business analysis|enterprise|company.wide)\b/i.test(question||''))
  return ['finance','commercial','procurement','production'].map(domain=>({domain,actionType:VOICE_DOMAIN_ACTIONS[domain]}));
 const match=/\b(manufactur|production|job cards?|capacity|assembly|shop floor)\b/i.test(question||'')
  ?advisors.find(x=>x.domain==='production')
  :advisors.find(x=>x.re.test(question||''))||advisors[0];
 return match.priority.map(domain=>({domain,actionType:VOICE_DOMAIN_ACTIONS[domain]}));
}
export function externalTopic(question){
 // A strict, public topic: never send founder questions, prices, project
 // names or any ERP data to unauthenticated internet services.
 if(/software|saas|agentic|erp|cloud|ai service/i.test(question||''))return 'India small business software market';
 return 'India bicycle manufacturing market';
}
export function extractScenario(q){
 const m=String(q||'').match(/(?:growth?|grows?|increas(?:e|es)|uplift|higher|rise)[^%\n]{0,28}?(\d{1,4})\s*%|(\d{1,4})\s*%[^.\n]{0,30}?(?:growth?|grows?|increas(?:e|es)|uplift|higher|rise)/i);
 const pct=Number(m?.[1]||m?.[2]);
 return {increasePct:Number.isInteger(pct)&&pct>0&&pct<=100?pct:null};
}
export function observeAdviceDomain(domain,data){
 if(!Object.hasOwn(VOICE_DOMAIN_ACTIONS,domain))throw Error('ADVISORY_SOURCE_INVALID');
 // Interpret validates the bounded signed contract before any summarization.
 const observed=interpretVoiceRecords(domain,data,{limit:50});
 let confirmedUnits=null,summary='',details={};
 const rows=observed.recordsObserved;
 if(domain==='commercial'){
  const records=data.records;
  if(records.every(x=>Number.isSafeInteger(Number(x.units))&&Number(x.units)>=0)){
   confirmedUnits=records.filter(x=>String(x.status||'').toLowerCase()==='confirmed')
    .reduce((t,x)=>t+Number(x.units),0);
   if(!Number.isSafeInteger(confirmedUnits))confirmedUnits=null;
  }
  const confirmed=records.filter(x=>String(x.status||'').toLowerCase()==='confirmed').length;
  summary=rows+' sales orders ('+confirmed+' confirmed); '+
   (confirmedUnits===null?'confirmed unit total unverified':confirmedUnits+' confirmed ordered units');
  details={confirmedOrders:confirmed};
 }else if(domain==='procurement')summary=rows+' shortage lines (material)';
 else if(domain==='production')summary=rows+' production job cards';
 else if(domain==='inventory')summary=rows+' inventory-balance records';
 else if(domain==='finance'){
  const ledger=data.ledger.length,journals=data.journals.length;
  summary=ledger+' general-ledger entries and '+journals+' journals';
 }else if(domain==='people')summary=rows+' HR personnel records (not verified active headcount)';
 else if(domain==='maintenance')summary=(data.workOrders?.length||0)+' maintenance work orders';
 else summary=rows+' verified '+domain+' records';
 return {recordsObserved:rows,confirmedUnits,summary,...details};
}
const alternatives={
 procurement:['First reconcile shortage lines against reserved stock and approved BOM requirements; prioritize materials blocking active job cards.','Then compare supplier lead time and qualification evidence before deciding whether to source alternatives.'],
 commercial:['First confirm which customer orders are genuinely committed before increasing capacity or purchasing stock.','Then compare demand assumptions against the controlled material and manufacturing plan.'],
 finance:['First reconcile journal postings and cash/bank evidence before forecasting runway or committing expenditure.','Then stress-test expenditure delays and payment timing against an approved opening cash position.'],
 production:['First reconcile open job cards against material availability and engineering release gates.','Then compare capacity or outsourcing scenarios only after yield, takt time and tooling readiness are verified.'],
 inventory:['First reconcile stock balances and reservations against production shortage demand.','Then test replenishment cadence and material aging before raising procurement requests.'],
 people:['First confirm role readiness and skills coverage for the approved production plan.','Then compare staff workload and qualification requirements before recommending additional hiring.'],
};
export function checkTranslation(original,translated){
 if(typeof original!=='string'||typeof translated!=='string'||translated.length<12||translated.length>3800
 ||/\b(approved and paid|certified for release|execute payment|automatic approval)\b/i.test(translated))return false;
 const numbers=s=>(s.match(/\d+(?:\.\d+)?/g)||[]).sort().join(',');
 return numbers(original)===numbers(translated);
}
export function buildAdvisoryReport({question,sources=[],web=[]}={}){
 const q=String(question||'');
 const group=/\b(group|all divisions|whole company|business analysis|enterprise|company.wide)\b/i.test(q);
 // Specific operating-domain terms win over generic "market" and "compare".
 const selected=/\b(manufactur|production|job cards?|capacity|assembly|shop floor)\b/i.test(q)?advisors.find(x=>x.domain==='production'):
  advisors.find(x=>x.re.test(q))||advisors[0];
 const active=sources.filter(x=>x&&x.status==='OBSERVED'&&x.observation);
 const missing=sources.filter(x=>!x||x.status!=='OBSERVED').map(x=>x?.domain).filter(Boolean);
 const byDomain=new Map(active.map(x=>[x.domain,x.observation]));
 const scenario=extractScenario(q);
 const evidence=active.slice(0,4).map(x=>String(x.observation.summary||'').slice(0,110))
  .filter(Boolean);
 const fallback='No qualified live business observation was returned. I cannot assert current performance.';
 const headline=group?'GROUP DECISION — Reconcile finances, operating constraints and division attribution before committing resources.':
  selected.domain==='procurement'?'PROCUREMENT PRIORITY — Clear production-critical shortage lines first.':
  selected.domain==='production'?'PRODUCTION PRIORITY — Confirm what blocks job cards before expanding capacity.':
  selected.domain==='commercial'?'SALES PRIORITY — Verify committed orders before raising production or inventory.':
  selected.domain==='finance'?'FINANCE PRIORITY — Reconcile cash evidence before committing spending.':
  selected.domain==='inventory'?'INVENTORY PRIORITY — Reconcile stock, reservations and actual shortages.':
  'HR PRIORITY — Verify workforce skills and approved staffing needs.';
 const [first,second]=group?[
  'Reconcile company-wide accounting and tag transactions, stock and jobs to the relevant division; rank material shortages by the job cards they block.',
  'Compare staffing, lead times, validated engineering release gates and capacity before adding expense or committing delivery dates.'
 ]:alternatives[selected.domain]||alternatives.procurement;
 const known=active.length?evidence.join('; ')+'.':fallback;
 const parts=['Business review (read-only)','DECISION — '+headline,
  'KEY EVIDENCE — '+known,'DO FIRST — '+first,'ALTERNATIVE — '+second];
 let forecastQualified=false;
 let scenarioSummary='';
 if(scenario.increasePct!==null){
  const base=byDomain.get('commercial')?.confirmedUnits;
  if(Number.isSafeInteger(base)&&base>=0){
   const projected=+(base*(1+scenario.increasePct/100)).toFixed(2);
   scenarioSummary=base+' confirmed ordered units with '+scenario.increasePct+
    '% growth imply '+projected+' units (illustrative only). Period, conversion, supply and capacity are unverified.';
   parts.push('WHAT-IF — What-if scenario, not an approved forecast: '+scenarioSummary);
  }else{
   scenarioSummary='What-if scenario cannot be quantified because qualified confirmed order-unit data is unavailable.';
   parts.push('WHAT-IF — '+scenarioSummary);
  }
 }else if(/\bforecast|predict|projection|next (?:six|6|three|3|twelve|12) months?\b/i.test(q)){
  scenarioSummary='I cannot verify a six-month forecast from bounded rows without period history, a baseline and verified capacity.';
  parts.push('FORECAST — '+scenarioSummary);
 }
 const webSources=Array.isArray(web)?web.filter(x=>x&&typeof x.title==='string'
  &&/^https:\/\/news\.google\.com\/rss\/articles\/[A-Za-z0-9_-]+/.test(x.url||'')).slice(0,3):[];
 const asksWeb=/\b(compare|market|web|industry|benchmark|research online)\b/i.test(q);
 if(webSources.length)
  parts.push('WEB CHECK — '+webSources.map((x,i)=>'['+(i+1)+'] '+x.title.slice(0,95)).join('; ')+
   '. Headline-level context only: independently verify underlying reports before comparing suppliers or prices.');
 else if(asksWeb)
  parts.push('WEB CHECK — No independently qualifying current public sources were retrieved. This is not a verified market comparison.');
 if(missing.length)parts.push('DATA GAPS / HOLD — '+missing.join(', ')+'. Unavailable sources do not imply zero risk.');
 const cautions=group?'Division attribution, internal-transfer elimination, cash, revenue and group profit remain unqualified.':
  selected.domain==='finance'?'Entry counts do not establish cash, revenue, profit or budget variance.':
  selected.domain==='procurement'?'Shortage lines are not distinct material quantities or confirmed production stoppages.':
  selected.domain==='production'?'Job-card counts do not establish finished output, capacity or release approval.':
  'Observed order, stock or headcount rows are not a complete audited total.';
 parts.push('LIMITS — '+cautions+' These are recent/selected records, not a certified forecast. Advisory only; no business changes made.');
 const spokenAnswer=(active.length?headline+' '+evidence.slice(0,2).join('; ')+'. ':'I cannot verify current business performance. ')+
  (scenarioSummary?scenarioSummary+' ':'')+'First step: '+first;
 return {status:active.length?'OBSERVED':'HOLD',answer:parts.join('\n\n'),
  spokenAnswer:spokenAnswer.slice(0,330),keyEvidence:evidence,decisionHeadline:headline,
  sourceSystem:'BUSINESS_ADVISORY',advisoryOnly:true,readOnly:true,actionAuthorized:false,
  forecastQualified,scenario,sourceCoverage:{observed:active.length,requested:sources.length},
  webSources,webEvidenceClass:'UNVERIFIED_HEADLINE_CONTEXT',decision:'HUMAN_REVIEW_REQUIRED'};
}
