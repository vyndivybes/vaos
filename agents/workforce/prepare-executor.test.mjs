import test from 'node:test';
import assert from 'node:assert/strict';
import {executePreparedRole,PREPARED_ROLE_IDS,sourceHash} from './prepare-executor.mjs';
import {exerciseSource,EXERCISE_ORDER} from '../../platform/qualification/workforce-exercise-cases.mjs';
const expected={
 security:['DENY',['CAPABILITY_DENIED:PAY']],orchestrator:['HOLD',['OWNER_UNAVAILABLE:project']],
 project:['HOLD',['TASK_OVERDUE']],vibpe:['HOLD',['CONFIGURATION_MISMATCH','ALLOWABLES_EVIDENCE_MISSING']],
 qa:['HOLD',['MEASUREMENT_OUTSIDE_LIMITS','RETEST_EVIDENCE_MISSING']],risk:['HOLD',['RISK_EXCEEDS_SUPPLIED_TOLERANCE']],
 knowledge:['HOLD',['SOURCE_REVISION_CONFLICT','SOURCE_STALE']],release:['HOLD',['GATE_EVIDENCE_MISSING:ENGINEERING','ENGINEERING_HOLD']],
 commercial:['HOLD',['CANCELLED_ORDER_NOT_DEMAND']],procurement:['HOLD',['QUOTE_UNIT_MISMATCH']],inventory:['HOLD',['NEGATIVE_AVAILABLE_STOCK']],
 production:['HOLD',['CANCELLED_JOB_NOT_DEMAND','ENGINEERING_RELEASE_MISSING','QUALITY_HOLD','MATERIAL_SHORTAGE']],
 maintenance:['HOLD',['MAINTENANCE_OVERDUE','CALIBRATION_EVIDENCE_MISSING']],finance:['HOLD',['LEDGER_UNBALANCED','THREE_WAY_MATCH_FAILED']],
 people:['HOLD',['ATTENDANCE_EXCEEDS_APPROVED_DAYS','COMPENSATION_APPROVAL_MISSING']],
 'engineering-configuration':['HOLD',['CONFIGURATION_MISMATCH','BOM_REVISION_MISMATCH','EFFECTIVITY_UNAPPROVED','ENGINEERING_HOLD']],
};
for(const id of EXERCISE_ORDER)test(id+' processes challenge and corrected evidence without releasing authority',()=>{
 const source=exerciseSource(id,'challenge'),before=structuredClone(source);
 const result=executePreparedRole({employeeId:id,source});
 assert.equal(result.decision,expected[id][0]);assert.deepEqual(result.findings,expected[id][1]);assert.deepEqual(source,before);
 const corrected=executePreparedRole({employeeId:id,source:exerciseSource(id,'corrected')});
 const held=['release','production','engineering-configuration'].includes(id);
 assert.equal(corrected.decision,held?'HOLD':'PREPARE');
 for(const r of [result,corrected]){
  assert.equal(r.qualificationGranted,false);assert.equal(r.operationallyQualified,false);assert.equal(r.modelInvoked,false);
  assert.equal(r.productionWriteAuthorized,false);assert.equal(r.businessEffectsExecuted,false);assert.equal(r.engineeringReleaseGranted,false);
  assert.equal(r.handoff.dispatched,false);assert.equal(r.handoff.independentReview,'REQUIRED');
 }
 assert.equal(result.source.sha256,sourceHash(source));assert.notEqual(result.source.sha256,corrected.source.sha256);
});
test('independent expected departmental arithmetic and decisions',()=>{
 const run=id=>executePreparedRole({employeeId:id,source:exerciseSource(id,'corrected')});
 assert.equal(run('commercial').result.proposedAmountPaise,375);
 assert.equal(run('procurement').result.shortage,7);assert.equal(run('procurement').result.proposedCostPaise,700);
 assert.equal(run('inventory').result.onHand,4);assert.equal(run('inventory').result.available,1);
 assert.equal(run('finance').result.differencePaise,0);assert.equal(run('people').result.proposedPayPaise,1800);
 assert.equal(run('orchestrator').result.plan.workPackages[0].ownerAgentId,'project');
 assert.equal(run('qa').result.conforms,true);assert.equal(run('risk').result.score,5);
});
test('source tampering, production classification and extra fields fail closed',()=>{
 for(const employeeId of PREPARED_ROLE_IDS){
  const source=exerciseSource(employeeId,'challenge');
  assert.throws(()=>executePreparedRole({employeeId,source:{...source,classification:'PRODUCTION'}}),/ROLE_SOURCE_INVALID/);
  assert.throws(()=>executePreparedRole({employeeId,source:{...source,record:{...source.record,execute:true}}}),/ROLE_SOURCE_INVALID/);
  assert.throws(()=>executePreparedRole({employeeId,source:{...source,record:{}}}),/ROLE_SOURCE_INVALID/);
 }
});
test('Security invalid session denies even a granted capability; Orchestrator retains unmet dependency',()=>{
 const source=exerciseSource('security','corrected');source.record.sessionValid=false;
 assert.equal(executePreparedRole({employeeId:'security',source}).decision,'DENY');
 const planSource=exerciseSource('orchestrator','corrected');
 planSource.record.requestedJobs=['ENGINEERING.ASSESS_CHANGE'];planSource.record.availableOwners=['vibpe'];
 const r=executePreparedRole({employeeId:'orchestrator',source:planSource});
 assert.equal(r.decision,'HOLD');assert.ok(r.findings.some(x=>x.startsWith('PREREQUISITE_PENDING:')));
});
test('case order starts with Security and Orchestrator and contains sixteen unique identities',()=>{
 assert.deepEqual(EXERCISE_ORDER.slice(0,2),['security','orchestrator']);assert.equal(new Set(EXERCISE_ORDER).size,16);
 assert.deepEqual([...EXERCISE_ORDER].sort(),Object.keys(expected).sort());
});
