/** Independent, deterministic assurance for Adaptive Intelligence v2.
 * No calls to a generative model, network or business-write surface.
 * A source count never certifies operating causality, cash or sales outcomes.
 */
import {ADAPTIVE_TOOLS} from './adaptive-intelligence.mjs';
const READS=new Set(ADAPTIVE_TOOLS);
const COMPLEMENTS=Object.freeze({
 PROCUREMENT:'INVENTORY', INVENTORY:'PROCUREMENT',
 PRODUCTION:'ENGINEERING', ENGINEERING:'PRODUCTION',
 FINANCE:'COMMERCIAL', COMMERCIAL:'FINANCE', PEOPLE:'PRODUCTION',
});
const NUMBER=/(?<![A-Za-z])\d+(?:[.,]\d+)*(?:%)?/g;
const MONEY=/(?:\b(?:revenue|profit|turnover|earnings|cash balance|cashflow|cash flow|financial gain|budget|expenditure|margin|loss)\b[^.!?]{0,65}\b\d+(?:[.,]\d+)*\s*(?:crore|lakhs?|rupees?|inr|%|million|billion)?\b)|(?:[₹$€£]\s*\d+)/i;
const CERTAINTY=/\b(?:guaranteed|proven|confirmed safe|no risk exists|will definitely|fully certified|independently proven|already approved)\b/i;

const QUANTITY='(?:\\d[\\d,.]*|one|two|three|four|five|six|seven|eight|nine|ten|forty[- ]seven)';
const counted=(metric)=>new RegExp('\\b'+QUANTITY+'(?:\\s+[A-Za-z-]+){0,5}\\s+'+metric+'\\b','i');
// Cross-domain substitution is not numeric grounding: finance row counts
// cannot become stock, shortages, or customer-order counts simply because
// the integer happens to be the same. This is intentionally conservative.
const COUNTED_METRICS=[
 {re:counted('(?:material\\s+)?shortage(?:s|\\s+lines?)?'),domain:'PROCUREMENT',source:/shortage/i},
 {re:counted('(?:confirmed\\s+)?(?:sales|customer)\\s+orders?'),domain:'COMMERCIAL',source:/orders?/i},
 {re:counted('(?:general[-\\s]ledger\\s+)?(?:entries|entry|journals?)'),domain:'FINANCE',source:/ledger|journal/i},
 {re:counted('(?:production\\s+)?job\\s+cards?'),domain:'PRODUCTION',source:/job card/i},
 {re:counted('(?:inventory|stock)\\s+(?:items|units|records)'),domain:'INVENTORY',source:/stock|inventory/i},
];


export function selectEvidenceGapRead({tools=[],observations=[]}={}){
 if(!Array.isArray(tools)||tools.length===0||tools.length>=3||
  tools.some(t=>!READS.has(t))||new Set(tools).size!==tools.length||
  !Array.isArray(observations)||observations.length!==tools.length||
  observations.some((row,i)=>row?.tool!==tools[i]||
   !['OBSERVED','HOLD'].includes(row?.status)))return null;
 for(const row of observations){
  if(row.status!=='HOLD')continue;
  const complement=COMPLEMENTS[row.tool];
  if(complement&&!tools.includes(complement))return complement;
 }
 return null;
}
const numbers=text=>(String(text).match(NUMBER)||[]);
export function independentlyCheckDraft(draft,observations){
 const reasons=[];
 const safeInput=Array.isArray(observations)&&observations.length<=3&&observations.every(x=>
  x&&READS.has(x.tool)&&['OBSERVED','HOLD'].includes(x.status)&&
  typeof x.summary==='string'&&x.summary.length<=650);
 const safeDraft=!!draft&&typeof draft.finding==='string'&&typeof draft.recommendation==='string'&&
  Array.isArray(draft.citations)&&draft.citations.length>=1&&draft.citations.length<=3&&
  draft.citations.every(i=>Number.isInteger(i)&&i>=1&&i<=observations?.length&&
   observations[i-1].status==='OBSERVED');
 if(!safeInput||!safeDraft){
  reasons.push('EVIDENCE_CONTRACT_UNVERIFIED');
 }else{
  const cited= draft.citations.map(i=>observations[i-1]);
  const available=new Set(cited.flatMap(x=>numbers(x.summary)));
  const prose=draft.finding+' '+draft.recommendation;
  if(numbers(prose).some(x=>!available.has(x)))reasons.push('NUMERIC_CITATION_MISMATCH');
  if(MONEY.test(prose))reasons.push('FINANCIAL_METRIC_UNQUALIFIED');
  if(CERTAINTY.test(prose))reasons.push('UNQUALIFIED_CERTAINTY');
  if(COUNTED_METRICS.some(metric=>metric.re.test(draft.finding)&&
      !cited.some(row=>row.tool===metric.domain&&metric.source.test(row.summary))))
    reasons.push('METRIC_DOMAIN_MISMATCH');
 }
 return {
  status:reasons.length?'REJECTED':'BOUNDED_CONSISTENCY_PASS',
  reasons,checkedCitations:safeDraft?[...draft.citations]:[],
  causalClaimsCertified:false,businessActionAuthorized:false,
  limitations:[
   'SELECTED_RECORDS_NOT_COMPLETE_HISTORY',
   'NO_INDEPENDENT_CAUSAL_VERIFICATION',
   ...(safeInput&&observations.some(x=>x.status==='HOLD')?['PARTIAL_SOURCE_COVERAGE']:[]),
  ],
 };
}
