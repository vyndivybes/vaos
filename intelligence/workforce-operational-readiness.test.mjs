import test from 'node:test';
import assert from 'node:assert/strict';
import {assessWorkforceOperationalReadiness} from './workforce-operational-readiness.mjs';

const asOf='2026-10-13T12:00:00.000Z';
const row=(id,stamp,q=3,status='PASS')=>({
 id,qualificationLevel:q,qualificationAssessment:{status},
 lastVerifiedActivityAt:stamp,
 lifecycle:'ACTIVE',audit:{status:'UNVERIFIED_NO_REVIEW_LEDGER',passed:null}
});
test('a recorded heartbeat never certifies operational runtime or agent action',()=>{
 const x=assessWorkforceOperationalReadiness([
  row('production','2026-10-13T11:00:00.000Z'),
  row('qa','2026-10-11T08:00:00.000Z'),
  row('project',null,2)
 ],asOf);
 assert.equal(x.recentHeartbeatRecords24h,1);
 assert.equal(x.staleHeartbeatRecords24h,1);
 assert.equal(x.missingOrInvalidHeartbeats,1);
 assert.equal(x.assessmentsMarkedPass,3);
 assert.equal(x.atLeastQ3Recorded,2);
 assert.equal(x.operationalRuntimeCertified,false);
 assert.equal(x.agentDispatchAuthorized,false);
 assert.equal(x.employees[0].heartbeatStatus,'RECENT_HEARTBEAT_RECORD_ONLY');
 assert.equal(x.employees[1].heartbeatStatus,'STALE_HEARTBEAT_RECORD');
 assert.equal(x.employees[2].heartbeatStatus,'HEARTBEAT_MISSING_OR_INVALID');
 assert.equal(x.employees[0].runtimeVerified,false);
 assert.equal(x.employees[0].independentAuditVerified,false);
});
test('future timestamps fail closed rather than seeming recent',()=>{
 const x=assessWorkforceOperationalReadiness([row('security','2026-10-14T00:00:00.000Z',4)],asOf);
 assert.equal(x.recentHeartbeatRecords24h,0);
 assert.equal(x.invalidFutureHeartbeats,1);
 assert.equal(x.employees[0].heartbeatStatus,'HEARTBEAT_MISSING_OR_INVALID');
 assert.equal(x.operationalRuntimeCertified,false);
});
test('assessment pass and lifecycle ACTIVE do not constitute independent audit',()=>{
 const x=assessWorkforceOperationalReadiness([
  row('engineering-configuration','2026-10-13T10:00:00.000Z',4)
 ],asOf);
 assert.equal(x.assessmentsMarkedPass,1);
 assert.equal(x.independentlyAuditedEmployees,0);
 assert.equal(x.employees[0].independentAuditVerified,false);
 assert.equal(x.employees[0].productionWriteAuthorized,false);
});
test('reject duplicate employees or time and invalid coverage',()=>{
 assert.throws(()=>assessWorkforceOperationalReadiness([row('qa',null),row('qa',null)],asOf));
 assert.throws(()=>assessWorkforceOperationalReadiness([], 'not a time'));
 assert.throws(()=>assessWorkforceOperationalReadiness(Array(17).fill(row('qa',null)),asOf));
});
