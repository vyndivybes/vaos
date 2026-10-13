/** Conservative founder-facing projection. Never treats observations as certification. */
const DOMAINS=['PROCUREMENT','INVENTORY','PRODUCTION','ENGINEERING'];
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const n=x=>Number.isSafeInteger(x)&&x>=0&&x<=100?x:null;
export function createG3QualificationView(payload){
 const d=payload?.data,q=d?.quantitativeDiagnostics,c=d?.crossSourceDiagnostics,p=d?.sourceProvenanceDiagnostics;
 if(d?.schemaVersion!=='G3_1_AUTHORITY_READINESS_V1' ||
   q?.schemaVersion!=='G3_1D_NUMERIC_QUALIFICATION_V1' ||
   c?.schemaVersion!=='G3_1E_SOURCE_CROSSWALK_V1' ||
   p?.schemaVersion!=='G3_1E_PROVENANCE_PREFLIGHT_V1' ||
   [d,q,c,p].some(x=>!obj(x)||x.actionAuthorized!==false||x.agentDispatchAuthorized!==false)||
   d.canRunRealDataOptimizer!==false||d.productionForecastCertified!==false||
   c.canRunRealDataOptimizer!==false||p.canRunRealDataOptimizer!==false||
   !Array.isArray(d.sources)||d.sources.length!==4||
   !Array.isArray(q.sources)||q.sources.length!==4||
   !Array.isArray(p.domains)||p.domains.length!==4)
  throw Error('G3_QUALIFICATION_CONTRACT_UNVERIFIED');
 const sources=DOMAINS.map(domain=>{
  const a=d.sources.find(x=>x?.domain===domain),b=q.sources.find(x=>x?.domain===domain),r=p.domains.find(x=>x?.domain===domain);
  if(!a||!b||!r||b.schemaVersion!=='G3_1D_NUMERIC_SOURCE_AUDIT_V1'||
     a.sourceDataFreshnessVerified!==false||a.sourceRevisionVerified!==false||
     b.sourceRevisionVerified!==false||b.completeDatasetVerified!==false||
     r.sourceRevisionVerified!==false||r.completeDatasetVerified!==false||
     b.actionAuthorized!==false)throw Error('G3_SOURCE_UNVERIFIED');
  return Object.freeze({
   domain,
   read:a.status==='OBSERVED'?'Observed read':'Read unavailable',
   receipt:a.gatewayReceipt==='RECENT_GATEWAY_READ'?'Recent retrieval only':'Unverified / stale',
   structural:b.status==='STRUCTURAL_CANDIDATE_UNCERTIFIED'?'Schema candidate only':'HOLD',
   sampled:n(b.sampledRows),valid:n(b.structurallyValidRows),
   revisionHints:n(r.revisionHintRows),timeHints:n(r.timeHintRows),unitHints:n(r.unitHintRows),
   atLimit:r.sampleAtLimit===true,
   revisionProof:'HOLD',freshnessProof:'HOLD',completeProof:'HOLD',unitProof:'HOLD'
  });
 });
 const counts=c.counts||{};
 const checks=[
  ['Shortage rows sampled',counts.procurementSampleRows,'Limited read, not complete demand'],
  ['Stock SKU not observed',counts.shortageRowsWithoutObservedInventorySku,'Not proof that stock is absent'],
  ['Observed unit mismatches',counts.shortageRowsWithIncompatibleObservedInventoryUnit,'Requires canonical unit evidence'],
  ['Job cards not observed',counts.shortageRowsWithoutObservedLinkedJobCard,'Limited read only'],
  ['Observed job/BOM conflicts',counts.shortageRowsWithObservedJobBomConflict,'Not a release qualification'],
  ['Released baselines without BOM',counts.releasedBaselinesWithoutBom,'Release and effectivity proof required']
 ].map(([label,value,note])=>Object.freeze({label,value:n(value),note}));
 const missingBom=n(counts.releasedBaselinesWithoutBom);
 const missingStock=n(counts.shortageRowsWithoutObservedInventorySku);
 const next=[
  ...(missingBom?['Engineering: investigate '+missingBom+' released baseline(s) with missing BOM revision evidence.']:[]),
  ...(missingStock?['Inventory: reconcile '+missingStock+' unmatched shortage observation(s) against complete balances.']:[]),
  'Source owners: provide independent revisions, signed source timestamps and full pagination/count proofs.',
  'Engineering/Quality: qualify applicable BOM, VEDM/VIBPE validation, material allowables and signed release.',
  'Recovery: complete G2b isolated restore with independent evidence.',
  'Forecast: backtest and calibrate G3.1F before operational acceptance.'
 ];
 return Object.freeze({
  status:'QUALIFICATION HOLD',gatewayReadCoverage:n(d.gatewayReadCoverage),
  candidates:n(q.candidateSourceCount),held:n(q.heldSourceCount),
  sources:Object.freeze(sources),checks:Object.freeze(checks),next:Object.freeze(next),
  forecast:'HOLD',optimizer:'HOLD',engineeringRelease:'HOLD',recovery:'HOLD',
  actionAuthorized:false,
  note:'Gateway retrievals and version/date hints are NOT proof of record freshness or engineering release.'
 });
}
