/** G3.1E source provenance preflight — bounded diagnostic ONLY.
 * Row-level revision or date hints never prove independent snapshot freshness,
 * coherent source revision, complete pagination, release or material authority.
 */
const DOMAINS=Object.freeze(['PROCUREMENT','INVENTORY','PRODUCTION','ENGINEERING']);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const safeArray=(x)=>Array.isArray(x)&&x.length<=50?x:null;
const verifiedDate=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(x);
const revisionHint=(domain,row)=>{
 if(!obj(row))return false;
 const f=domain==='ENGINEERING'?'revision_code': 'sales_order_revision';
 const v=row[f];
 return typeof v==='string'&&v.trim().length>0&&v.length<=120||
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
};
const sourceRows=(domain,data)=>{
 if(!obj(data))return null;
 if(domain==='ENGINEERING'){
  const baseline=safeArray(data.baselines),change=safeArray(data.changeOrders);
  return baseline&&change?{primary:baseline,secondary:change}:null;
 }
 const records=safeArray(data.records);
 return records?{primary:records,secondary:[]}:null;
};
const held=(domain,status,details={})=>Object.freeze({
 domain,status,sampledRows:0,revisionHintRows:0,timeHintRows:0,unitHintRows:0,
 sampleAtLimit:false,paginationVerified:false,sourceRevisionVerified:false,
 sourceDataFreshnessVerified:false,completeDatasetVerified:false,
 independentCountVerified:false,unitsVerified:false,engineeringReleaseVerified:false,
 ...details
});
/** Evaluate only server-verified gateway envelopes. Cannot certify upstream metadata. */
export function inspectG3SourceProvenance(dataByDomain={}){
 const domains=DOMAINS.map(domain=>{
  const rows=sourceRows(domain,dataByDomain?.[domain]);
  if(!rows)return held(domain,'INPUT_HOLD');
  const all=[...rows.primary,...rows.secondary];
  const timestamps=all.filter(row=>obj(row)&&
   (verifiedDate(row.updated_at)||verifiedDate(row.created_at))).length;
  const revisionHints=all.filter(row=>revisionHint(domain,row)).length;
  const unitHints=all.filter(row=>obj(row)&&typeof row.unit==='string'&&row.unit.trim().length>0).length;
  return held(domain,'UNQUALIFIED_SOURCE_HINTS_ONLY',{
   sampledRows:all.length,revisionHintRows:revisionHints,
   timeHintRows:timestamps,unitHintRows:unitHints,
   sampleAtLimit:rows.primary.length===50||rows.secondary.length===50
  });
 });
 return Object.freeze({
  schemaVersion:'G3_1E_PROVENANCE_PREFLIGHT_V1',
  status:'PROVENANCE_EVIDENCE_HOLD',
  domains:Object.freeze(domains),
  holds:Object.freeze([
   'INDEPENDENT_SOURCE_REVISION_RECEIPT_REQUIRED',
   'SOURCE_DATA_FRESHNESS_PROOF_REQUIRED',
   'FULL_PAGINATION_AND_COUNT_RECONCILIATION_REQUIRED',
   'CANONICAL_UNIT_MAPPING_REQUIRED',
   'SIGNED_BOM_EFFECTIVITY_AND_ENGINEERING_RELEASE_REQUIRED',
   'G2B_INDEPENDENT_RECOVERY_HOLD'
  ]),
  sourceRevisionVerified:false,
  sourceDataFreshnessVerified:false,
  completeDatasetVerified:false,
  numericUnitsVerified:false,
  engineeringReleaseVerified:false,
  productionForecastCertified:false,
  canRunRealDataOptimizer:false,
  actionAuthorized:false,agentDispatchAuthorized:false,
  sourceRecordsExported:false
 });
}
