/**
 * A02: evidence-directed, bounded investigation plan over the existing A01
 * signed-read reconciliation and sanitized four-domain specialist findings.
 *
 * This planner cannot invoke models, access private raw rows, create missions,
 * assign employees, schedule work, modify source data or promote approval.
 * It produces deterministic owner/checker REVIEW tasks for a human workflow.
 */
import {prepareJarvisA02SourceReview} from './jarvis-a10-progression.mjs';

const SOURCES=Object.freeze([
 Object.freeze({kind:'inventory',owner:'inventory',verifier:'qa'}),
 Object.freeze({kind:'shortages',owner:'procurement',verifier:'qa'}),
 Object.freeze({kind:'purchaseOrders',owner:'procurement',verifier:'qa'}),
 Object.freeze({kind:'production',owner:'production',verifier:'qa'}),
 Object.freeze({kind:'engineering',owner:'engineering-configuration',verifier:'vibpe'})
]);
const SOURCE_ID=kind=>'A02-SOURCE-'+kind.toUpperCase();
const f=(severity,owner,verifier,dependencies,reviewCode)=>Object.freeze({
 severity,owner,verifier,dependencies,reviewCode
});
const FINDING_SPEC=Object.freeze({
 LEGACY_MIGRATION_BASELINES_UNVERIFIED:f('MEDIUM','engineering-configuration','vibpe',['engineering'],'RECONCILE_MIGRATION_PROVENANCE'),
 OBSERVED_JOB_BOM_REVISION_CONFLICT:f('HIGH','engineering-configuration','vibpe',['shortages','production','engineering'],'RECONCILE_EFFECTIVE_BOM_REVISION'),
 OBSERVED_SKU_UNIT_RELATION_UNRECONCILED:f('HIGH','inventory','qa',['shortages','inventory'],'VALIDATE_SKU_UNIT_MASTER_AND_RESERVATIONS'),
 RELEASED_ENGINEERING_BASELINES_WITHOUT_BOM:f('HIGH','engineering-configuration','vibpe',['engineering'],'RECONCILE_APPROVED_BOM_EFFECTIVITY'),
 PRODUCTION_RELEASE_APPROVAL_TIMESTAMP_UNOBSERVED:f('HIGH','production','qa',['production'],'VERIFY_EXISTING_APPROVAL_AUDIT_TRAIL'),
 CROSS_SOURCE_COMPARAND_FIELDS_MISSING:f('MEDIUM','procurement','qa',['shortages'],'VERIFY_ORIGINAL_RECORD_LINKAGE'),
 INVENTORY_SKU_NOT_IN_SAMPLE:f('MEDIUM','inventory','qa',['shortages','inventory'],'VERIFY_AUTHORITATIVE_STOCK_PAGINATION'),
 LINKED_JOB_CARD_NOT_IN_SAMPLE:f('MEDIUM','production','qa',['shortages','production'],'VERIFY_COMPLETE_JOB_CARD_LOOKUP')
});
const PRIORITY=Object.freeze({CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3});
const fail=code=>{throw Error(code);};
const holdReason=(a01,review,source)=>{
 const holds=[];
 if(a01.consistencyGate!=='PASS')holds.push('SOURCE_CONSISTENCY_HOLD');
 if(!source.workPackages.every(x=>x.independentlyQualified)||
    a01.businessSourceAuthorityVerified!==true||a01.independentBusinessFactsCertified!==true)
  holds.push('A01_SOURCE_AUTHORITY_HOLD');
 if(review.status!=='BOUNDED_EVIDENCE')holds.push('SPECIALIST_SOURCE_HOLD');
 else if(review.sourceRevisionVerified!==true||review.completeDatasetVerified!==true)
  holds.push('SPECIALIST_REVISION_HOLD');
 return holds;
};
function validateReview(review){
 if(!review||typeof review!=='object'||Array.isArray(review)||
   !['BOUNDED_EVIDENCE','SOURCE_HOLD','NOT_RUN_SOURCE_GATE_HOLD'].includes(review.status)||
   review.readOnly!==true||review.actionAuthorized!==false||
   review.productionWriteAuthorized!==false||review.aiModelInvocations!==0||
   !Array.isArray(review.findings)||review.findings.length>8)
  fail('A02_PLAN_REVIEW_INVALID');
 if(review.status!=='BOUNDED_EVIDENCE'&&review.findings.length)
  fail('A02_PLAN_REVIEW_INVALID');
 if(review.status==='BOUNDED_EVIDENCE'&&
   review.schemaVersion!=='VAOS_JARVIS_A01_SPECIALIST_REVIEW_V1')
  fail('A02_PLAN_REVIEW_INVALID');
 const seen=new Set();
 for(const finding of review.findings){
  const spec=FINDING_SPEC[finding?.code];
  if(!spec||seen.has(finding.code)||finding.severity!==spec.severity||
    !Number.isSafeInteger(finding.observedCount)||finding.observedCount<1||
    finding.observedCount>50)
    fail('A02_PLAN_FINDING_INVALID');
  seen.add(finding.code);
 }
}
const task=({id,code,owner,verifier,dependsOn=[],reviewCode,severity=null,observedCount=null,sourceEvidenceStatus})=>
 Object.freeze({
  id,code,owner,verifier,dependsOn:Object.freeze(dependsOn),
  reviewCode,severity,observedCount,...(sourceEvidenceStatus?{sourceEvidenceStatus}:{}),
  mode:'READ_ONLY_PREPARATION',status:'PROPOSAL_ONLY',
  readOnly:true,executionEnabled:false,approved:false,
  sourceRevisionCertified:false,independentReviewVerified:false,
  businessActionAuthorized:false
 });
/**
 * A stable dependency DAG. Source-review tasks always precede discrepancy
 * proposals and are never resolved from an unverified gateway receipt.
 */
export function planJarvisA02OperationalReview({a01,specialistReview}={}){
 const base=prepareJarvisA02SourceReview(a01);
 validateReview(specialistReview);
 const sourceWorkItems=SOURCES.map(({kind,owner,verifier})=>{
  const observed=base.workPackages.find(x=>x.sourceKind===kind);
  return task({
   id:SOURCE_ID(kind),code:'VERIFY_'+kind.toUpperCase()+'_AUTHORITY',
   owner,verifier,reviewCode:'CHECK_SOURCE_OF_RECORD_REVISION_COMPLETENESS_AND_LINEAGE',
   sourceEvidenceStatus:observed?.independentlyQualified===true?'CLAIMED_QUALIFIED_NEEDS_REVIEW':'UNVERIFIED'
  });
 });
 const holds=holdReason(a01,specialistReview,base);
 const admissible=a01.consistencyGate==='PASS'&&
  specialistReview.status==='BOUNDED_EVIDENCE';
 const selected=admissible?[...specialistReview.findings]:[];
 selected.sort((a,b)=>
  PRIORITY[a.severity]-PRIORITY[b.severity]||
  a.code.localeCompare(b.code,'en'));
 const investigationWorkItems=selected.map(x=>{
  const spec=FINDING_SPEC[x.code];
  return task({
   id:'A02-REVIEW-'+x.code,code:x.code,
   owner:spec.owner,verifier:spec.verifier,
   dependsOn:spec.dependencies.map(SOURCE_ID),
   reviewCode:spec.reviewCode,severity:spec.severity,observedCount:x.observedCount
  });
 });
 return Object.freeze({
  schemaVersion:'VAOS_JARVIS_A02_OPERATIONAL_REVIEW_PLAN_V1',
  mission:'JARVIS-A01',status:'PREPARE_ONLY',
  readiness:holds.length?'HOLD':'REVIEW_REQUIRED',
  holds:Object.freeze(holds),
  sourceWorkItems:Object.freeze(sourceWorkItems),
  investigationWorkItems:Object.freeze(investigationWorkItems),
  workItems:Object.freeze([...sourceWorkItems,...investigationWorkItems]),
  totalProposedReviews:sourceWorkItems.length+investigationWorkItems.length,
  operationalSourceCoverageCertified:false,
  independentCompletionCertified:false,businessImpactConfirmed:false,
  reviewerApprovalGranted:false,
  mode:'READ_ONLY_PREPARATION',
  modelCalls:0,agentDispatchAuthorized:false,
  productionWriteAuthorized:false,externalActionDispatched:false,
  automatedCorrectionsEnabled:false
 });
}
