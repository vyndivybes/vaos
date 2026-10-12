/** VAOS bounded tool planner: capability discovery, not execution.
 * New domains require code review; arbitrary model tool names never execute.
 */
const ORDER=['finance','commercial','procurement','inventory','production','engineering','people'];
const RULES={
 finance:/\b(cash|funds?|liquidity|runway|cost|expense|budget|payable|financial|cash.flow)\b/i,
 commercial:/\b(sales|orders?|customers?|pipeline|demand|revenue)\b/i,
 procurement:/\b(suppliers?|vendors?|shortages?|procure|materials?|lead.times?|sourcing)\b/i,
 inventory:/\b(inventory|stock|warehouse|reservation|on.hand)\b/i,
 production:/\b(prototype|manufactur|build|production|capacity|job.cards?|shop.floor|assemble|yield)\b/i,
 engineering:/\b(geometry|engineer\w*|design|release|prototype|qualification|composite|structural|fea|readiness)\b/i,
 people:/\b(headcount|staff|workforce|skills|hiring|personnel)\b/i
};
const MUTATION=/\b(approve|authorize|authorise|purchase|pay|transfer|delete|deploy|merge|write|submit|dispatch|execute|post|create|modify|update|send)\b/i;
export function planAdaptiveReads(question){
 if(typeof question!=='string'||question.length<5||question.length>300||/[\x00-\x1f\x7f]/.test(question))
  return {state:'DENIED',domains:[],maxReads:4,mode:'BOUNDED_READ_ONLY',actionAuthorized:false};
 if(MUTATION.test(question))return {state:'DENIED',domains:[],maxReads:4,mode:'BOUNDED_READ_ONLY',actionAuthorized:false};
 const matched=ORDER.filter(domain=>RULES[domain].test(question));
 // A four-read upper bound protects latency, provider quotas and sensitive data.
 const domains=matched.slice(0,4);
 return {state:domains.length?'PLANNED':'UNSUPPORTED',domains,maxReads:4,
  mode:'BOUNDED_READ_ONLY',actionAuthorized:false,
  missingDomains:matched.slice(4)};
}
export function validateAdaptivePlan(candidate,{permitted=[]}={}){
 if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||
  Object.keys(candidate).sort().join(',')!=='domains,mode,reason'||
  candidate.mode!=='read'||!Array.isArray(candidate.domains)||
  !candidate.domains.length||candidate.domains.length>4||
  typeof candidate.reason!=='string'||candidate.reason.length>150||
  !Array.isArray(permitted)||candidate.domains.some(x=>!ORDER.includes(x)||!permitted.includes(x))||
  new Set(candidate.domains).size!==candidate.domains.length)
  throw Error('ADAPTIVE_PLAN_REJECTED');
 return {state:'PLANNED',domains:[...candidate.domains],mode:'BOUNDED_READ_ONLY',maxReads:4,
  actionAuthorized:false,reason:candidate.reason};
}
