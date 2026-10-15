import {VYNDI_BRIDGE_ROUTES} from '../packages/contracts/vyndi-write-bridge.mjs';

// Metadata-only inventory of source authorities already admitted by the governed
// VYNDI read bridge. This does not fetch business records or certify data freshness.
const DOMAINS=Object.freeze({
  ORCHESTRATOR:'Enterprise intelligence',PROJECT:'Programme',COMMERCIAL:'Commercial',PROCUREMENT:'Procurement',
  INVENTORY:'Inventory',PRODUCTION:'Production',MAINTENANCE:'Maintenance',
  FINANCE:'Finance',PEOPLE:'People & Office',ENGINEERING:'Engineering',
});
export function buildVyndiAnalyticsSourceMap(routes=VYNDI_BRIDGE_ROUTES){
  if(!Array.isArray(routes))throw new TypeError('SOURCE_ROUTES_REQUIRED');
  const seen=new Set();
  const sources=routes.filter(route=>route.effectClass==='read').map(route=>{
    if(seen.has(route.actionType))throw Error('DUPLICATE_SOURCE_ACTION');
    seen.add(route.actionType);
    const domainKey=route.actionType.split('.')[0];
    if(!Object.hasOwn(DOMAINS,domainKey))throw Error('UNKNOWN_SOURCE_DOMAIN');
    if(route.executionEnabled!==true||route.state!=='READ_READY')throw Error('SOURCE_NOT_READ_READY');
    if(!route.authority||!route.sourceFile||!Array.isArray(route.verificationRefs))throw Error('SOURCE_METADATA_INCOMPLETE');
    return Object.freeze({
      domain:DOMAINS[domainKey],actionType:route.actionType,
      employeeId:route.employeeId,sourceAuthority:route.authority,
      sourceFile:route.sourceFile,verificationRefs:[...route.verificationRefs],
      availability:'BRIDGE_ROUTE_CONFIGURED',
      observedAt:null,recordCount:null,freshness:'NOT_OBSERVED',
      actualsAvailable:null
    });
  });
  return Object.freeze({
    schemaVersion:'VAOS_VYNDI_ANALYTICS_SOURCE_MAP_V1',
    readOnly:true,sourceType:'BRIDGE_CONTRACT_METADATA',
    evidenceQualification:'UNVERIFIED_UNTIL_SIGNED_LIVE_READ',
    routeCount:sources.length,domains:[...new Set(sources.map(s=>s.domain))],
    sources,
  });
}
