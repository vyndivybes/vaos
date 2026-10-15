/** Source-bounded, read-only specialist scans for existing VAOS employees.
 * This is a transparent keyword inventory, NOT legal advice, regulatory
 * certification, a live website audit, business evidence or agent execution.
 * Input remains untrusted client-supplied excerpt text; no network or model.
 */
const RULES=Object.freeze({
 LEGAL:Object.freeze([
  ['Parties / agreement',/\b(parties|between|hereby agree|entered into)\b/i],
  ['Scope / deliverables',/\b(scope of work|deliverables|services to be provided|statement of work)\b/i],
  ['Payment / consideration',/\b(payment terms|fees|consideration|invoice|remuneration)\b/i],
  ['Confidentiality',/\b(confidential|non.disclosure|proprietary information)\b/i],
  ['Intellectual property',/\b(intellectual property|ownership of work|copyright|license grant)\b/i],
  ['Liability / indemnity',/\b(liability|indemnif|limitation of liability)\b/i],
  ['Term / termination',/\b(termination|terminate|expiry|expiration|term of agreement)\b/i],
  ['Dispute resolution',/\b(dispute resolution|arbitration|jurisdiction|mediation)\b/i],
  ['Governing law',/\b(governing law|laws of|governed by the laws)\b/i],
 ]),
 MARKETING:Object.freeze([
  ['Product / service claim',/\b(product|service|platform|bicycle|software|solution)\b/i],
  ['Audience',/\b(for (?:teams|businesses|riders|professionals|customers)|who it is for|target audience)\b/i],
  ['Value proposition',/\b(benefit|helps? you|save time|improv|advantage|performance)\b/i],
  ['Call to action',/\b(sign up|subscribe|contact us|book a demo|request a quote|shop now|learn more)\b/i],
  ['Proof / case studies',/\b(testimonial|case study|verified review|evidence|customer story)\b/i],
  ['Differentiation',/\b(unlike|competitor|differen|unique|compared to)\b/i],
  ['Pricing / offer',/\b(pricing|price|cost|offer|quotation)\b/i],
  ['Contact channel',/\b(contact|support@|sales@|phone|email us)\b/i],
 ]),
});
const OWNERS=Object.freeze({LEGAL:'risk',MARKETING:'commercial'});
export function reviewSpecialistExcerpt({domain,text}={}){
 if(!Object.hasOwn(RULES,domain)||typeof text!=='string'||text.length<60||text.length>12000||
  /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))throw Error('SPECIALIST_SOURCE_INVALID');
 const lines=text.split(/\r?\n/);
 const checks=RULES[domain].map(([topic,rule])=>{
  const idx=lines.findIndex(line=>rule.test(line));
  const located=idx!==-1;
  return Object.freeze({topic,status:located?'TERM_LOCATED':'NOT_LOCATED_IN_EXCERPT',
   ...(located?{line:idx+1,excerpt:lines[idx].trim().slice(0,220)}:{})});
 });
 return Object.freeze({
  schemaVersion:'VAOS_JARVIS_SPECIALIST_EXCERPT_V1',
  status:'PRELIMINARY_KEYWORD_REVIEW_ONLY',
  domain,ownerAgentId:OWNERS[domain],
  ownerAssigned:false,agentDispatched:false,
  sourceAuthority:'USER_UPLOADED_UNVERIFIED',
  evidenceScope:'SUBMITTED_EXCERPT_ONLY',sourceCompletenessVerified:false,
  sourceLineCount:lines.length,locatedCount:checks.filter(x=>x.status==='TERM_LOCATED').length,
  checks,score:null,legalAdviceProvided:false,regulatoryComplianceCertified:false,
  campaignPerformanceVerified:false,forecastQualified:false,actionAuthorized:false,stored:false,
  notice:domain==='LEGAL'
   ?'Possible contract terms located by keywords only. Missing matches do not prove an omitted clause. Applicability, enforceability and governing law require a qualified legal review.'
   :'Marketing text signals only. This is not a live website, SEO, conversion, competitor, traffic, CRM or campaign-performance audit; no outcome metrics have been inferred.'
 });
}
