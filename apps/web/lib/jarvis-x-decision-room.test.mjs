import test from 'node:test';import assert from 'node:assert/strict';
import {buildEvidenceGraph,optimizeReviewQueue,planGovernedAgentReviews,createJarvisXPreview} from './jarvis-x-decision-room.mjs';
const sample=[
 {tool:'PROCUREMENT',status:'OBSERVED',summary:'47 shortage lines; Customer Email PRIVATE@example.com',sourceAuthority:'getConfiguredDemandShortages'},
 {tool:'PRODUCTION',status:'OBSERVED',summary:'4 job cards',sourceAuthority:'getProductionJobCards'},
 {tool:'ENGINEERING',status:'HOLD',summary:'Engineering unavailable or incomplete.',sourceAuthority:null},
];
test('knowledge graph includes only selected governed source domains and labels inferred relations as hypotheses',()=>{
 const graph=buildEvidenceGraph(sample);
 assert.equal(graph.nodes.length,3);assert.equal(graph.nodes[0].status,'OBSERVED');
 assert.equal(graph.nodes[0].authority,'getConfiguredDemandShortages');
 assert.equal(graph.nodes[2].authority,null);
 assert.ok(graph.edges.some(e=>e.from==='PROCUREMENT'&&e.to==='PRODUCTION'));
 assert.ok(graph.edges.every(e=>e.assurance==='UNVERIFIED_DEPENDENCY_HYPOTHESIS'));
 assert.equal(graph.graphAuthority,'TRANSIENT_SOURCE_STATUS_ONLY');
 assert.doesNotMatch(JSON.stringify(graph),/PRIVATE@example\.com|47 shortage lines|job cards/);
 assert.equal(graph.holdCount,1);
});
test('knowledge graph fails closed for unsupported tool names and forged status/authority',()=>{
 for(const rows of [
  [{tool:'EXECUTE_PAYMENT',status:'OBSERVED',sourceAuthority:'none'}],
  [{tool:'FINANCE',status:'OBSERVED',sourceAuthority:''}],
  [{tool:'FINANCE',status:'FRAUD',sourceAuthority:'ledger'}],
  [...sample,sample[0]], 
 ])assert.throws(()=>buildEvidenceGraph(rows),/JARVIS_X_EVIDENCE_INVALID/);
});
test('constraint optimizer selects globally best bounded review subset, not greedy top-ranked single item',()=>{
 const actions=[
  {id:'A',reviewCost:2,priority:7,owner:'FINANCE',evidenceStatus:'OBSERVED'},
  {id:'B',reviewCost:1,priority:4,owner:'PRODUCTION',evidenceStatus:'OBSERVED'},
  {id:'C',reviewCost:1,priority:4,owner:'PROCUREMENT',evidenceStatus:'OBSERVED'}
 ];
 const p=optimizeReviewQueue(actions,{reviewSlots:2});
 assert.deepEqual(p.selected.map(x=>x.id),['B','C']);
 assert.equal(p.totalPriority,8);assert.equal(p.selectedReviewUnits,2);
 assert.equal(p.monetaryForecastCertified,false);
 assert.equal(p.executionAuthorized,false);
 assert.equal(p.objectiveType,'HEURISTIC_REVIEW_PRIORITY_ONLY');
});
test('constraint optimizer refuses external attacker-supplied giant capacity, negative costs and unsupported payloads',()=>{
 assert.throws(()=>optimizeReviewQueue([{id:'PAY',reviewCost:-1,priority:100,owner:'FINANCE',evidenceStatus:'OBSERVED'}]),/JARVIS_X_OPTIMIZATION_INVALID/);
 assert.throws(()=>optimizeReviewQueue([], {reviewSlots:999}),/JARVIS_X_OPTIMIZATION_INVALID/);
 assert.throws(()=>optimizeReviewQueue([{id:'SCRIPT',reviewCost:1,priority:1,owner:'EXECUTOR',evidenceStatus:'OBSERVED'}]),/JARVIS_X_OPTIMIZATION_INVALID/);
});
test('governed coordinator assigns proposed qualified roles only; never dispatches DEs or changes policies',()=>{
 const graph=buildEvidenceGraph(sample);
 const plan=planGovernedAgentReviews(graph);
 assert.equal(plan.operation,'PROPOSE_ONLY');
 assert.equal(plan.dispatchedAgents,0);
 assert.equal(plan.authorizedWrites,0);
 assert.ok(plan.reviews.some(x=>x.domain==='ENGINEERING'&&x.evidenceStatus==='HOLD'));
 assert.ok(plan.reviews.every(x=>x.assignment==='NOT_DISPATCHED'&&x.qualification==='UNVERIFIED'));
 assert.ok(plan.reviews.every(x=>!/(PAY|EXECUTE|APPROVE)/.test(x.id)));
});
test('no observed source means decision-room HOLD rather than fabricated plan or optimized manufacturing result',()=>{
 const out=createJarvisXPreview({observations:[{tool:'FINANCE',status:'HOLD',summary:'finance unavailable'}]});
 assert.equal(out.status,'HOLD');
 assert.deepEqual(out.optimization.selected,[]);
 assert.equal(out.actionAuthorized,false);
 assert.equal(out.simulationOnly,true);
 assert.match(out.brief,/HOLD/);
});
test('coherent observed evidence yields read-only review optimization, not production math or autonomy',()=>{
 const out=createJarvisXPreview({observations:sample,reviewSlots:2});
 assert.equal(out.status,'REVIEW_PREVIEW');
 assert.equal(out.evidenceGraph.holdCount,1);
 assert.equal(out.optimization.reviewSlots,2);
 assert.ok(out.optimization.selected.length<=2);
 assert.equal(out.coordination.dispatchedAgents,0);
 assert.equal(out.qualifiedForProductionOptimization,false);
 assert.equal(out.extraModelCalls,0);
 assert.equal(out.extraNetworkCalls,0);
 assert.equal(out.actionAuthorized,false);
 assert.ok(out.brief.length<=560);
 assert.match(out.brief,/hypothetical|simulation/i);
 assert.doesNotMatch(JSON.stringify(out),/PRIVATE@example\.com/);
});

test('JARVIS X does not quietly treat untimestamped source counts as fresh or independently verified',()=>{
 const x=createJarvisXPreview({observations:sample});
 assert.equal(x.evidenceFreshness,'UNVERIFIED');
 assert.equal(x.evidenceGraph.temporalAuthority,'NO_TRUSTED_SOURCE_TIMESTAMPS');
 assert.equal(x.productionPlanningEligible,false);
 assert.match(x.brief,/freshness not verified/i);
});
test('JARVIS X preserves source HOLDs as explicit blockers and does not rank those roles as independently qualified',()=>{
 const x=createJarvisXPreview({observations:sample});
 assert.deepEqual(x.unresolvedDomains,['ENGINEERING']);
 assert.equal(x.coordination.reviews.find(q=>q.domain==='ENGINEERING').assignment,'NOT_DISPATCHED');
 assert.equal(x.optimization.selected.some(q=>q.owner==='ENGINEERING'),false);
 assert.equal(x.autonomousOperationsEnabled,false);
});
test('JARVIS X review queue lists transparent limitations instead of manufacturing schedule confidence',()=>{
 const x=createJarvisXPreview({observations:sample,reviewSlots:2});
 assert.ok(x.limitations.includes('NO_REAL_COST_OR_CAPACITY_OPTIMIZATION'));
 assert.ok(x.limitations.includes('NO_CAUSAL_PROOF'));
 assert.ok(x.limitations.includes('SOURCE_FRESHNESS_UNVERIFIED'));
 assert.equal(x.optimization.capacityForecastCertified,false);
});

test('G2a relation IDs are stable, versioned and cannot imply a verified cause',()=>{
 const a=buildEvidenceGraph(sample);
 const b=buildEvidenceGraph([...sample].reverse());
 assert.equal(a.relationSchemaVersion,'SOURCE_RELATIONS_V1');
 assert.deepEqual(a.edges.map(x=>x.relationId).sort(),b.edges.map(x=>x.relationId).sort());
 assert.ok(a.edges.every(x=>/^rel:v1:[A-Z_]+:[A-Z_]+$/.test(x.relationId)));
 assert.ok(a.edges.every(x=>x.assurance==='UNVERIFIED_DEPENDENCY_HYPOTHESIS'));
 assert.equal(a.sourceRecordsPersisted,false);
});
test('G2a distinguishes gateway-read receipt recency from source-data freshness',()=>{
 const stamp='2026-10-13T01:00:00.000Z',clock=Date.parse('2026-10-13T01:02:00Z');
 const result=createJarvisXPreview({observations:[
  {...sample[0],gatewayReadAt:stamp},
  {...sample[1],gatewayReadAt:stamp},
  sample[2]
 ],reviewSlots:2,now:clock});
 assert.equal(result.evidenceGraph.nodes[0].gatewayReceipt.status,'RECENT_GATEWAY_READ');
 assert.equal(result.evidenceGraph.nodes[0].gatewayReceipt.at,stamp);
 assert.equal(result.evidenceGraph.nodes[0].sourceUpdatedAt,null);
 assert.equal(result.evidenceGraph.temporalAuthority,'GATEWAY_READ_RECEIPTS_ONLY');
 assert.equal(result.evidenceFreshness,'UNVERIFIED');
 assert.equal(result.provenanceReadiness,'RECENT_GATEWAY_RECEIPTS_ONLY');
 assert.equal(result.productionPlanningEligible,false);
 assert.equal(result.sourceDataFreshnessCertified,false);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE@example.com|47 shortage lines/);
});
test('G2a rejects forged, impossible or stale receipts without inferring real source freshness',()=>{
 const now=Date.parse('2026-10-13T01:02:00Z');
 for(const stamp of ['2099-01-01T00:00:00.000Z','yesterday',
  '2026-10-13T00:01:00.000Z']){
  const result=createJarvisXPreview({observations:[{...sample[0],gatewayReadAt:stamp}],now});
  assert.notEqual(result.evidenceGraph.nodes[0].gatewayReceipt.status,'RECENT_GATEWAY_READ');
  assert.equal(result.provenanceReadiness,'READ_RECEIPTS_PARTIAL_OR_STALE');
  assert.equal(result.sourceDataFreshnessCertified,false);
 }
});
test('G2a never displays a HOLD source as confirmed fresh or qualified for agent task dispatch',()=>{
 const r=createJarvisXPreview({observations:[
  {...sample[0],gatewayReadAt:'2026-10-13T01:00:00.000Z'},
  {...sample[1],gatewayReadAt:'2026-10-13T01:00:00.000Z'},
  {...sample[2],gatewayReadAt:'2026-10-13T01:00:00.000Z'}
 ],now:Date.parse('2026-10-13T01:01:00Z')});
 assert.equal(r.evidenceGraph.nodes[2].gatewayReceipt.status,'NO_OBSERVED_RECEIPT');
 assert.equal(r.unresolvedDomains.includes('ENGINEERING'),true);
 assert.equal(r.coordination.dispatchedAgents,0);
 assert.equal(r.actionAuthorized,false);
});
