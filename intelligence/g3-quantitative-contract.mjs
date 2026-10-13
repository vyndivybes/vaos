/** G3.1D — canonical VYNDI bridge numeric field-contract screening.
 * Candidate field validation is NOT source truth, physical unit conversion,
 * a signed revision, a release approval, or readiness for production models.
 * Raw rows must never be persisted, logged, returned or fed to G3.0.
 */
const DOMAINS=['PROCUREMENT','INVENTORY','PRODUCTION','ENGINEERING'];
const UNITS=new Set(['pcs','pc','ea','each','unit','units','nos','set','pair','kg','g','mg','m','mm','cm','l','ml']);
const SIMPLE=/^[A-Za-z0-9_.:/-]{1,100}$/;
const REF=/^[A-Za-z0-9_.:/-]{1,100}$/;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const whole=x=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const decimal=x=>{
 if(typeof x==='number')return Number.isFinite(x)&&x>=0&&x<=1e9?x:null;
 if(typeof x!=='string'||! /^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,6})?$/.test(x))return null;
 const n=Number(x);return Number.isFinite(n)&&n>=0&&n<=1e9?n:null;
};
const id=x=>typeof x==='string'&&SIMPLE.test(x);
const version=x=>typeof x==='string'&&REF.test(x);
const unit=x=>typeof x==='string'&&UNITS.has(x.toLowerCase());
const result=(domain,status,sampledRows,structurallyValidRows,reasonCodes,extra={})=>Object.freeze({
 schemaVersion:'G3_1D_NUMERIC_SOURCE_AUDIT_V1',domain,status,
 sampledRows,structurallyValidRows,invalidRows:sampledRows-structurallyValidRows,
 reasonCodes:Object.freeze([...reasonCodes]),fieldFailureCounts:Object.freeze({}),
 sourceRecordsExported:false,completeDatasetVerified:false,
 sourceRevisionVerified:false,sourceRecordFreshnessVerified:false,
 numericUnitReconciliationVerified:false,quantityCertifiedForOptimization:false,
 productionReleaseCertified:false,actionAuthorized:false,
 ...extra
});
/** Source-shape faults only. A released engineering baseline without a BOM
 * reference is structurally readable but cannot be qualified for production.
 * Draft baselines may intentionally have no BOM; neither state grants release.
 */
function engineeringFieldIssues(row){
 if(!obj(row))return ['ENGINEERING_RECORD_INVALID'];
 const issues=[];
 if(!id(row.id))issues.push('ENGINEERING_BASELINE_ID_INVALID');
 if(!version(row.revision_code))issues.push('ENGINEERING_REVISION_INVALID');
 if(typeof row.status!=='string'||!/^[A-Za-z_]{1,40}$/.test(row.status))
  issues.push('ENGINEERING_STATUS_INVALID');
 const absent=row.bom_revision===null||row.bom_revision===undefined||row.bom_revision==='';
 if(absent&&row.status==='released')issues.push('ENGINEERING_RELEASED_BOM_UNASSIGNED');
 else if(!absent&&!version(row.bom_revision))
  issues.push('ENGINEERING_BOM_REVISION_INVALID');
 return issues;
}
function validateRow(domain,row){
 if(!obj(row))return false;
 if(domain==='PROCUREMENT'){
  const req=decimal(row.required_quantity),short=decimal(row.shortage_quantity);
  return id(row.sku)&&unit(row.unit)&&version(row.bom_revision)
   &&req!==null&&short!==null&&short>0&&short<=req;
 }
 if(domain==='INVENTORY')
  return id(row.sku)&&unit(row.unit)&&decimal(row.quantity_balance)!==null;
 if(domain==='PRODUCTION'){
  const n=decimal(row.units);
  return id(row.id)&&version(row.bom_revision)
    &&typeof row.status==='string'&&/^[A-Za-z_]{1,40}$/.test(row.status)
    &&n!==null&&Number.isSafeInteger(n)&&n>0;
 }
 if(domain==='ENGINEERING')return engineeringFieldIssues(row).length===0;
 return false;
}
/** Validate a bounded sample returned by a signed, approved route.
 * A sample is never a verified complete enterprise dataset.
 */
export function auditG3NumericSource(domain,data){
 if(!DOMAINS.includes(domain))throw Error('G3_NUMERIC_DOMAIN_INVALID');
 if(!obj(data))
  return result(domain,'PAYLOAD_SHAPE_HOLD',0,0,['NON_CANONICAL_PAYLOAD']);
 const records=domain==='ENGINEERING'
   ?Array.isArray(data.baselines)&&Array.isArray(data.changeOrders)
     &&data.changeOrders.length<=50?data.baselines:null
   :Array.isArray(data.records)?data.records:null;
 if(!records||records.length>50)
  return result(domain,'PAYLOAD_SHAPE_HOLD',0,0,['NON_CANONICAL_PAYLOAD']);
 if(records.length===0)
  return result(domain,'NO_NUMERIC_ROWS_OBSERVED',0,0,['EMPTY_SAMPLE_NOT_ENTERPRISE_ZERO']);
 let valid=0;
 const reasons=new Set(),unitsBySku=new Map(),failureCounts=new Map();
 const issue=code=>{
  reasons.add(code);
  failureCounts.set(code,(failureCounts.get(code)||0)+1);
 };
 for(const row of records){
  const good=validateRow(domain,row);
  if(good)valid++;
  else for(const code of domain==='ENGINEERING'
   ?engineeringFieldIssues(row):['FIELD_TYPE_OR_VALUE_UNVERIFIED'])issue(code);
  if((domain==='PROCUREMENT'||domain==='INVENTORY')&&obj(row)
    &&id(row.sku)&&typeof row.unit==='string'&&unit(row.unit)){
   const u=row.unit.toLowerCase();
   const old=unitsBySku.get(row.sku);
   if(old&&old!==u)issue('MIXED_UNCONVERTED_UNITS');
   unitsBySku.set(row.sku,u);
  }
 }
 return result(domain,reasons.size===0?'STRUCTURAL_CANDIDATE_UNCERTIFIED':'FIELD_CONTRACT_HOLD',
  records.length,valid,[...reasons],
  {sampleAtLimit:records.length===50,
   unitConversionApplied:false,
   externalDocumentEvidenceChecked:false,
   fieldFailureCounts:Object.freeze(Object.fromEntries([...failureCounts].sort(([a],[b])=>a.localeCompare(b))))
  });
}
export function summarizeG3NumericAudits(sources=[]){
 if(!Array.isArray(sources)||sources.length>4||
   sources.some(x=>!obj(x)||!DOMAINS.includes(x.domain)||x.schemaVersion!=='G3_1D_NUMERIC_SOURCE_AUDIT_V1')||
   new Set(sources.map(x=>x.domain)).size!==sources.length)
  throw Error('G3_NUMERIC_BATCH_INVALID');
 const ordered=DOMAINS.map(domain=>sources.find(x=>x.domain===domain)||
  result(domain,'SOURCE_READ_HOLD',0,0,['SIGNED_GATEWAY_UNAVAILABLE']));
 // Aggregate public-safe counts only. No raw numeric values.
 return Object.freeze({
  schemaVersion:'G3_1D_NUMERIC_QUALIFICATION_V1',
  status:'QUANTITATIVE_INPUT_QUALIFICATION_HOLD',
  sourceCount:ordered.length,
  candidateSourceCount:ordered.filter(x=>x.status==='STRUCTURAL_CANDIDATE_UNCERTIFIED').length,
  heldSourceCount:ordered.filter(x=>x.status!=='STRUCTURAL_CANDIDATE_UNCERTIFIED').length,
  sources:Object.freeze(ordered),
  holds:Object.freeze([
   ...ordered.filter(x=>x.status!=='STRUCTURAL_CANDIDATE_UNCERTIFIED')
     .map(x=>x.domain+'_NUMERIC_SCHEMA_HOLD'),
   'INDEPENDENT_UNIT_AND_SOURCE_RECONCILIATION_REQUIRED',
   'BOM_REVISION_AND_ENGINEERING_RELEASE_EVIDENCE_REQUIRED',
   'CAPACITY_CALENDAR_AND_DURATION_UNITS_REQUIRED',
   'SIGNED_VEDM_VIBPE_MATERIAL_ALLOWABLES_REQUIRED',
   'HISTORICAL_BACKTEST_AND_CALIBRATION_REQUIRED',
   'G2B_DATABASE_RESTORE_REQUIRED'
  ]),
  numericInputsQualified:false,canRunRealDataOptimizer:false,
  productionForecastCertified:false,calibratedWithOutcomes:false,
  allSourceVersionsVerified:false,completeDatasetVerified:false,
  actionAuthorized:false,agentDispatchAuthorized:false
 });
}
