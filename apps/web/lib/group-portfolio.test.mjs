import test from 'node:test';
import assert from 'node:assert/strict';
import {GROUP_DIVISIONS,READ_DOMAINS,buildGroupPortfolio,groupSignalRows} from './group-portfolio.mjs';

test('six enterprise business units are management divisions, not separately incorporated companies',()=>{
 assert.deepEqual(GROUP_DIVISIONS.map(x=>x.id),['corporate','carbon','aluminium','software','vybes','merchandise']);
 assert.ok(GROUP_DIVISIONS.every(x=>x.type==='management_unit'&&x.label&&x.focus));
});
test('the read bridge covers all available cross-functional domains including HR and commercial',()=>{
 assert.ok(READ_DOMAINS.some(x=>x.id==='people'&&x.actionType==='PEOPLE.OBSERVE_WORKFORCE'));
 assert.ok(READ_DOMAINS.some(x=>x.id==='commercial'&&x.actionType==='COMMERCIAL.OBSERVE_PIPELINE'));
 assert.ok(READ_DOMAINS.some(x=>x.id==='engineering'&&x.actionType==='ENGINEERING.OBSERVE_CONFIGURATION'));
 assert.ok(READ_DOMAINS.every(x=>x.effectClass==='read'&&x.actionType.includes('.OBSERVE_')));
});
test('signed observations never become financial totals, group certification or assigned division figures',()=>{
 const result=buildGroupPortfolio([{id:'finance',status:'OBSERVED',authority:'getAccountingWorkbench'},{id:'people',status:'HOLD'}],{asOf:'2026-10-12T09:00:00.000Z'});
 assert.equal(result.status,'PARTIAL');
 assert.equal(result.financialConsolidation,'HOLD');
 assert.equal(result.groupRevenue,null);
 assert.equal(result.groupCash,null);
 assert.equal(result.groupProfit,null);
 assert.equal(result.perDivisionForecastQualified,false);
 assert.equal(result.divisions.length,6);
 assert.ok(result.divisions.every(x=>x.status==='UNATTRIBUTED'&&x.financialValue===null));
 assert.equal(result.sources.find(x=>x.id==='finance').status,'OBSERVED');
 assert.equal(result.sources.find(x=>x.id==='people').status,'HOLD');
});
test('when no source has been checked, no zero or reassuring "all clear" is inferred',()=>{
 const result=buildGroupPortfolio([],{asOf:'2026-10-12T09:00:00.000Z'});
 assert.equal(result.status,'NOT_QUALIFIED');
 assert.ok(result.sources.every(x=>x.status==='HOLD'));
 assert.equal(result.sourceCoverage.verified,0);
});
test('group status chart is based on observation health, never fictional business counts',()=>{
 const result=buildGroupPortfolio([{id:'commercial',status:'OBSERVED',authority:'listSalesOrders'}]);
 const chart=groupSignalRows(result);
 assert.deepEqual(chart.map(x=>x.value),[1,READ_DOMAINS.length-1]);
 assert.deepEqual(chart.map(x=>x.label),['Signed read','Hold / not connected']);
});
test('unsafe partial / raw data provided to builder is not forwarded to frontend',()=>{
 const result=buildGroupPortfolio([{id:'people',status:'OBSERVED',authority:'listPeopleOfficeAuthority',data:{email:'private@example.com',salary:4000}}]);
 assert.ok(!JSON.stringify(result).includes('private@example.com'));
 assert.ok(!JSON.stringify(result).includes('salary'));
});
