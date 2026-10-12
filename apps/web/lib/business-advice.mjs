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
 const match=advisors.find(x=>x.re.test(question||''))||advisors[0];
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
 const observed=interpretVoiceRecords(domain,data,{limit:50});
 let confirmedUnits=null;
 if(domain==='commercial'){
  const rows=data.records;
  if(rows.every(x=>Number.isSafeInteger(Number(x.units))&&Number(x.units)>=0)){
   confirmedUnits=rows.filter(x=>String(x.status||'').toLowerCase()==='confirmed')
    .reduce((t,x)=>t+Number(x.units),0);
   if(!Number.isSafeInteger(confirmedUnits))confirmedUnits=null;
  }
 }
 return {recordsObserved:observed.recordsObserved,confirmedUnits,summary:observed.answer.slice(0,390)};
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
 const selected=advisors.find(x=>x.re.test(question||''))||advisors[0];
 const active=sources.filter(x=>x&&x.status==='OBSERVED'&&x.observation);
 const missing=sources.filter(x=>!x||x.status!=='OBSERVED').map(x=>x?.domain).filter(Boolean);
 const scenario=extractScenario(question);
 const summary=active.length?active.map(x=>x.domain+': '+String(x.observation.summary||'').slice(0,320)).join(' '):
  'No qualified live business observation was returned. I cannot assert current performance.';
 const [first,second]=alternatives[selected.domain]||alternatives.procurement;
 const parts=[
  'Business review (read-only): '+summary,
  'Suggested better approach: '+first+' Alternative: '+second,
 ];
 let forecastQualified=false;
 if(scenario.increasePct!==null){
  const base=sources.find(x=>x.domain==='commercial'&&x.status==='OBSERVED')?.observation?.confirmedUnits;
  if(Number.isSafeInteger(base)&&base>=0){
   const projected=+(base*(1+scenario.increasePct/100)).toFixed(2);
   parts.push('What-if scenario, not an approved forecast: '+base+' confirmed ordered units with '+scenario.increasePct+'% illustrative demand uplift imply '+projected+' units (illustrative only). Actual period, conversion, supply and capacity are unverified.');
  }else parts.push('What-if scenario cannot be quantified because qualified confirmed order-unit data is unavailable.');
 }else if(/\bforecast|predict|projection|next (?:six|6|three|3|twelve|12) months?\b/i.test(question||'')){
  parts.push('Forecast: I cannot verify a six-month forecast from bounded latest-row observations without time-series history, an approved baseline, capacity and scenario assumptions. Any number would be invented.');
 }
 if(missing.length)parts.push('Source gaps / HOLD: '+missing.join(', ')+'. No missing source is treated as an all-clear.');
 const webSources=Array.isArray(web)?web.filter(x=>x&&typeof x.title==='string'
  &&/^https:\/\/news\.google\.com\/rss\/articles\/[A-Za-z0-9_-]+/.test(x.url||'')).slice(0,3):[];
 if(webSources.length)parts.push('External web comparison: '+webSources.map((x,i)=>'['+(i+1)+'] '+x.title.slice(0,120)).join('; ')+'. These are headline-level context, not independently verified market facts. Independently verify the underlying publication before relying on it.');
 else if(/\bcompare|market|web|industry|benchmark|research online/i.test(question||''))
  parts.push('External web comparison: No independently qualifying current public sources were retrieved. Do not invent competitor prices or market benchmarks.');
 parts.push('Decision: Advisory recommendation only. Validate assumptions and source records before committing funds, hiring, procurement, capacity or engineering release. No business changes were made.');
 return {status:active.length?'OBSERVED':'HOLD',answer:parts.join(' '),
  sourceSystem:'BUSINESS_ADVISORY',advisoryOnly:true,readOnly:true,actionAuthorized:false,
  forecastQualified,scenario,sourceCoverage:{observed:active.length,requested:sources.length},
  webSources,webEvidenceClass:'UNVERIFIED_HEADLINE_CONTEXT',decision:'HUMAN_REVIEW_REQUIRED'};
}
