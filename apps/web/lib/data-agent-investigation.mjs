/** Reuse G3.1E's bounded cross-source relations for founder explanations.
 * Server-only: raw identifiers and source records never enter the response.
 * A detected mismatch is an observed discrepancy, NOT proof of a delay cause.
 */
import {assessG3CrossSource} from '../../../intelligence/g3-cross-source-reconciliation.mjs';

const REQUIRED=['procurement','inventory','production','engineering'];
const findings=Object.freeze([
 {field:'legacyMigratedReleaseLabelsWithoutBom',code:'LEGACY_MIGRATION_BASELINES_UNVERIFIED',
  classification:'RECORDED_PROVENANCE_GAP',severity:'MEDIUM',title:'Three legacy migration baselines are not approved production releases',
  explanation:'The source marks these baselines released, but its cutover migration created and approved them automatically. No production BOM is linked. Their historical status must not be treated as genuine engineering release.',
  action:'Keep the system-migration baselines as prelaunch reference; prepare a controlled engineering revision and link a BOM only after actual approval and release.',
  sourceDomains:['engineering']},
 {field:'shortageRowsWithObservedJobBomConflict',code:'OBSERVED_JOB_BOM_REVISION_CONFLICT',
  classification:'OBSERVED_DISCREPANCY',severity:'HIGH',title:'Procurement and job-card BOM revisions disagree',
  explanation:'At least one selected shortage line and its observed linked job card reference different BOM revisions. This is a traceability conflict, not proof that the conflict delayed the build.',
  action:'Reconcile the shortage line against the job-card BOM revision and the approved engineering configuration before authorizing or scheduling a build.',
  sourceDomains:['procurement','production']},
 {field:'shortageRowsWithIncompatibleObservedInventoryUnit',code:'OBSERVED_SKU_UNIT_RELATION_UNRECONCILED',
  classification:'OBSERVED_DISCREPANCY',severity:'HIGH',title:'Stock and shortage units do not match',
  explanation:'The same SKU appears in shortage and inventory samples with different units. The quantities cannot be compared without an authoritative conversion and reservation basis.',
  action:'Check the SKU unit master, approved conversion, stock reservations and shortage calculation in VYNDI OS.',
  sourceDomains:['procurement','inventory']},
 {field:'releasedBaselinesWithoutBom',code:'RELEASED_ENGINEERING_BASELINES_WITHOUT_BOM',
  classification:'RECORDED_PROVENANCE_GAP',severity:'HIGH',title:'Released engineering baseline has no observed BOM reference',
  explanation:'A baseline marked released lacks a BOM revision reference in the returned engineering record; production readiness cannot be inferred from release status alone.',
  action:'Reconcile the released engineering baseline with the authoritative approved BOM revision and its effectivity record.',
  sourceDomains:['engineering']},
 {field:'productionReleasedCardsMissingApprovalTimestamp',code:'PRODUCTION_RELEASE_APPROVAL_TIMESTAMP_UNOBSERVED',
  classification:'RECORDED_PROVENANCE_GAP',severity:'HIGH',title:'Released job-card approval timestamp is missing',
  explanation:'The returned job-card release row does not contain a parseable approval timestamp. This does not prove that no approval happened.',
  action:'Check the immutable production approval trail and reconcile the released job card; retain the current approval state.',
  sourceDomains:['production']},
 {field:'shortageRowsNotComparable',code:'CROSS_SOURCE_COMPARAND_FIELDS_MISSING',
  classification:'MISSING_COMPARANDS',severity:'MEDIUM',title:'Shortage records lack keys needed for analysis',
  explanation:'Selected shortage lines do not contain all SKU, unit, sales-order and BOM revision references needed to relate them to stock and job cards.',
  action:'Complete or reconcile the existing shortage-line references; do not invent missing keys.',
  sourceDomains:['procurement']},
 {field:'shortageRowsWithoutObservedInventorySku',code:'INVENTORY_SKU_NOT_IN_SAMPLE',
  classification:'SAMPLE_COVERAGE_GAP',severity:'MEDIUM',title:'Shortage SKU not found in selected inventory records',
  explanation:'The inventory gateway sample does not show a corresponding SKU. This is not evidence of zero stock or a confirmed material absence.',
  action:'Inspect the authoritative inventory search and pagination for that SKU, then reconcile on-hand and reserved quantities.',
  sourceDomains:['procurement','inventory']},
 {field:'shortageRowsWithoutObservedLinkedJobCard',code:'LINKED_JOB_CARD_NOT_IN_SAMPLE',
  classification:'SAMPLE_COVERAGE_GAP',severity:'MEDIUM',title:'Linked production job card not found in selected rows',
  explanation:'A shortage line refers to a sales order with no matching job card in the selected production window. This does not prove no job card exists.',
  action:'Check the complete production job-card lookup and reconcile the sales-order linkage.',
  sourceDomains:['procurement','production']}
]);
const sourceObject=x=>x&&typeof x==='object'&&!Array.isArray(x);
const isLegacyMigrationRelease=row=>row?.status==='released'&&(!row?.bom_revision)&&(
 row?.release_disposition==='LEGACY_MIGRATION_UNVERIFIED'||row?.created_by==='system:migration'||
 row?.approved_by==='system:migration'||String(row?.source_ref||'').startsWith('CUTOVER:'));


/** Founder-declared company phase. Source records may still be proposed, demo or
 * actual: a gateway receipt does not establish their individual origin.
 */
const OPERATING_CONTEXT=Object.freeze({
 phase:'PRELAUNCH_CONFIGURATION',recordOrigin:'UNVERIFIED',
 actualProductionIncidentConfirmed:false,
 sourceRecordsCertifiedSynthetic:false,
 explanation:'Vāyū Shastr is preparing for launch. Existing VYNDI OS records have not been classified here as proposed, demonstration or actual operations; do not describe a finding as an active manufacturing incident.'
});
const REVIEW_PRIORITY=Object.freeze({
 OBSERVED_DISCREPANCY:'RECONCILE_SOURCE_CONFLICT',
 RECORDED_PROVENANCE_GAP:'COMPLETE_RELEASE_TRACE',
 MISSING_COMPARANDS:'COMPLETE_RECORD_LINKS',
 SAMPLE_COVERAGE_GAP:'CHECK_SOURCE_COVERAGE'
});
const PRIORITY_ORDER=['RECONCILE_SOURCE_CONFLICT','COMPLETE_RELEASE_TRACE',
 'COMPLETE_RECORD_LINKS','CHECK_SOURCE_COVERAGE'];
const PREPARATION_STEPS=Object.freeze({
 LEGACY_MIGRATION_BASELINES_UNVERIFIED:[
  'Preserve the three original migration entries and audit history; do not manufacture engineering approvals.',
  'Use the VEDM-controlled candidate geometry and materials as proposed engineering inputs, not a production release.',
  'Create a genuinely controlled revision and link a qualified BOM release only when approval, effectivity and configuration documents exist.'
 ],
 OBSERVED_JOB_BOM_REVISION_CONFLICT:[
  'Review the procurement shortage line and linked production job-card BOM revision in their existing departmental records.',
  'Compare both revisions against the VEDM proposal and the actual approved, effective engineering release; do not assume a proposed revision is released.',
  'If a real conflict remains, use the existing controlled engineering or production change process before scheduling a build.'
 ],
 OBSERVED_SKU_UNIT_RELATION_UNRECONCILED:[
  'Check the stock and shortage SKU entries in their existing departments and record their stated units.',
  'Locate the approved unit definition or conversion and any stock reservation before comparing quantities.',
  'Reconcile the configuration in the existing purchasing/inventory process; no automatic stock movement is authorized.'
 ],
 RELEASED_ENGINEERING_BASELINES_WITHOUT_BOM:[
  'Review the engineering baseline records labelled released and the linked BOM-revision fields in VYNDI OS.',
  'Compare the candidate design with VEDM proposed engineering data, but do not assume a VEDM proposal is an approved production BOM.',
  'If approval or effectivity is not evidenced, retain the baseline as draft/prelaunch rather than inventing a release; use the existing controlled revision process when actual approval exists.'
 ],
 PRODUCTION_RELEASE_APPROVAL_TIMESTAMP_UNOBSERVED:[
  'Review the existing job-card approval and release audit records in VYNDI OS.',
  'Check whether the job card is only a prelaunch example, a draft or an actually released record.',
  'Reconcile the approval evidence through the existing production revision process without fabricating an approval date.'
 ],
 CROSS_SOURCE_COMPARAND_FIELDS_MISSING:[
  'Inspect the selected shortage-line references in procurement.',
  'Find the original SKU, unit, sales-order and BOM links in the current VYNDI OS authority records.',
  'Complete only supported links through existing editing controls; do not invent missing reference values.'
 ],
 INVENTORY_SKU_NOT_IN_SAMPLE:[
  'Search the authoritative inventory view beyond the first selected rows.',
  'Check SKU aliases, reservations and on-hand balance using the existing inventory authority.',
  'Do not conclude stock is absent or place a purchase order from this bounded sample alone.'
 ],
 LINKED_JOB_CARD_NOT_IN_SAMPLE:[
  'Search for the linked sales order in the complete job-card list, not only the first selected rows.',
  'Reconcile observed sales-order links with the source production job-card revision.',
  'Keep the relationship unresolved when a job card cannot be established; do not create a replacement automatically.'
 ]
});
const normalized=v=>typeof v==='string'&&v.trim()?v.trim().toUpperCase():null;
const ref=(domain,collection,position)=>({domain,collection,position});
/** Anonymous, request-local source positions only. Positions are NOT IDs or
 * durable links and must never carry SKU, order, BOM or pricing values. */
function buildSampleEvidence(data){
 const shortages=data.PROCUREMENT.records,stock=data.INVENTORY.records,
  jobs=data.PRODUCTION.records,baselines=data.ENGINEERING.baselines;
 const trails=Object.fromEntries(findings.map(f=>[f.code,[]]));
 const emit=(code,rows)=>{
  if(trails[code].length<5)
   trails[code].push({rows,sampleOnly:true,permanentRecordLink:false});
 };
 const stockBySku=new Map(),jobsByOrder=new Map();
 stock.forEach((row,i)=>{
  const sku=normalized(row?.sku);
  if(!sku)return;
  if(!stockBySku.has(sku))stockBySku.set(sku,[]);
  stockBySku.get(sku).push({index:i+1,unit:normalized(row?.unit)});
 });
 jobs.forEach((row,i)=>{
  const order=normalized(row?.sales_order_id);
  if(!order)return;
  if(!jobsByOrder.has(order))jobsByOrder.set(order,[]);
  jobsByOrder.get(order).push({index:i+1,bom:normalized(row?.bom_revision)});
 });
 shortages.forEach((row,i)=>{
  const sku=normalized(row?.sku),unit=normalized(row?.unit),
   order=normalized(row?.sales_order_id),bom=normalized(row?.bom_revision);
  const p=ref('procurement','records',i+1);
  if(!sku||!unit||!order||!bom){
   emit('CROSS_SOURCE_COMPARAND_FIELDS_MISSING',[p]);return;
  }
  const observedStock=stockBySku.get(sku);
  if(!observedStock)emit('INVENTORY_SKU_NOT_IN_SAMPLE',[p]);
  else if(!observedStock.some(x=>x.unit===unit)){
   const candidate=observedStock.find(x=>x.unit!==null);
   if(candidate)emit('OBSERVED_SKU_UNIT_RELATION_UNRECONCILED',
    [p,ref('inventory','records',candidate.index)]);
  }
  const linkedJobs=jobsByOrder.get(order);
  if(!linkedJobs)emit('LINKED_JOB_CARD_NOT_IN_SAMPLE',[p]);
  else if(linkedJobs.some(x=>x.bom!==null)&&!linkedJobs.some(x=>x.bom===bom)){
   const candidate=linkedJobs.find(x=>x.bom!==null);
   if(candidate)emit('OBSERVED_JOB_BOM_REVISION_CONFLICT',
    [p,ref('production','records',candidate.index)]);
  }
 });
 baselines.forEach((row,i)=>{
  if(row?.status==='released'&&!normalized(row?.bom_revision))
   emit(isLegacyMigrationRelease(row)?'LEGACY_MIGRATION_BASELINES_UNVERIFIED':
    'RELEASED_ENGINEERING_BASELINES_WITHOUT_BOM',
    [ref('engineering','baselines',i+1)]);
 });
 jobs.forEach((row,i)=>{
  const ok=typeof row?.approved_at==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(row.approved_at)&&
   Number.isFinite(Date.parse(row.approved_at));
  if(row?.status==='released'&&!ok)
   emit('PRODUCTION_RELEASE_APPROVAL_TIMESTAMP_UNOBSERVED',
    [ref('production','records',i+1)]);
 });
 return trails;
}
function makeDecisionBrief(values,status){
 if(status==='SOURCE_HOLD')return {
  phase:'PRELAUNCH',priority:'RESTORE_SOURCE_OBSERVATIONS',
  headline:'Source records are incomplete',
  explanation:'JARVIS cannot compare the required four departments. This is not proof of a live production delay.',
  nextStep:'Restore the missing signed read-only source view, then compare the existing records. Do not create substitute transactions.',
  liveImpactConfirmed:false,recordWritePermitted:false,
  preparationSteps:['Restore the existing signed source view.',
   'Reopen the same founder question after the source is available; no business record is changed.']
 };
 if(!values.length)return {
  phase:'PRELAUNCH',priority:'NO_OBSERVED_DISCREPANCY',
  headline:'No linked difference found in the selected records',
  explanation:'No discrepancy was detected in this bounded sample. This is not proof of a live production delay or that the company is fully ready.',
  nextStep:'Continue preparing approved engineering configurations and authoritative production records before launch.',
  liveImpactConfirmed:false,recordWritePermitted:false,
  preparationSteps:['Use the existing engineering and departmental planning records to prepare the project.',
   'Do not treat an empty bounded observation as proof of final readiness.']
 };
 const first=values[0];
 return {
  phase:'PRELAUNCH',priority:first.reviewPriority,
  headline:first.title,
  explanation:'Review the '+first.classification.toLowerCase().replaceAll('_',' ')+
   ' first. The observed '+first.observedCount+
   ' sampled rows are not proof of a live production delay; record origin and real-world impact are unverified.',
  nextStep:first.action,sourceDomains:first.sourceDomains,
  preparationSteps:PREPARATION_STEPS[first.code]||[first.action],
  liveImpactConfirmed:false,recordWritePermitted:false
 };
}

export function buildDataAgentInvestigation({question,observations=[]}={}){
 if(typeof question!=='string'||!Array.isArray(observations)||observations.length>4)
  throw Error('DATA_AGENT_INVESTIGATION_INPUT_INVALID');
 const found=new Map();
 for(const row of observations){
  if(!sourceObject(row)||!REQUIRED.includes(row.domain)||found.has(row.domain)||
    !['OBSERVED','HOLD'].includes(row.status))throw Error('DATA_AGENT_INVESTIGATION_INPUT_INVALID');
  found.set(row.domain,row);
 }
 const unresolved=REQUIRED.filter(domain=>{
  const item=found.get(domain);
  return item?.status!=='OBSERVED'||!sourceObject(item.data);
 });
 if(unresolved.length)return {
  schemaVersion:'VAOS_DATA_AGENT_INVESTIGATION_V1',status:'SOURCE_HOLD',
  summary:'Some required authoritative reads are unavailable. JARVIS cannot establish a cross-source explanation from incomplete observations.',
  findings:[],chart:{title:'Observed linkage discrepancies',rows:[]},
  holds:unresolved.map(x=>x.toUpperCase()+'_SOURCE_HOLD'),
  sourceDomains:REQUIRED,operatingContext:OPERATING_CONTEXT,
  decisionBrief:makeDecisionBrief([], 'SOURCE_HOLD'),
  causalProofEstablished:false,completeDatasetVerified:false,
  snapshotConsistencyVerified:false,actionAuthorized:false,readOnly:true
 };
 const data=Object.fromEntries(REQUIRED.map(domain=>[domain.toUpperCase(),found.get(domain).data]));
 const assessment=assessG3CrossSource(data);
 if(assessment.status==='CROSS_SOURCE_INPUT_HOLD')return {
  schemaVersion:'VAOS_DATA_AGENT_INVESTIGATION_V1',status:'SOURCE_HOLD',
  summary:'Signed reads returned unsuitable bounded records; relationship claims are withheld.',
  findings:[],chart:{title:'Observed linkage discrepancies',rows:[]},
  holds:['CROSS_SOURCE_INPUT_HOLD'],
  sourceDomains:REQUIRED,causalProofEstablished:false,completeDatasetVerified:false,
  snapshotConsistencyVerified:false,actionAuthorized:false,readOnly:true
 };
 const evidence=buildSampleEvidence(data);
 const legacyMigratedReleaseLabelsWithoutBom=data.ENGINEERING.baselines
  .filter(isLegacyMigrationRelease).length;
 const counts={...assessment.counts,legacyMigratedReleaseLabelsWithoutBom,
  releasedBaselinesWithoutBom:Math.max(0,
   assessment.counts.releasedBaselinesWithoutBom-legacyMigratedReleaseLabelsWithoutBom)};
 const values=findings.map(template=>({
  code:template.code,title:template.title,classification:template.classification,
  severity:template.severity,observedCount:counts[template.field],
  explanation:template.explanation,action:template.action,
  sourceDomains:template.sourceDomains,
  reviewPriority:REVIEW_PRIORITY[template.classification],
  operationalImpactVerified:false,
  evidenceTrail:evidence[template.code]||[],
  sourcePositionScope:'REQUEST_LOCAL_BOUNDED_SAMPLE'
 })).filter(row=>Number.isSafeInteger(row.observedCount)&&row.observedCount>0)
 .sort((a,b)=>PRIORITY_ORDER.indexOf(a.reviewPriority)-PRIORITY_ORDER.indexOf(b.reviewPriority));
 const discrepancies=values.filter(x=>x.classification==='OBSERVED_DISCREPANCY');
 const summary=values.length
  ?'The selected source rows contain '+discrepancies.length+
    ' types of directly observed cross-source mismatch and '+
    (values.length-discrepancies.length)+
    ' types of documentation or sample-coverage gap. These are evidence-backed investigation leads, not proven causes of production delay.'
  :'No discrepancy detected within the selected rows; this is not proof that there are no business risks or production blockers.';
 return {
  schemaVersion:'VAOS_DATA_AGENT_INVESTIGATION_V1',status:'BOUNDED_EVIDENCE',
  summary,findings:values,operatingContext:OPERATING_CONTEXT,
  decisionBrief:makeDecisionBrief(values,'BOUNDED_EVIDENCE'),
  chart:{title:'Types of findings by review priority',unit:'finding_types',
   rows:PRIORITY_ORDER.map(priority=>({
    label:priority==='RECONCILE_SOURCE_CONFLICT'?'Record mismatch':
     priority==='COMPLETE_RELEASE_TRACE'?'Release documentation':
     priority==='COMPLETE_RECORD_LINKS'?'Unlinked records':'Sample coverage',
    value:values.filter(x=>x.reviewPriority===priority).length
   })).filter(x=>x.value>0)},
  holds:['INDEPENDENT_SOURCE_SNAPSHOT_AND_REVISION_UNVERIFIED',
   'SELECTED_ROWS_NOT_COMPLETE_ENTERPRISE_DATASET',
   'ACTUAL_CAUSAL_IMPACT_NOT_ESTABLISHED'],
  sourceDomains:REQUIRED,
  coverage:{procurement:assessment.counts.procurementSampleRows,
   inventory:assessment.counts.inventorySampleRows,production:assessment.counts.productionSampleRows,
   engineeringBaselines:assessment.counts.engineeringBaselineSampleRows},
  causalProofEstablished:false,completeDatasetVerified:false,
  snapshotConsistencyVerified:false,actionAuthorized:false,readOnly:true
 };
}
