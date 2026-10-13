import test from 'node:test';
import assert from 'node:assert/strict';
import {departmentResults,plannedProgress,qualifiedForecast,capaRetests,governedReports,forecastInputSha256} from './workforce-evidence.mjs';
const asOf='2026-10-13T10:00:00Z',sha='a'.repeat(64),refs=['evidence:fixture-only'];
const baseline={id:'b1',workPackageId:'wp1',approvedAt:'2026-10-01T00:00:00Z',plannedStartAt:'2026-10-02T00:00:00Z',plannedFinishAt:'2026-10-10T00:00:00Z',approvedBy:'founder',evidenceRefs:refs,dependsOn:[]};
const review={id:'audit1',route:'/command/quality',outcome:'PASS',executedAt:'2026-10-10T00:00:00Z',reviewedAt:'2026-10-11T00:00:00Z',reviewer:'risk',evidenceRefs:refs,evidenceSha256:sha,canonicalSourceRef:'source:fixture',environment:'authenticated-isolated',deployedCommit:'fixture-commit',openFindings:0,nextAuditDueAt:'2026-11-01T00:00:00Z',checksEvidenceRefs:refs,rationale:'Isolated test only'};
const forecast={id:'f1',modelVersion:'fixture-model',reviewer:'risk',qualifiedAt:'2026-10-12T00:00:00Z',expiresAt:'2026-10-20T00:00:00Z',lowerAt:'2026-10-14T00:00:00Z',projectedFinishAt:'2026-10-16T00:00:00Z',upperAt:'2026-10-19T00:00:00Z',sampleSize:20,confidence:0.8,backtestCoverage:0.85,capacityPerDay:2,evidenceRefs:refs,inputSha256:sha,baselineIds:['b1']};
review.checks=Object.fromEntries(['navigation','ui','responsive','permissions','records','displays','reconciliation','errorStates','ledger'].map(k=>[k,true]));
forecast.inputSha256=forecastInputSha256(plannedProgress([baseline],[],[],asOf),[]);
test('missing and empty ledgers are distinct and never manufacture certification',()=>{
 assert.equal(departmentResults('qa',undefined,asOf),null);
 assert.equal(departmentResults('qa',[],asOf).status,'UNVERIFIED_NO_REVIEW_LEDGER');
 assert.equal(qualifiedForecast('qa',[],asOf,{}),null);
 assert.equal(capaRetests('qa',[],[],asOf).status,'NO_RETEST_EVIDENCE');
});
test('audit history covers only reviewed routes and refuses self-review, forged pass and future proof',()=>{
 const x=departmentResults('qa',[review],asOf);
 assert.equal(x.passed,1);assert.equal(x.qualificationCertified,false);
 assert.ok(x.pages.some(p=>p.status==='EVIDENCE_NOT_CONNECTED'));
 for(const change of [{reviewer:'qa'},{openFindings:1,correctiveOwner:'qa'},{route:'/command/accounting'},{reviewedAt:'2030-01-01'},{evidenceSha256:'bad'},{evidenceRefs:[]},{environment:'synthetic'}])
  assert.throws(()=>departmentResults('qa',[{...review,...change}],asOf));
});
test('progress compares identical approved cohorts to independent closure timestamps',()=>{
 const x=plannedProgress([baseline],[],[{workPackageId:'wp1',verifiedAt:'2026-10-12T00:00:00Z'}],asOf);
 assert.equal(x.series.at(-1).planned,1);assert.equal(x.series.at(-1).actual,1);assert.equal(x.overdue,0);
 assert.equal(plannedProgress([baseline],[],[],asOf).overdue,1);
 assert.equal(plannedProgress([],[],[],asOf).status,'NO_APPROVED_BASELINE');
 assert.throws(()=>plannedProgress([{...baseline,approvedAt:asOf}],[],[],asOf));
 assert.throws(()=>plannedProgress([baseline,{...baseline,id:'b2'}],[],[],asOf));
});
test('qualified forecasts require independent, current backtests and matching baseline inputs',()=>{
 const progress=plannedProgress([baseline],[],[],asOf);
 assert.equal(qualifiedForecast('qa',[forecast],asOf,progress).status,'INDEPENDENTLY_QUALIFIED_PROJECTION');
 assert.equal(qualifiedForecast('qa',[{...forecast,expiresAt:'2026-10-13T00:00:00Z'}],asOf,progress).projectedFinishAt,null);
 assert.equal(qualifiedForecast('qa',[forecast],asOf,{baselines:[]}).status,'NOT_QUALIFIED');
 assert.equal(qualifiedForecast('qa',[forecast],asOf,progress,[{id:'new-work',status:'PLANNED',updatedAt:asOf}]).status,'NOT_QUALIFIED');
 for(const change of [{reviewer:'qa'},{sampleSize:19},{backtestCoverage:0.6},{capacityPerDay:0},{confidence:1},{inputSha256:'bad'},{lowerAt:'2026-10-18'}])
  assert.throws(()=>qualifiedForecast('qa',[{...forecast,...change}],asOf,progress));
});
test('CAPA closure requires a linked earlier passing retest and rejects subsequent failure',()=>{
 const cases=[{id:'c1',openedAt:'2026-10-01T00:00:00Z'}];
 const pass={id:'r1',capaId:'c1',kind:'RETEST_PASS',occurredAt:'2026-10-10T00:00:00Z',owner:'qa',reviewer:'risk',evidenceRefs:refs,evidenceSha256:sha,note:'Fixture retest'};
 const closed={...pass,id:'r2',kind:'CLOSED',occurredAt:'2026-10-12T00:00:00Z',retestEventId:'r1'};
 assert.equal(capaRetests('qa',[pass,closed],cases,asOf).events.length,2);
 assert.throws(()=>capaRetests('qa',[closed],cases,asOf));
 assert.throws(()=>capaRetests('qa',[pass,{...pass,id:'r3',kind:'RETEST_FAIL',occurredAt:'2026-10-11T00:00:00Z'},closed],cases,asOf));
 assert.throws(()=>capaRetests('qa',[{...pass,reviewer:'qa'}],cases,asOf));
});
test('employee reports expose verified provenance without delivery or dispatch authority',()=>{
 const r={id:'e1',author:'qa',reviewer:'risk',createdAt:'2026-10-10T00:00:00Z',verifiedAt:'2026-10-11T00:00:00Z',reportSha256:sha,handoffId:'h1',workPackageId:'wp1',actionType:'QA.CHECK'};
 const x=governedReports('qa',[r],asOf);assert.equal(x.outboundAuthorized,false);
 assert.throws(()=>governedReports('qa',[{...r,author:'finance'}],asOf));
 assert.throws(()=>governedReports('qa',[{...r,reviewer:'qa'}],asOf));
});
