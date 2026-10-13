/** Per-response model/rule disagreement record, not qualified agent voting.
 * Keep vetoes without retaining model prose or changing action permissions.
 */
const STATUSES=new Set(['NOT_MODEL_VERIFIED','CANDIDATE_REJECTED','BOUNDED_CONSISTENCY_PASS','REJECTED']);
const REASONS=new Set(['EVIDENCE_CONTRACT_UNVERIFIED','NUMERIC_CITATION_MISMATCH',
 'FINANCIAL_METRIC_UNQUALIFIED','UNQUALIFIED_CERTAINTY','METRIC_DOMAIN_MISMATCH',
 'DRAFT_VALIDATION_OR_PROVIDER_UNAVAILABLE']);
const DOMAINS=new Set(['COMMERCIAL','FINANCE','PROCUREMENT','INVENTORY','PRODUCTION','PEOPLE','ENGINEERING']);
const FINDINGS=Object.freeze({
 EVIDENCE_CONTRACT_UNVERIFIED:'evidence could not be verified',
 NUMERIC_CITATION_MISMATCH:'a number does not match its cited evidence',
 FINANCIAL_METRIC_UNQUALIFIED:'a financial figure lacks qualified evidence',
 UNQUALIFIED_CERTAINTY:'the proposal claims more certainty than the evidence supports',
 METRIC_DOMAIN_MISMATCH:'a figure was attributed to the wrong source domain',
 DRAFT_VALIDATION_OR_PROVIDER_UNAVAILABLE:'the proposal was invalid or the model was unavailable',
 REVIEW_CONTRACT_UNVERIFIED:'review metadata could not be verified'
});
export function reconcileJarvisReview({candidateObserved=false,verification={status:'NOT_MODEL_VERIFIED',reasons:[]},sourceHolds=[]}={}){
 const valid=Boolean(typeof candidateObserved==='boolean'&&verification&&typeof verification==='object'
  &&Object.keys(verification).sort().join(',')==='reasons,status'&&STATUSES.has(verification.status)
  &&Array.isArray(verification.reasons)&&verification.reasons.length<=6
  &&verification.reasons.every(x=>REASONS.has(x))
  &&new Set(verification.reasons).size===verification.reasons.length
  &&Array.isArray(sourceHolds)&&sourceHolds.length<=3&&sourceHolds.every(x=>DOMAINS.has(x))
  &&new Set(sourceHolds).size===sourceHolds.length
  &&(verification.status!=='BOUNDED_CONSISTENCY_PASS'||candidateObserved&&verification.reasons.length===0)
  &&(verification.status!=='NOT_MODEL_VERIFIED'||!candidateObserved&&verification.reasons.length===0)
  &&(verification.status!=='REJECTED'||candidateObserved)
  &&(!['REJECTED','CANDIDATE_REJECTED'].includes(verification.status)||verification.reasons.length>0));
 const rejected=valid&&verification.status==='REJECTED';
 const withheld=valid&&['REJECTED','CANDIDATE_REJECTED'].includes(verification.status);
 const reasons=valid?[...verification.reasons].sort():['REVIEW_CONTRACT_UNVERIFIED'];
 const domains=valid?[...sourceHolds].sort():[];
 return Object.freeze({schemaVersion:'JARVIS_REVIEW_RECONCILIATION_V1',
  status:!valid?'REVIEW_CONTRACT_HOLD':withheld?'PROPOSAL_WITHHELD':
   verification.status==='BOUNDED_CONSISTENCY_PASS'?'BOUNDED_CHECK_ONLY':'REVIEW_UNAVAILABLE',
  scope:'MODEL_PROPOSAL_AND_DETERMINISTIC_RULE_CHECK',
  proposalObserved:valid&&candidateObserved,
  proposalCheckerDisagreement:valid&&candidateObserved&&rejected,
  safetyVetoPresent:withheld||!valid,
  summary:withheld||!valid?'Proposal withheld: '+reasons.map(x=>FINDINGS[x]).join('; ')+'.':
   verification.status==='BOUNDED_CONSISTENCY_PASS'?'Bounded rule checks passed; qualified agent consensus remains unverified.':
    'No generated proposal was reviewed.',
  reviews:Object.freeze([
   Object.freeze({reviewer:'MODEL_PROPOSER',status:valid&&candidateObserved?'PROPOSED':'NO_ADMITTED_PROPOSAL'}),
   Object.freeze({reviewer:'DETERMINISTIC_CHECKER',status:valid?verification.status:'HOLD',reasonCodes:Object.freeze(reasons)})
  ]),
  unresolvedSourceDomains:Object.freeze(domains),
  unresolvedFindings:Object.freeze([...reasons,...domains.map(x=>x+'_SOURCE_HOLD'),'QUALIFIED_AGENT_CONSENSUS_REQUIRED']),
  majorityCanOverrideVeto:false,qualifiedAgentConsensus:false,independentAgentReviewsObserved:0,
  sourceCompletenessCertified:false,causalClaimsCertified:false,
  reviewRetention:'CURRENT_RESPONSE_ONLY',modelTextRetained:false,
  actionAuthorized:false,agentDispatchAuthorized:false,extraModelCalls:0,extraNetworkCalls:0});
}
