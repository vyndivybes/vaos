import test from 'node:test';
import assert from 'node:assert/strict';
import {projectExecutiveIntelligence} from './executive-intelligence.mjs';

const rows=(...values)=>({status:'OBSERVED',source:'VYNDI_OS_COMPLETE_CANONICAL_AGGREGATE',
 total:values.reduce((n,r)=>n+r.record_count,0),rows:values});
const report=()=>({schemaVersion:'VYNDI_ENTERPRISE_BI_V1',readOnly:true,scope:'all',
 period:{from:'2026-11-01',to:'2026-11-05'},departments:[],
 executiveSignals:{schemaVersion:'VYNDI_EXECUTIVE_SIGNALS_V1',readOnly:true,
  datasets:{
   crmCustomers:rows({category:'dealer',status:'prospect',record_count:10},{category:'dealer',status:'active',record_count:5}),
   crmFollowups:rows({category:'followup',status:'overdue',record_count:2}),
   hrWorkforce:rows({category:'employee',status:'approved',record_count:3}),
   hrAttendance:rows({category:'absent',status:'absent',record_count:1}),
   hrPayrollReadiness:rows({category:'2026-11',status:'hold',record_count:1}),
   dispatch:rows({category:'dispatch',status:'posted / invoice none',record_count:4},
    {category:'dispatch',status:'posted / invoice posted',record_count:6}),
 }}});
const finance={schemaVersion:'VAOS_FINANCIAL_SCORECARD_V1',readOnly:true,
 status:'POSTED_ACTUALS',source:'VYNDI_OS_POSTED_FINANCIAL_STATEMENTS',
 from:'2026-11-01',to:'2026-11-05',closingCashInr:1000,revenueInr:5000,netProfitInr:250};

test('CRM, real human HR, dispatch and company ledger evidence are separately identified',()=>{
 const a=projectExecutiveIntelligence(report(),finance,{conversionPct:20});
 assert.equal(a.status,'PARTIAL'); // group financial consolidation has not qualified
 assert.equal(a.crm.status,'OBSERVED');
 assert.equal(a.crm.prospectCustomers,10);
 assert.equal(a.crm.activeCustomers,5);
 assert.equal(a.crm.overdueFollowups,2);
 assert.equal(a.crm.illustrativeConverts,2);
 assert.equal(a.crm.forecastQualified,false);
 assert.equal(a.hr.approvedPersonnelRecords,3);
 assert.equal(a.hr.absentObservations,1);
 assert.equal(a.hr.payrollHoldRecords,1);
 assert.equal(a.logistics.shipmentsRecorded,10);
 assert.equal(a.logistics.awaitingInvoice,4);
 assert.equal(a.logistics.deliveryOtipQualified,false);
 assert.equal(a.finance.status,'POSTED_ACTUALS');
 assert.equal(a.finance.companyRevenueInr,5000);
 assert.equal(a.finance.groupConsolidationQualified,false);
 assert.equal(a.finance.groupRevenueInr,null);
});
test('missing or injected aggregate data fails closed without leaking personal fields',()=>{
 const p=report();p.executiveSignals.datasets.crmCustomers.rows[0].email='secret@example.com';
 p.executiveSignals.datasets.dispatch.total=11;delete p.executiveSignals.datasets.hrWorkforce;
 const a=projectExecutiveIntelligence(p,null,{conversionPct:20});
 assert.equal(a.crm.status,'HOLD');
 assert.equal(a.crm.prospectCustomers,null);
 assert.equal(a.crm.illustrativeConverts,null);
 assert.equal(a.hr.approvedPersonnelRecords,null);
 assert.equal(a.logistics.shipmentsRecorded,null);
 assert.equal(a.finance.status,'HOLD');
 assert.equal(a.finance.companyRevenueInr,null);
 assert.ok(!JSON.stringify(a).includes('secret@example.com'));
});
test('finance period, ledger source and reconciliation are never substituted with unqualified figures',()=>{
 const original=report();
 for(const variant of [{...finance,to:'2026-11-04'},{...finance,status:'NO_POSTED_ACTIVITY'},
  {...finance,source:'MANUAL'}, {...finance,revenueInr:'5000'}]){
  const a=projectExecutiveIntelligence(original,variant);
  assert.equal(a.finance.status,'HOLD');
  assert.equal(a.finance.companyRevenueInr,null);
 }
 assert.equal(projectExecutiveIntelligence(null,finance).status,'HOLD');
});
test('manual CRM assumption is bounded; never promoted to conversion forecast or revenue',()=>{
 assert.throws(()=>projectExecutiveIntelligence(report(),finance,{conversionPct:101}),/BI_ASSUMPTION/);
 assert.throws(()=>projectExecutiveIntelligence(report(),finance,{conversionPct:NaN}),/BI_ASSUMPTION/);
 const r=projectExecutiveIntelligence(report(),finance,{conversionPct:0});
 assert.equal(r.crm.illustrativeConverts,0);
 assert.equal(r.crm.forecastQualified,false);
 assert.equal(Object.hasOwn(r.crm,'projectedRevenue'),false);
});

test('queryable empty business sources never qualify forecasting, HR payroll or logistics',()=>{
 const p=report();
 p.executiveSignals.datasets.crmCustomers=rows();
 p.executiveSignals.datasets.crmFollowups=rows();
 p.executiveSignals.datasets.hrWorkforce=rows(
  {category:'planned_role',status:'draft',record_count:22},
  {category:'employee',status:'approved',record_count:1});
 p.executiveSignals.datasets.hrAttendance=rows();
 p.executiveSignals.datasets.hrPayrollReadiness=rows();
 p.executiveSignals.datasets.dispatch=rows();
 const r=projectExecutiveIntelligence(p,null);
 assert.equal(r.sourceCoverage.observed,3,'signed aggregate source queries are connected');
 assert.equal(r.crm.status,'OBSERVED','zero source rows are observed rather than missing');
 assert.equal(r.dataReadiness.crm.status,'HOLD');
 assert.equal(r.dataReadiness.crm.reason,'No CRM customer and conversion history for a predictive forecast.');
 assert.equal(r.dataReadiness.hr.status,'HOLD');
 assert.match(r.dataReadiness.hr.reason,/attendance.*payroll/i);
 assert.equal(r.dataReadiness.logistics.status,'HOLD');
 assert.match(r.dataReadiness.logistics.reason,/no dispatch history/i);
 assert.equal(r.dataReadiness.finance.status,'HOLD');
 assert.equal(r.dataReadiness.groupConsolidation.status,'HOLD');
 assert.equal(r.hr.approvedPersonnelRecords,1,'draft planned roles are not approved staff');
 assert.equal(r.hr.absentObservations,0,'observed empty remains zero, not unknown');
 assert.equal(r.logistics.shipmentsRecorded,0);
});
test('populated CRM and dispatch still cannot claim predictive calibration or carrier optimization',()=>{
 const r=projectExecutiveIntelligence(report(),finance);
 assert.equal(r.dataReadiness.crm.status,'HOLD');
 assert.match(r.dataReadiness.crm.reason,/win.loss/i);
 assert.equal(r.dataReadiness.hr.status,'HOLD');
 assert.match(r.dataReadiness.hr.reason,/payroll/i);
 assert.equal(r.dataReadiness.logistics.status,'HOLD');
 assert.match(r.dataReadiness.logistics.reason,/carrier/i);
 assert.equal(r.dataReadiness.finance.status,'OBSERVED');
 assert.equal(r.dataReadiness.groupConsolidation.status,'HOLD');
});
test('invalid executive evidence reports source HOLD and no guessed business readiness',()=>{
 const p=report();p.executiveSignals.datasets.crmCustomers.rows[0].email='secret';
 const r=projectExecutiveIntelligence(p,null);
 assert.equal(r.dataReadiness.crm.status,'HOLD');
 assert.match(r.dataReadiness.crm.reason,/unavailable/i);
 assert.ok(!JSON.stringify(r).includes('secret'));
});

test('canonical CRM order links are observed separately from estimates or collected revenue',()=>{
 const p=report();
 p.executiveSignals.datasets.crmOrderLinks=rows(
  {category:'dealer',status:'lead',record_count:5},
  {category:'dealer',status:'confirmed',record_count:2},
  {category:'retail',status:'delivered',record_count:1},
  {category:'retail',status:'cancelled',record_count:3});
 const r=projectExecutiveIntelligence(p,finance);
 assert.equal(r.crm.orderLinkStatus,'OBSERVED');
 assert.equal(r.crm.linkedSalesOrders,11);
 assert.equal(r.crm.linkedConfirmedOrders,2);
 assert.equal(r.crm.linkedDeliveredOrders,1);
 assert.equal(r.crm.forecastQualified,false);
 assert.equal(r.dataReadiness.crm.status,'HOLD','order status evidence is not a dated won/lost forecast');
});
test('CRM linkage source missing or malformed stays HOLD without suppressing customer-master counts',()=>{
 const p=report();
 assert.equal(projectExecutiveIntelligence(p,finance).crm.orderLinkStatus,'HOLD');
 p.executiveSignals.datasets.crmOrderLinks=rows({category:'dealer',status:'confirmed',record_count:1,email:'private'});
 const r=projectExecutiveIntelligence(p,finance);
 assert.equal(r.crm.orderLinkStatus,'HOLD');
 assert.equal(r.crm.linkedConfirmedOrders,null);
 assert.equal(r.crm.prospectCustomers,10);
 assert.ok(!JSON.stringify(r).includes('private'));
});
