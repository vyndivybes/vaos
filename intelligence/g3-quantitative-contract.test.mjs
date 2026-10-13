import test from 'node:test';
import assert from 'node:assert/strict';
import {auditG3NumericSource, summarizeG3NumericAudits} from './g3-quantitative-contract.mjs';
import {createG3ReadinessHandler} from '../apps/web/api/jarvis-g3-readiness.mjs';
import {G3_REQUIRED_READS} from './g3-source-readiness.mjs';
import {createSessionToken,SESSION_COOKIE} from '../apps/web/lib/auth.mjs';

const examples=Object.freeze({
 PROCUREMENT:{records:[{sku:'T700-150',unit:'kg',required_quantity:'5.250',
   shortage_quantity:'2.250',bom_revision:'REV-5'}]},
 INVENTORY:{records:[{sku:'T700-150',unit:'kg',quantity_balance:'3.000',
   inventory_value_inr:'1200.00'}]},
 PRODUCTION:{records:[{id:'JOB-01',units:'2',bom_revision:'REV-5',
   status:'released',due_month:'2026-10'}]},
 ENGINEERING:{changeOrders:[{id:'ECO-1',status:'approved',record_revision:3}],
   baselines:[{id:'BL-1',status:'released',revision_code:'R5',bom_revision:'B5'}]}
});
test('G3.1D structurally validates canonical VYNDI bridge fields while withholding authority',()=>{
 for(const domain of ['PROCUREMENT','INVENTORY','PRODUCTION','ENGINEERING']){
  const a=auditG3NumericSource(domain,examples[domain]);
  assert.equal(a.status,'STRUCTURAL_CANDIDATE_UNCERTIFIED');
  assert.equal(a.sampledRows,1);
  assert.equal(a.structurallyValidRows,1);
  assert.equal(a.invalidRows,0);
  assert.equal(a.completeDatasetVerified,false);
  assert.equal(a.sourceRevisionVerified,false);
  assert.equal(a.quantityCertifiedForOptimization,false);
  assert.equal(a.productionReleaseCertified,false);
  assert.equal(a.actionAuthorized,false);
  assert.equal(a.sourceRecordFreshnessVerified,false);
  assert.doesNotMatch(JSON.stringify(a),/T700|1200|REV-5|JOB-01|ECO-1|BL-1|2026-10/);
 }
});
test('G3.1D rejects negative, noncanonical, mixed-unit, missing BOM and forged numbers',()=>{
 const bad=[
  ['PROCUREMENT',{records:[{sku:'ABC',unit:'kg',required_quantity:2,shortage_quantity:3,bom_revision:'R1'}]}],
  ['INVENTORY',{records:[{sku:'ABC',unit:'kg',quantity_balance:-3}]}],
  ['PRODUCTION',{records:[{id:'J',units:2.4,bom_revision:'B1',status:'released'}]}],
  ['ENGINEERING',{changeOrders:[],baselines:[{id:'X',status:'released',revision_code:'',bom_revision:'B1'}]}],
  ['PROCUREMENT',{records:[{sku:'ABC',unit:'kg',required_quantity:'1e9',shortage_quantity:1,bom_revision:'R1'}]}]
 ];
 for(const [domain,payload] of bad){
  const a=auditG3NumericSource(domain,payload);
  assert.equal(a.status,'FIELD_CONTRACT_HOLD');
  assert.equal(a.quantityCertifiedForOptimization,false);
 }
 const mixture=auditG3NumericSource('PROCUREMENT',{records:[
   examples.PROCUREMENT.records[0],{...examples.PROCUREMENT.records[0],unit:'g'}]});
 assert.equal(mixture.status,'FIELD_CONTRACT_HOLD');
 assert.equal(mixture.reasonCodes.includes('MIXED_UNCONVERTED_UNITS'),true);
});
test('G3.1D detects absent fields, unsupported payload envelopes and partial read limits',()=>{
 for(const domain of Object.keys(examples)){
  const empty=auditG3NumericSource(domain,
    domain==='ENGINEERING'?{changeOrders:[],baselines:[]}:{records:[]});
  assert.equal(empty.status,'NO_NUMERIC_ROWS_OBSERVED');
  assert.equal(empty.quantityCertifiedForOptimization,false);
  const unknown=auditG3NumericSource(domain,{summary:5,complete:true,records:null});
  assert.equal(unknown.status,'PAYLOAD_SHAPE_HOLD');
 }
 assert.equal(auditG3NumericSource('INVENTORY',{records:Array(51).fill(examples.INVENTORY.records[0])}).status,'PAYLOAD_SHAPE_HOLD');
 assert.throws(()=>auditG3NumericSource('FINANCE',examples.INVENTORY),/G3_NUMERIC_DOMAIN_INVALID/);
});
test('G3.1D aggregates only per-domain counts, not private values or usable numeric inputs',()=>{
 const items=Object.entries(examples).map(([domain,payload])=>auditG3NumericSource(domain,payload));
 const summary=summarizeG3NumericAudits(items);
 assert.equal(summary.status,'QUANTITATIVE_INPUT_QUALIFICATION_HOLD');
 assert.equal(summary.candidateSourceCount,4);
 assert.equal(summary.canRunRealDataOptimizer,false);
 assert.equal(summary.numericInputsQualified,false);
 assert.equal(summary.calibratedWithOutcomes,false);
 assert.ok(summary.holds.includes('INDEPENDENT_UNIT_AND_SOURCE_RECONCILIATION_REQUIRED'));
 assert.ok(summary.holds.includes('G2B_DATABASE_RESTORE_REQUIRED'));
 assert.throws(()=>summarizeG3NumericAudits([items[0],items[0]]),/G3_NUMERIC_BATCH_INVALID/);
});
test('G3.1D endpoint performs four existing reads, returns no source rows, always holds forecast',async()=>{
 const h=createG3ReadinessHandler({getReader:()=>({execute:async ({actionType})=>{
  const route=G3_REQUIRED_READS.find(r=>r.actionType===actionType);
  return {actionType,sourceAuthority:route.authority,data:examples[route.domain]};
 }}),now:()=>Date.parse('2026-10-13T08:00:00Z')});
 const req={method:'GET',url:'https://vaos.example/api/jarvis-g3-readiness',
  headers:{cookie:SESSION_COOKIE+'='+createSessionToken('shyamsundhar1982@gmail.com')},
  env:{VAOS_VOICE_CONTROL:'founder-readonly-browser-v1'}};
 const state={status:200,data:null};
 const res={setHeader(){return res},status(n){state.status=n;return res},json(v){state.data=v;return res}};
 await h(req,res);
 assert.equal(state.status,200);
 assert.equal(state.data.data.quantitativeDiagnostics.candidateSourceCount,4);
 assert.equal(state.data.data.quantitativeDiagnostics.canRunRealDataOptimizer,false);
 assert.equal(state.data.data.status,'INPUT_QUALIFICATION_HOLD');
 assert.equal(state.data.data.actionAuthorized,false);
 assert.doesNotMatch(JSON.stringify(state.data),/T700-150|1200.00|REV-5|JOB-01|ECO-1|BL-1/);
});
test('G3.1D does not accept source-supplied self-certification or claim unbounded dataset complete',()=>{
 const payload={...examples.PROCUREMENT,complete:true,pagination:{hasMore:false},
  certified:true,sourceRevisionVerified:true,sourceRecordFreshnessVerified:true};
 const x=auditG3NumericSource('PROCUREMENT',payload);
 assert.equal(x.status,'STRUCTURAL_CANDIDATE_UNCERTIFIED');
 assert.equal(x.completeDatasetVerified,false);
 assert.equal(x.sourceRevisionVerified,false);
 assert.equal(x.quantityCertifiedForOptimization,false);
});
