import test from 'node:test';
import assert from 'node:assert/strict';
import {selectDataAgentSources} from './data-agent-report.mjs';
import {buildDataAgentInvestigation} from './data-agent-investigation.mjs';
import {buildDataAgentReport} from './data-agent-report.mjs';

const records={
 procurement:{records:[
  {sku:'SECRET-SKU-A',unit:'pcs',sales_order_id:'PRIVATE-ORDER-A',
   bom_revision:'BOM-A',required_quantity:4,shortage_quantity:2},
  {sku:'SECRET-SKU-B',unit:'kg',sales_order_id:'PRIVATE-ORDER-B',
   bom_revision:'BOM-B',required_quantity:3,shortage_quantity:1}]},
 inventory:{records:[{sku:'SECRET-SKU-A',unit:'kg',quantity_balance:8}]},
 production:{records:[{id:'PRIVATE-JOB',sales_order_id:'PRIVATE-ORDER-A',
  bom_revision:'BOM-OLD',status:'released',units:1,approved_at:null}]},
 engineering:{baselines:[{id:'PRIVATE-BASE',status:'released',revision_code:'REV1',bom_revision:null}],
  changeOrders:[]}
};
const observed=Object.entries(records).map(([domain,data])=>({domain,status:'OBSERVED',data}));
test('business delay and root cause questions discover the four existing crosswalk sources',()=>{
 assert.deepEqual(selectDataAgentSources('Why is production delayed?').domains,
  ['procurement','inventory','production','engineering']);
 assert.equal(selectDataAgentSources('Why is production delayed?').investigate,true);
 assert.equal(selectDataAgentSources('Find the root cause of material shortages').investigate,true);
 assert.equal(selectDataAgentSources('Analyse finance and procurement').investigate,false);
 assert.equal(selectDataAgentSources('Why is our financial position weak?').investigate,false);
 assert.equal(selectDataAgentSources('Please approve a job card').status,'DENIED');
});
test('existing G3.1E crosswalk reveals actual observed revision, unit and provenance discrepancies without raw identifiers',()=>{
 const result=buildDataAgentInvestigation({question:'Why is production delayed?',observations:observed});
 assert.equal(result.schemaVersion,'VAOS_DATA_AGENT_INVESTIGATION_V1');
 assert.equal(result.status,'BOUNDED_EVIDENCE');
 assert.equal(result.actionAuthorized,false);
 assert.equal(result.causalProofEstablished,false);
 assert.equal(result.completeDatasetVerified,false);
 assert.equal(result.findings.find(x=>x.code==='OBSERVED_JOB_BOM_REVISION_CONFLICT')?.observedCount,1);
 assert.equal(result.findings.find(x=>x.code==='OBSERVED_SKU_UNIT_RELATION_UNRECONCILED')?.observedCount,1);
 assert.equal(result.findings.find(x=>x.code==='PRODUCTION_RELEASE_APPROVAL_TIMESTAMP_UNOBSERVED')?.observedCount,1);
 assert.equal(result.findings.find(x=>x.code==='RELEASED_ENGINEERING_BASELINES_WITHOUT_BOM')?.observedCount,1);
 assert.equal(result.findings.find(x=>x.code==='INVENTORY_SKU_NOT_IN_SAMPLE')?.classification,'SAMPLE_COVERAGE_GAP');
 assert.ok(result.findings.every(x=>x.action&&x.sourceDomains.length>0));
 const text=JSON.stringify(result);
 for(const raw of ['SECRET-SKU-A','PRIVATE-ORDER-A','BOM-OLD','PRIVATE-JOB','PRIVATE-BASE'])
  assert.ok(!text.includes(raw),raw);
 assert.match(result.summary,/not proven causes/i);
 assert.equal(result.causalProofEstablished,false);
});
test('missing or malformed linked observations result in HOLD, not an empty green pass',()=>{
 for(const sample of [
  observed.filter(x=>x.domain!=='inventory'),
  observed.map(x=>x.domain==='production'?{...x,status:'HOLD',data:null}:x),
  observed.map(x=>x.domain==='procurement'?{...x,data:{records:'not an array'}}:x),
 ]){
  const result=buildDataAgentInvestigation({question:'Find blockers',observations:sample});
  assert.equal(result.status,'SOURCE_HOLD');
  assert.equal(result.findings.length,0);
  assert.equal(result.causalProofEstablished,false);
  assert.ok(result.holds.length>0);
 }
});
test('no crosswalk discrepancy in a bounded sample is not a conclusion of zero business risk',()=>{
 const same={
  procurement:{records:[{sku:'SKU',unit:'pcs',sales_order_id:'ORDER',bom_revision:'B1'}]},
  inventory:{records:[{sku:'SKU',unit:'pcs'}]},
  production:{records:[{id:'JOB',sales_order_id:'ORDER',bom_revision:'B1',status:'draft'}]},
  engineering:{baselines:[{id:'B1',status:'draft',bom_revision:null}],changeOrders:[]}
 };
 const report=buildDataAgentInvestigation({question:'Why are orders delayed?',
  observations:Object.entries(same).map(([domain,data])=>({domain,status:'OBSERVED',data}))});
 assert.equal(report.status,'BOUNDED_EVIDENCE');
 assert.equal(report.findings.length,0);
 assert.match(report.summary,/No discrepancy detected within the selected rows/);
 assert.match(report.summary,/not proof/);
});

test('founder brief prioritizes concrete prelaunch reconciliation above larger sample-only counts',()=>{
 const report=buildDataAgentInvestigation({question:'Why is production delayed?',observations:observed});
 assert.equal(report.operatingContext.phase,'PRELAUNCH_CONFIGURATION');
 assert.equal(report.operatingContext.recordOrigin,'UNVERIFIED');
 assert.equal(report.operatingContext.actualProductionIncidentConfirmed,false);
 assert.equal(report.decisionBrief.phase,'PRELAUNCH');
 assert.equal(report.decisionBrief.priority,'RECONCILE_SOURCE_CONFLICT');
 assert.match(report.decisionBrief.nextStep,/BOM revision|stock unit/i);
 assert.equal(report.findings[0].classification,'OBSERVED_DISCREPANCY');
 const inventoryGap=report.findings.find(f=>f.code==='INVENTORY_SKU_NOT_IN_SAMPLE');
 assert.equal(inventoryGap.reviewPriority,'CHECK_SOURCE_COVERAGE');
 assert.equal(inventoryGap.operationalImpactVerified,false);
 assert.ok(report.findings.indexOf(inventoryGap)>report.findings.findIndex(f=>f.code==='PRODUCTION_RELEASE_APPROVAL_TIMESTAMP_UNOBSERVED'));
 assert.match(report.decisionBrief.explanation,/not proof of a live production delay/i);
});
test('each finding supplies bounded anonymous sample positions and never source values or stable record identifiers',()=>{
 const report=buildDataAgentInvestigation({question:'Why is production delayed?',observations:observed});
 const bom=report.findings.find(x=>x.code==='OBSERVED_JOB_BOM_REVISION_CONFLICT');
 assert.deepEqual(bom.evidenceTrail[0].rows,[{domain:'procurement',collection:'records',position:1},
  {domain:'production',collection:'records',position:1}]);
 const units=report.findings.find(x=>x.code==='OBSERVED_SKU_UNIT_RELATION_UNRECONCILED');
 assert.deepEqual(units.evidenceTrail[0].rows.map(x=>x.domain),['procurement','inventory']);
 const gap=report.findings.find(x=>x.code==='INVENTORY_SKU_NOT_IN_SAMPLE');
 assert.deepEqual(gap.evidenceTrail[0].rows,[{domain:'procurement',collection:'records',position:2}]);
 const released=report.findings.find(x=>x.code==='RELEASED_ENGINEERING_BASELINES_WITHOUT_BOM');
 assert.equal(released.evidenceTrail[0].rows[0].collection,'baselines');
 for(const finding of report.findings){
  assert.ok(finding.evidenceTrail.length<=5);
  assert.ok(finding.evidenceTrail.every(x=>x.sampleOnly===true));
  assert.equal(finding.operationalImpactVerified,false);
 }
 assert.equal(JSON.stringify(report).includes('SECRET-SKU'),false);
 assert.equal(JSON.stringify(report).includes('PRIVATE-ORDER'),false);
 assert.equal(JSON.stringify(report).includes('BOM-OLD'),false);
});
test('a large missing sample count cannot become a critical incident or fabricated material shortage',()=>{
 const a=Array.from({length:50},(_,i)=>({sku:'MAT'+i,unit:'pcs',
  sales_order_id:'ORD'+i,bom_revision:'B1',required_quantity:2,shortage_quantity:1}));
 const report=buildDataAgentInvestigation({question:'Why is production delayed?',observations:[
  {domain:'procurement',status:'OBSERVED',data:{records:a}},
  {domain:'inventory',status:'OBSERVED',data:{records:[]}},
  {domain:'production',status:'OBSERVED',data:{records:[]}},
  {domain:'engineering',status:'OBSERVED',data:{baselines:[],changeOrders:[]}}
 ]});
 assert.equal(report.decisionBrief.priority,'CHECK_SOURCE_COVERAGE');
 assert.equal(report.findings[0].code,'INVENTORY_SKU_NOT_IN_SAMPLE');
 assert.equal(report.findings[0].reviewPriority,'CHECK_SOURCE_COVERAGE');
 assert.equal(report.findings[0].evidenceTrail.length,5);
 assert.match(report.decisionBrief.explanation,/not proof of a live production delay/i);
});
test('hold states retain prelaunch context without inventing root causes or record-level traces',()=>{
 const report=buildDataAgentInvestigation({question:'Why is production delayed?',observations:[]});
 assert.equal(report.status,'SOURCE_HOLD');
 assert.equal(report.operatingContext.actualProductionIncidentConfirmed,false);
 assert.equal(report.decisionBrief.priority,'RESTORE_SOURCE_OBSERVATIONS');
 assert.equal(report.findings.length,0);
});

test('charts compare number of findings rather than incomparable or overlapping record counts',()=>{
 const report=buildDataAgentInvestigation({question:'Why is production delayed?',observations:observed});
 assert.match(report.chart.title,/types of findings/i);
 assert.ok(report.chart.rows.every(x=>x.value<=report.findings.length));
 assert.equal(report.chart.unit,'finding_types');
 const answer=buildDataAgentReport({question:'Why is production delayed?',
  observations:observed.map(({domain,status})=>({domain,status,authority:'signed-gateway',
   count:domain==='engineering'?1:2})),investigation:report});
 assert.match(answer.answer,/FOUNDER BRIEF.*PRELAUNCH/s);
 assert.match(answer.answer,/Next preparation step/i);
 assert.equal(answer.readOnly,true);
 assert.equal(answer.forecastQualified,false);
 assert.deepEqual(answer.investigation.decisionBrief,report.decisionBrief);
 assert.match(answer.answer,/\[1\]/);
});

test('founder brief is concise and provides preparation steps without treating draft engineering as approved',()=>{
 const report=buildDataAgentInvestigation({question:'Why is production delayed?',observations:observed});
 assert.ok(report.decisionBrief.explanation);
 assert.doesNotMatch(report.decisionBrief.explanation,/recorded recorded/i);
 assert.equal(report.decisionBrief.priority,'RECONCILE_SOURCE_CONFLICT');
 assert.ok(report.decisionBrief.preparationSteps.length>=2);
 assert.ok(report.decisionBrief.preparationSteps.every(x=>typeof x==='string'&&x.length>20));
 assert.match(report.decisionBrief.preparationSteps.join(' '),/approved|revision|engineering/i);
 assert.equal(report.decisionBrief.recordWritePermitted,false);
});
test('prelaunch missing BOM has a safe checklist rather than prompting fake engineering release',()=>{
 const noConflict=observed.map(o=>
  o.domain==='procurement'?{...o,data:{records:[]}}:
  o.domain==='inventory'?{...o,data:{records:[]}}:
  o.domain==='production'?{...o,data:{records:[]}}:o);
 const result=buildDataAgentInvestigation({question:'Why is production delayed?',observations:noConflict});
 assert.equal(result.decisionBrief.priority,'COMPLETE_RELEASE_TRACE');
 assert.equal(result.decisionBrief.recordWritePermitted,false);
 assert.match(result.decisionBrief.preparationSteps.join(' '),/not.*(invent|assume)|without.*approv|draft/i);
 assert.match(result.decisionBrief.preparationSteps.join(' '),/VEDM/i);
});
