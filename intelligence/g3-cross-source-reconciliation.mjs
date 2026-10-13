/** G3.1E (diagnostics only): reconcile canonical bounded gateway observations.
 * Does not assert one database snapshot, a fully paginated view, unit conversion,
 * version lineage, engineering release or optimizer authority. No source values,
 * SKUs, order identifiers, prices or row data may leave this routine.
 */
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const arr=(o,k)=>isObject(o)&&Array.isArray(o[k])&&o[k].length<=50?o[k]:null;
const key=v=>typeof v==='string'&&v.trim()?v.trim().toUpperCase():null;
const fixedHolds=Object.freeze([
 'INDEPENDENT_SNAPSHOT_AND_SOURCE_REVISION_PROOF_REQUIRED',
 'PAGINATION_AND_COMPLETE_DATASET_PROOF_REQUIRED',
 'CANONICAL_UNIT_CONVERSION_EVIDENCE_REQUIRED',
 'ENGINEERING_RELEASE_EFFECTIVITY_AND_BOM_PROOF_REQUIRED',
 'G2B_INDEPENDENT_RESTORE_REQUIRED'
]);
const result=(status,counts,extraHolds=[])=>Object.freeze({
 schemaVersion:'G3_1E_SOURCE_CROSSWALK_V1',
 status,scope:'BOUNDED_OBSERVATION_ONLY',
 counts:Object.freeze(counts),
 holds:Object.freeze([...extraHolds,...fixedHolds]),
 sameDatabaseSnapshotVerified:false,
 sourceRevisionsIndependentlyVerified:false,
 completeDatasetVerified:false,
 independentlyReconciledSourceCounts:false,
 unitConversionVerified:false,
 engineeringReleaseVerified:false,
 canRunRealDataOptimizer:false,
 productionForecastCertified:false,
 actionAuthorized:false,
 agentDispatchAuthorized:false,
 sourceRecordsExported:false
});
/** The input is the set of the four successful, route-verified gateway reads.
 * Missing or malformed data fails closed. All counts refer to sampled rows.
 */
export function assessG3CrossSource(dataByDomain={}){
 const procurement=arr(dataByDomain?.PROCUREMENT,'records');
 const inventory=arr(dataByDomain?.INVENTORY,'records');
 const production=arr(dataByDomain?.PRODUCTION,'records');
 const baselines=arr(dataByDomain?.ENGINEERING,'baselines');
 const changes=arr(dataByDomain?.ENGINEERING,'changeOrders');
 if([procurement,inventory,production,baselines,changes].some(x=>x===null))
  return result('CROSS_SOURCE_INPUT_HOLD',{},['GATEWAY_PAYLOAD_OR_BOUNDS_UNVERIFIED']);
 const inventoryBySku=new Map();
 for(const row of inventory){
  const sku=isObject(row)?key(row.sku):null,unit=isObject(row)?key(row.unit):null;
  if(sku&&unit){
   if(!inventoryBySku.has(sku))inventoryBySku.set(sku,new Set());
   inventoryBySku.get(sku).add(unit);
  }
 }
 const jobsByOrder=new Map();
 for(const row of production){
  const id=isObject(row)?key(row.sales_order_id):null;
  if(id){
   if(!jobsByOrder.has(id))jobsByOrder.set(id,[]);
   jobsByOrder.get(id).push(key(row.bom_revision));
  }
 }
 let shortageRowsWithoutObservedInventorySku=0;
 let shortageRowsWithIncompatibleObservedInventoryUnit=0;
 let shortageRowsWithoutObservedLinkedJobCard=0;
 let shortageRowsWithObservedJobBomConflict=0;
 let shortageRowsNotComparable=0;
 for(const row of procurement){
  const sku=isObject(row)?key(row.sku):null;
  const unit=isObject(row)?key(row.unit):null;
  const order=isObject(row)?key(row.sales_order_id):null;
  const bom=isObject(row)?key(row.bom_revision):null;
  if(!sku||!unit||!order||!bom){shortageRowsNotComparable++;continue;}
  const observedUnits=inventoryBySku.get(sku);
  if(!observedUnits)shortageRowsWithoutObservedInventorySku++;
  else if(!observedUnits.has(unit))shortageRowsWithIncompatibleObservedInventoryUnit++;
  const observedBoms=jobsByOrder.get(order);
  if(!observedBoms)shortageRowsWithoutObservedLinkedJobCard++;
  else if(observedBoms.some(x=>x!==null)&&!observedBoms.includes(bom))
   shortageRowsWithObservedJobBomConflict++;
 }
 const releasedBaselinesWithoutBom=baselines.filter(row=>
  isObject(row)&&row.status==='released'&&!key(row.bom_revision)).length;
 const counts={
  procurementSampleRows:procurement.length,
  inventorySampleRows:inventory.length,
  productionSampleRows:production.length,
  engineeringBaselineSampleRows:baselines.length,
  engineeringChangeOrderSampleRows:changes.length,
  shortageRowsWithoutObservedInventorySku,
  shortageRowsWithIncompatibleObservedInventoryUnit,
  shortageRowsWithoutObservedLinkedJobCard,
  shortageRowsWithObservedJobBomConflict,
  shortageRowsNotComparable,
  releasedBaselinesWithoutBom
 };
 const holds=[];
 if(shortageRowsNotComparable)holds.push('CROSS_SOURCE_COMPARAND_FIELDS_MISSING');
 if(shortageRowsWithIncompatibleObservedInventoryUnit)holds.push('OBSERVED_SKU_UNIT_RELATION_UNRECONCILED');
 if(shortageRowsWithObservedJobBomConflict)holds.push('OBSERVED_JOB_BOM_REVISION_CONFLICT');
 if(releasedBaselinesWithoutBom)holds.push('RELEASED_ENGINEERING_BASELINES_WITHOUT_BOM');
 // An absent stock record or linked job in a truncated sample is not proof of
 // no inventory or no job. Report the count but do not invent that conclusion.
 return result('CROSS_SOURCE_RECONCILIATION_HOLD',counts,holds);
}
