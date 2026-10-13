/** G3.1A-C source-authority mapping and fail-closed qualification.
 * Never accepts or transfers raw business rows into a prediction engine.
 * Server gateway retrieval proves only a read occurred, not source freshness.
 */
import {getVyndiBridgeRoute} from '../packages/contracts/vyndi-write-bridge.mjs';

const BAD=()=>{throw Error('G3_READINESS_INVALID')};
const ACTIONS=Object.freeze([
 ['PROCUREMENT','PROCUREMENT.OBSERVE_SHORTAGE'],
 ['INVENTORY','INVENTORY.OBSERVE_STOCK'],
 ['PRODUCTION','PRODUCTION.OBSERVE_WIP'],
 ['ENGINEERING','ENGINEERING.OBSERVE_CONFIGURATION']
]);
export const G3_REQUIRED_READS=Object.freeze(ACTIONS.map(([domain,actionType])=>{
 const r=getVyndiBridgeRoute(actionType);
 if(!r||r.effectClass!=='read'||r.executionEnabled!==true||
    r.state!=='READ_READY'||typeof r.authority!=='string')
   throw Error('G3_AUTHORITY_ROUTE_NOT_QUALIFIED');
 return Object.freeze({domain,actionType,authority:r.authority,
  effectClass:r.effectClass,executionEnabled:r.executionEnabled,
  sourceFile:r.sourceFile});
}));
const ISO=/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/;
const OBS_KEYS='actionType,domain,gatewayReadAt,sourceAuthority,status';
function receipt(timestamp,now){
 if(typeof timestamp!=='string'||!ISO.test(timestamp))return 'UNVERIFIED_GATEWAY_READ';
 const t=Date.parse(timestamp);
 if(!Number.isFinite(t)||new Date(t).toISOString()!==timestamp||
    !Number.isFinite(now)||now<t)return 'UNVERIFIED_GATEWAY_READ';
 return now-t<=300000?'RECENT_GATEWAY_READ':'STALE_GATEWAY_READ';
}
export function assessG3SourceReadiness(observations=[],{now=Date.now()}={}){
 if(!Array.isArray(observations)||observations.length>G3_REQUIRED_READS.length||
    !Number.isFinite(now))BAD();
 const seen=new Set(),rows=new Map();
 for(const x of observations){
  if(!x||typeof x!=='object'||Array.isArray(x)||
    Object.keys(x).sort().join(',')!==OBS_KEYS||
    !['OBSERVED','HOLD'].includes(x.status)||seen.has(x.domain))BAD();
  const expected=G3_REQUIRED_READS.find(r=>r.domain===x.domain);
  if(!expected||x.actionType!==expected.actionType||
     (x.status==='OBSERVED'&&x.sourceAuthority!==expected.authority)||
     (x.status==='HOLD'&&x.sourceAuthority!==null)||
     (x.status==='HOLD'&&x.gatewayReadAt!==null))BAD();
  seen.add(x.domain);rows.set(x.domain,x);
 }
 const sources=G3_REQUIRED_READS.map(r=>{
  const item=rows.get(r.domain);
  const status=item?.status==='OBSERVED'?'OBSERVED':'HOLD';
  return Object.freeze({
   domain:r.domain,actionType:r.actionType,expectedAuthority:r.authority,
   status, gatewayReceipt:status==='OBSERVED'?receipt(item.gatewayReadAt,now):'NO_OBSERVED_READ',
   sourceDataFreshnessVerified:false,sourceRevisionVerified:false,
   numericInputsQualified:false,unitsVerified:false,
   completenessVerified:false,engineeringReleaseVerified:false,
   sourceFile:r.sourceFile
  });
 });
 const holds=Object.freeze([
  ...sources.filter(s=>s.status==='HOLD').map(s=>s.domain+'_READ_HOLD'),
  ...sources.filter(s=>s.status==='OBSERVED'&&s.gatewayReceipt!=='RECENT_GATEWAY_READ')
     .map(s=>s.domain+'_RETRIEVAL_FRESHNESS_HOLD'),
  'SOURCE_REVISION_PROOF_REQUIRED','RESOURCE_CAPACITY_UNITS_REQUIRED',
  'BOM_AND_MATERIAL_ALLOWABLES_REQUIRED','RELEASE_AND_VALIDATION_EVIDENCE_REQUIRED',
  'BACKTEST_HISTORY_REQUIRED','G2B_INDEPENDENT_RECOVERY_HOLD',
  'VEDM_VIBPE_DETAILED_AUTHORITY_REQUIRED'
 ]);
 return Object.freeze({
  schemaVersion:'G3_1_AUTHORITY_READINESS_V1',status:'INPUT_QUALIFICATION_HOLD',
  requiredSourceCount:G3_REQUIRED_READS.length,
  observedSourceCount:sources.filter(s=>s.status==='OBSERVED').length,
  gatewayReadCoverage:sources.filter(s=>s.gatewayReceipt==='RECENT_GATEWAY_READ').length,
  sources:Object.freeze(sources),holds,
  canRunRealDataOptimizer:false,productionForecastCertified:false,
  calibratedWithOutcomes:false,detailedVedmVibpeProofAvailable:false,
  financialPlanningQualified:false,
  syntheticResearchOnly:true,modelInvocations:0,
  actionAuthorized:false,agentDispatchAuthorized:false,
  note:'A signed gateway read is not a verified quantity, unit, source revision, approved BOM, engineering release, calibrated forecast or production-capacity certificate.'
 });
}
