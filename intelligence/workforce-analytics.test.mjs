import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorkforceAnalytics} from './workforce-analytics.mjs';

const observedAt = '2026-10-13T10:00:00Z';
const source = {schemaVersion:'VAOS_WORKFORCE_OVERVIEW_V1',observedAt,readOnly:true,employees:[
 {id:'qa',name:'QA',role:'Quality',department:'Quality',lifecycle:'TRAINING',qualificationLevel:2,
  activitySignal:'NOT_ACTIVE',currentAssignment:'Quality review',
  work:{planned:2,ready:1,inProgress:1,completed:1,blocked:1,failed:0,cancelled:0,total:6},
  workItems:[{id:'wp-1',missionId:'mission-1',actionType:'QA.CHECK',status:'IN_PROGRESS',updatedAt:observedAt}],
  verifiedClosures:[{workPackageId:'wp-done',verifiedAt:'2026-10-11T10:00:00Z'}]},
]};
test('all sixteen identities appear without manufacturing activity for missing agents',()=>{
 const x=buildWorkforceAnalytics(source);
 assert.equal(x.employees.length,16);
 assert.equal(x.summary.registered,1);
 assert.equal(x.summary.planned,2);
 assert.equal(x.summary.inProgress,1);
 assert.equal(x.summary.completed,1);
 assert.equal(x.summary.blocked,1);
 assert.equal(x.summary.verifiedClosures90Days,1);
 const missing=x.employees.find(a=>a.id==='finance');
 assert.equal(missing.sourceStatus,'NOT_OBSERVED');
 assert.equal(missing.work.total,null);
 assert.equal(missing.forecast.status,'NOT_QUALIFIED');
});
test('role-specific KPI selection and departmental audit scope are separate from pass certification',()=>{
 const x=buildWorkforceAnalytics(source);
 const qa=x.employees.find(a=>a.id==='qa');
 const finance=x.employees.find(a=>a.id==='finance');
 assert.ok(qa.configuredKpis.length>0);
 assert.notDeepEqual(qa.configuredKpis,finance.configuredKpis);
 assert.ok(qa.audit.pages.some(p=>p.route==='/command/quality'));
 assert.equal(qa.audit.status,'UNVERIFIED_NO_REVIEW_LEDGER');
 assert.equal(qa.productionWriteAuthorized,false);
 assert.equal(qa.forecast.status,'NOT_QUALIFIED');
 assert.equal(qa.verifiedClosures['7d'],1);
});
test('refuses duplicate agents, nonfinite counts, invalid chronology and unverifiable source flags',()=>{
 for(const altered of [
  {...source,readOnly:false},
  {...source,employees:[...source.employees,...source.employees]},
  {...source,employees:[{...source.employees[0],work:{...source.employees[0].work,completed:-1}}]},
  {...source,employees:[{...source.employees[0],work:{...source.employees[0].work,total:1}}]},
  {...source,employees:[{...source.employees[0],verifiedClosures:[{workPackageId:'x',verifiedAt:'2035-01-01T00:00:00Z'}]}]},
 ]) assert.throws(()=>buildWorkforceAnalytics(altered));
});
test('missing verified history is not presented as zero or a synthetic forecast',()=>{
 const x=buildWorkforceAnalytics({...source,employees:[{...source.employees[0],verifiedClosures:undefined}]});
 const qa=x.employees.find(e=>e.id==='qa');
 assert.equal(qa.verifiedClosures,null);
 assert.equal(qa.forecast.projectedFinishAt,null);
 assert.equal(qa.defects.status,'SOURCE_NOT_LINKED');
});

test('reported qualification assessments and CAPA provenance never become departmental audit PASS',()=>{
 const caseSource={...source,employees:[{...source.employees[0],
  qualificationAssessment:{status:'PASS',targetLevel:3,assessedAt:'2026-10-12T10:00:00Z',assessedBy:'qualified-reviewer'},
  capaCounts:{OPEN:3},capaCases:[{id:'capa-001',status:'OPEN',sourceAction:'QA.OPEN_CAPA',openedAt:'2026-10-11T10:00:00Z'}]}]};
 const x=buildWorkforceAnalytics(caseSource).employees.find(x=>x.id==='qa');
 assert.equal(x.qualificationAssessment.status,'PASS');
 assert.equal(x.audit.status,'UNVERIFIED_NO_REVIEW_LEDGER');
 assert.equal(x.defects.status,'PARTIAL_CAPA_SOURCE');
 assert.deepEqual(x.defects.capaByStatus,{OPEN:3});
 assert.equal(x.defects.open,null); // other defect ledgers are not linked
});
test('forged CAPA counts, duplicate case IDs, and future assessment time fail closed',()=>{
 const base={...source.employees[0]};
 for(const fields of [
  {capaCounts:{OPEN:-1}},
  {capaCounts:{OPEN:NaN}},
  {capaCounts:{OPEN:1},capaCases:[{id:'same',status:'OPEN',openedAt:'2026-10-11T10:00:00Z'}, {id:'same',status:'OPEN',openedAt:'2026-10-11T10:00:00Z'}]},
  {qualificationAssessment:{status:'PASS',assessedAt:'2028-10-11T10:00:00Z',targetLevel:3}},
 ]){
  assert.throws(()=>buildWorkforceAnalytics({...source,employees:[{...base,...fields}]}));
 }
});
