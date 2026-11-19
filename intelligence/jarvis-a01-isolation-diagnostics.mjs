/** Trust-minimized VAOS founder projection of VYNDI signed A01 aggregate HOLD.
 * A signed service response is NOT a legal-tenant credential, source revision,
 * business authorization, human approval or an independently certified ledger.
 * Never forward original payloads or any venture/SKU identifiers.
 */
const ACTION='INVENTORY.OBSERVE_ISOLATION_DIAGNOSTICS';
const AUTHORITY='getInventoryIsolationDiagnostics';
const HOLDS=new Set([
 'LEGAL_TENANT_MEMBERSHIP_UNVERIFIED',
 'BUSINESS_OWNER_ATTRIBUTION_UNVERIFIED',
 'SOURCE_REVISION_AND_ATTESTATION_UNVERIFIED',
 'MULTI_STATEMENT_SNAPSHOT_NOT_ATOMIC',
 'CROSS_VENTURE_SKU_COLLISION',
 'NEGATIVE_PHYSICAL_STOCK',
 'UNPAIRED_INVENTORY_AND_COST',
 'STOCK_IDENTITY_INVALID',
 'INVENTORY_PAGE_INCOMPLETE',
 'JOB_VENTURE_LINEAGE_INCOMPLETE',
 'RESERVATION_PARENT_REVISION_UNVERIFIED',
 'PO_PARENT_REVISION_UNVERIFIED',
 'HISTORICAL_SIMULATION_ONLY',
 'RECORD_LEVEL_CLASSIFICATION_PENDING',
 'AUTHENTICATED_OWNER_BINDING_PENDING',
 'REAL_SOURCE_REVISION_PENDING',
 'SIMULATION_DECLARATION_COHORT_DRIFT',
]);
const MD_SIMULATION_BASELINE=Object.freeze({
 salesOrders:5,purchaseOrders:48,jobCards:4,jobCardLines:56,
 reservations:1,inventoryLedger:2,inventoryCostLedger:2,travellers:1,
});
const POLICY_HOLDS=['HISTORICAL_SIMULATION_ONLY',
 'RECORD_LEVEL_CLASSIFICATION_PENDING','AUTHENTICATED_OWNER_BINDING_PENDING',
 'REAL_SOURCE_REVISION_PENDING'];
const INVENTORY_FIELDS=['ventureCount','sourceCount','overlappingKeyGroups',
 'unpairedCount','negativeCount','invalidIdentityCount'];
const LINEAGE_FIELDS=['jobCardsTotal','jobCardsWithoutTravellerVenture','ambiguousJobVentureCount',
 'reservationsTotal','reservationsWithBrokenLineage',
 'purchaseOrdersTotal','purchaseOrdersWithBrokenLineage'];

function unavailable(reason){
 return Object.freeze({schemaVersion:'VAOS_JARVIS_A01_ISOLATION_HOLD_V1',
  status:'HOLD',readOnly:true,tenantIdentityVerified:false,
  sourceCompletenessVerified:false,availableToPromiseAuthorized:false,
  businessWritesAuthorized:false,productionWriteAuthorized:false,
  holds:Object.freeze([reason]),
  inventory:null,lineage:null});
}
export const A01_ISOLATION_UNAVAILABLE=Object.freeze(unavailable('ISOLATION_DIAGNOSTIC_UNAVAILABLE'));

function allCounts(source,fields){
 if(!source||typeof source!=='object'||Array.isArray(source))return null;
 const picked={};
 for(const key of fields){
  const n=source[key];
  if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0)return null;
  picked[key]=n;
 }
 return picked;
}

/** @param {unknown} response */
export function normalizeA01IsolationDiagnostic(response){
 const bad=()=>unavailable('ISOLATION_DIAGNOSTIC_INVALID');
 if(!response||typeof response!=='object')return bad();
 const r=response;
 const data=r.data;
 if(r.readOnly!==true||r.effectClass!=='read'||r.sourceReceiptChecked!==false||
    r.productionWriteAuthorized!==false||
    r.actionType!==ACTION||r.sourceAuthority!==AUTHORITY||
    r.employeeId!=='inventory'||!data||typeof data!=='object'||
    data.schemaVersion!=='VYNDI_A01_ISOLATION_DIAGNOSTIC_V1'||
    data.status!=='HOLD'||data.readOnly!==true||
    data.tenantIdentityVerified!==false||
    data.sourceCompletenessVerified!==false||
    data.availableToPromiseAuthorized!==false||
    data.businessWritesAuthorized!==false||data.productionWriteAuthorized!==false||
    data.sourceRevisionAuthority!=='UNVERIFIED_MULTISTATEMENT_AUDIT'||
    !Array.isArray(data.holds)||data.holds.length<1||data.holds.length>32||
    data.holds.some(x=>!HOLDS.has(x))||
    !data.holds.includes('LEGAL_TENANT_MEMBERSHIP_UNVERIFIED'))return bad();
 const governance=data.businessGovernance,simulation=data.simulationBoundary;
 const expected=MD_SIMULATION_BASELINE;
 const observed=allCounts(simulation?.observedCounts,Object.keys(expected));
 const equal=observed && Object.keys(expected).every(k=>observed[k]===expected[k]);
 if(!governance||typeof governance!=='object'||Array.isArray(governance)||
    governance.declaredLegalEntity!=='Vāyú Shastr Pvt Ltd'||
    governance.product!=='VYNDI OS'||
    governance.businessOwnershipDecision!=='MD_DECLARED'||
    governance.sourceAuthorityDecision!=='MD_APPROVED'||
    governance.declaredSystemOfRecord!=='VYNDI_OS'||
    governance.agentOrchestrationSystem!=='VAOS_JARVIS'||
    governance.historicalDataClassification!=='SIMULATION_ONLY_DECLARED'||
    governance.authenticatedOwnerBindingVerified!==false||
    governance.recordLevelClassificationVerified!==false||
    governance.realSourceCertified!==false||
    !simulation||typeof simulation!=='object'||Array.isArray(simulation)||
    simulation.status!=='HOLD'||simulation.baselineScope!=='ROW_COUNTS_ONLY_NOT_RECORD_IDENTITIES'||
    typeof simulation.countsEqual!=='boolean'||!observed||
    simulation.sourceRevisionCertified!==false||
    simulation.productionBusinessDataCertified!==false||
    simulation.productionWriteAuthorized!==false||
    simulation.countsEqual!==equal||
    POLICY_HOLDS.some(code=>!data.holds.includes(code))||
    (!equal&&!data.holds.includes('SIMULATION_DECLARATION_COHORT_DRIFT'))||
    (equal&&data.holds.includes('SIMULATION_DECLARATION_COHORT_DRIFT')))
    return bad();
 const inventory=allCounts(data.inventory,INVENTORY_FIELDS);
 const lineage=allCounts(data.lineage,LINEAGE_FIELDS);
 if(!inventory||!lineage||
    typeof data.inventory.boundedPageComplete!=='boolean'||
    inventory.ventureCount>inventory.sourceCount||
    inventory.overlappingKeyGroups>inventory.sourceCount||
    inventory.negativeCount>inventory.sourceCount||
    inventory.unpairedCount>inventory.sourceCount||
    inventory.invalidIdentityCount>inventory.sourceCount||
    lineage.reservationsWithBrokenLineage>lineage.reservationsTotal||
    lineage.purchaseOrdersWithBrokenLineage>lineage.purchaseOrdersTotal||
    lineage.jobCardsWithoutTravellerVenture+lineage.ambiguousJobVentureCount>lineage.jobCardsTotal)
    return bad();
 return Object.freeze({schemaVersion:'VAOS_JARVIS_A01_ISOLATION_HOLD_V1',
  status:'HOLD',readOnly:true,tenantIdentityVerified:false,
  sourceCompletenessVerified:false,availableToPromiseAuthorized:false,
  businessWritesAuthorized:false,productionWriteAuthorized:false,
  businessGovernance:Object.freeze({
   declaredLegalEntity:'Vāyú Shastr Pvt Ltd',
   businessOwnershipDecision:'MD_DECLARED',
   sourceAuthorityDecision:'MD_APPROVED',
   declaredSystemOfRecord:'VYNDI_OS',
   historicalDataClassification:'SIMULATION_ONLY_DECLARED',
   authenticatedOwnerBindingVerified:false,
   recordLevelClassificationVerified:false,
   realSourceCertified:false,
  }),
  simulationBoundary:Object.freeze({
   status:'HOLD',countsEqual:equal,
   baselineScope:'ROW_COUNTS_ONLY_NOT_RECORD_IDENTITIES',
   productionBusinessDataCertified:false,sourceRevisionCertified:false,
   productionWriteAuthorized:false,
   observedCounts:Object.freeze(observed),
  }),
  inventory:Object.freeze({...inventory,boundedPageComplete:data.inventory.boundedPageComplete}),
  lineage:Object.freeze(lineage),
  holds:Object.freeze([...new Set(data.holds)]),
 });
}
