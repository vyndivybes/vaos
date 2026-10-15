import test from 'node:test';import assert from 'node:assert/strict';
import {workActivityReport,periodBounds} from './workforce-period-report.mjs';
const fixture={observedAt:'2026-10-15T00:00:00Z',employees:[{
 id:'project',name:'Project',workItems:[{id:'w1',missionId:'m1',actionType:'PROJECT.TRACK_DEPENDENCY',status:'COMPLETED',createdAt:'2026-10-06T00:00:00Z',updatedAt:'2026-10-10T00:00:00Z'},{id:'w2',missionId:'m1',actionType:'PROJECT.TRACK_DEPENDENCY',status:'BLOCKED',updatedAt:'2026-09-25T00:00:00Z'}],
 audit:{history:[{route:'/mission-status.html',outcome:'FAIL',reviewer:'reviewer',reviewedAt:'2026-10-13T08:00:00Z',openFindings:1,rationale:'Asset missing'}]},
 reports:{reports:[{verifiedAt:'2026-10-10T04:00:00Z',reviewer:'risk',actionType:'PROJECT.TRACK_DEPENDENCY',workPackageId:'w1'}]},
 forecast:{status:'NOT_QUALIFIED',reason:'No baseline'}
}]};
test('period filters updates, real audit review events, and verified reports separately',()=>{
 const x=workActivityReport(fixture,{from:'2026-10-01',to:'2026-10-15'});
 assert.equal(x.rows.length,1);assert.equal(x.markedCompleted,1);
 assert.equal(x.blocked,0);assert.equal(x.reviewedAudits,1);assert.equal(x.auditFailures,1);
 assert.equal(x.verifiedReports,1);assert.equal(x.forecast[0].status,'NOT_QUALIFIED');
 assert.match(x.note,/not establish what status existed/);
});
test('empty period does not invent activity or projections',()=>{
 const x=workActivityReport(fixture,{from:'2026-09-17',to:'2026-09-20'});
 assert.equal(x.rows.length,0);assert.equal(x.audits.length,0);
 assert.equal(x.forecast[0].status,'NOT_QUALIFIED');
});
test('rejects periods outside bounded source history',()=>{
 assert.deepEqual(periodBounds(fixture.observedAt),{min:'2026-07-18',max:'2026-10-15'});
 for(const range of [{from:'2025-01-01',to:'2026-10-15'},{from:'2026-10-16',to:'2026-10-17'},
  {from:'2026-10-15',to:'2026-10-14'}]){
  assert.throws(()=>workActivityReport(fixture,range));
 }
});


test('period plan comparison requires approved baselines and independent proof by the period end',()=>{
 const person=structuredClone(fixture.employees[0]);person.progress={status:'APPROVED_BASELINE_COHORT',baselines:[
  {id:'B1',workPackageId:'w1',approvedAt:'2026-10-01T00:00:00Z',plannedFinishAt:'2026-10-12T00:00:00Z'},
  {id:'B2',workPackageId:'w2',approvedAt:'2026-10-01T00:00:00Z',plannedFinishAt:'2026-10-14T00:00:00Z'}]};
 person.reports.status='VERIFIED_EMPLOYEE_HANDOFF_REPORTS';
 person.reports.reports.push({workPackageId:'w2',verifiedAt:'2026-10-16T00:00:00Z'});
 const report=workActivityReport({...fixture,employees:[person]},{from:'2026-10-01',to:'2026-10-15'});
 assert.equal(report.plans[0].plannedDue,2);assert.equal(report.plans[0].verifiedByPeriodEnd,1);assert.equal(report.plans[0].variance,-1);
 const unavailable=workActivityReport(fixture,{from:'2026-10-01',to:'2026-10-15'}).plans[0];
 assert.equal(unavailable.status,'UNAVAILABLE');assert.equal(unavailable.plannedDue,null);
});
