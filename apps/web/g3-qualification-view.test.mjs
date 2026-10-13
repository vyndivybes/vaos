import test from 'node:test';
import assert from 'node:assert/strict';
import {createG3QualificationView} from './g3-qualification-view.mjs';
function fixture(){
 const d=['PROCUREMENT','INVENTORY','PRODUCTION','ENGINEERING'];
 return {data:{
  schemaVersion:'G3_1_AUTHORITY_READINESS_V1',actionAuthorized:false,agentDispatchAuthorized:false,
  canRunRealDataOptimizer:false,productionForecastCertified:false,gatewayReadCoverage:4,
  sources:d.map(domain=>({domain,status:'OBSERVED',gatewayReceipt:'RECENT_GATEWAY_READ',sourceRevisionVerified:false,sourceDataFreshnessVerified:false})),
  quantitativeDiagnostics:{
   schemaVersion:'G3_1D_NUMERIC_QUALIFICATION_V1',actionAuthorized:false,agentDispatchAuthorized:false,
   candidateSourceCount:3,heldSourceCount:1,
   sources:d.map((domain,i)=>({domain,schemaVersion:'G3_1D_NUMERIC_SOURCE_AUDIT_V1',actionAuthorized:false,
    sourceRevisionVerified:false,completeDatasetVerified:false,sampledRows:[47,1,4,3][i],
    structurallyValidRows:[47,1,4,0][i],status:i===3?'FIELD_CONTRACT_HOLD':'STRUCTURAL_CANDIDATE_UNCERTIFIED'}))
  },
  crossSourceDiagnostics:{schemaVersion:'G3_1E_SOURCE_CROSSWALK_V1',actionAuthorized:false,agentDispatchAuthorized:false,canRunRealDataOptimizer:false,
   counts:{procurementSampleRows:47,shortageRowsWithoutObservedInventorySku:46,
    shortageRowsWithIncompatibleObservedInventoryUnit:0,shortageRowsWithoutObservedLinkedJobCard:0,
    shortageRowsWithObservedJobBomConflict:0,releasedBaselinesWithoutBom:3}},
  sourceProvenanceDiagnostics:{schemaVersion:'G3_1E_PROVENANCE_PREFLIGHT_V1',actionAuthorized:false,agentDispatchAuthorized:false,canRunRealDataOptimizer:false,
   domains:d.map(domain=>({domain,revisionHintRows:1,timeHintRows:0,unitHintRows:1,sampleAtLimit:false,
    sourceRevisionVerified:false,completeDatasetVerified:false}))}
 }};
}
test('G3 view displays four source observations without claiming qualified release',()=>{
 const x=createG3QualificationView(fixture());
 assert.equal(x.sources.length,4);
 assert.equal(x.sources[0].structural,'Schema candidate only');
 assert.equal(x.sources[3].structural,'HOLD');
 assert.equal(x.sources[3].sampled,3);
 assert.equal(x.checks[1].value,46);
 assert.equal(x.checks[5].value,3);
 assert.equal(x.forecast,'HOLD');
 assert.equal(x.actionAuthorized,false);
 assert.ok(x.next.some(text=>text.includes('missing BOM')));
});
test('G3 view denies forged authorization, forecast or provenance proof',()=>{
 const mutations=[
  x=>x.data.actionAuthorized=true,
  x=>x.data.productionForecastCertified=true,
  x=>x.data.crossSourceDiagnostics.canRunRealDataOptimizer=true,
  x=>x.data.quantitativeDiagnostics.sources[1].sourceRevisionVerified=true,
  x=>x.data.sourceProvenanceDiagnostics.domains[0].completeDatasetVerified=true,
  x=>x.data.sourceProvenanceDiagnostics.schemaVersion='UNKNOWN'
 ];
 for(const change of mutations){const input=fixture();change(input);
  assert.throws(()=>createG3QualificationView(input),/UNVERIFIED/);}
});
test('G3 view hides untrusted counts and identifiers',()=>{
 const input=fixture();
 input.data.crossSourceDiagnostics.counts.releasedBaselinesWithoutBom='3<script>';
 input.data.sources[0].sourceFile='SECRET-CUSTOMER-01';
 const x=createG3QualificationView(input);
 assert.equal(x.checks[5].value,null);
 assert.doesNotMatch(JSON.stringify(x),/SECRET-CUSTOMER|script/);
});
test('G3 view rejects missing and incomplete authorization projection',()=>{
 const one=fixture();delete one.data.crossSourceDiagnostics;
 assert.throws(()=>createG3QualificationView(one),/UNVERIFIED/);
 const two=fixture();two.data.sources.pop();
 assert.throws(()=>createG3QualificationView(two),/UNVERIFIED/);
});
