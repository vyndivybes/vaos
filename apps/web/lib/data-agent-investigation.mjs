/** Reuse G3.1E's bounded cross-source relations for founder explanations.
 * Server-only: raw identifiers and source records never enter the response.
 * A detected mismatch is an observed discrepancy, NOT proof of a delay cause.
 */
import {assessG3CrossSource} from '../../../intelligence/g3-cross-source-reconciliation.mjs';

const REQUIRED=['procurement','inventory','production','engineering'];
const findings=Object.freeze([
 {field:'shortageRowsWithObservedJobBomConflict',code:'OBSERVED_JOB_BOM_REVISION_CONFLICT',
  classification:'OBSERVED_DISCREPANCY',severity:'HIGH',title:'Procurement and job-card BOM revisions disagree',
  explanation:'At least one selected shortage line and its observed linked job card reference different BOM revisions. This is a traceability conflict, not proof that the conflict delayed the build.',
  action:'Reconcile the shortage line against its job-card BOM and the approved engineering configuration before rescheduling work.',
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
  sourceDomains:REQUIRED,causalProofEstablished:false,completeDatasetVerified:false,
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
 const values=findings.map(template=>({
  code:template.code,title:template.title,classification:template.classification,
  severity:template.severity,observedCount:assessment.counts[template.field],
  explanation:template.explanation,action:template.action,
  sourceDomains:template.sourceDomains
 })).filter(row=>Number.isSafeInteger(row.observedCount)&&row.observedCount>0);
 const discrepancies=values.filter(x=>x.classification==='OBSERVED_DISCREPANCY');
 const summary=values.length
  ?'The selected source rows contain '+discrepancies.length+
    ' types of directly observed cross-source mismatch and '+
    (values.length-discrepancies.length)+
    ' types of documentation or sample-coverage gap. These are evidence-backed investigation leads, not proven causes of production delay.'
  :'No discrepancy detected within the selected rows; this is not proof that there are no business risks or production blockers.';
 return {
  schemaVersion:'VAOS_DATA_AGENT_INVESTIGATION_V1',status:'BOUNDED_EVIDENCE',
  summary,findings:values,
  chart:{title:'Observed linkage discrepancy counts',rows:values.map(x=>({label:x.title,value:x.observedCount}))},
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
