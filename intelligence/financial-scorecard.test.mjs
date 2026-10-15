import test from 'node:test';
import assert from 'node:assert/strict';
import {projectFinanceActuals} from './financial-scorecard.mjs';
function source(journals=1){
 return {
  actionType:'FINANCE.OBSERVE_STATEMENTS',sourceAuthority:'buildFinancialStatements',
  data:{schemaVersion:'VYNDI_FINANCE_STATEMENTS_V1',readOnly:true,completeLedgerThroughDate:true,
   sourceBasis:'POSTED_GENERAL_LEDGER_AND_LATEST_PERIOD_JOB_COST',observedAt:'2026-10-15T02:00:00Z',
   statements:{
    period:{fromDate:'2026-10-01',toDate:'2026-10-15'},
    evidence:{periodJournalCount:journals,periodLineCount:journals*2,throughDateJournalCount:journals,jobCostSnapshotCount:0},
    trading:{accrual:{resultInr:300,rows:[{label:'Net sales / product revenue',amountInr:1000},{label:'Less: Cost of goods sold',amountInr:-700}]}},
    profitLoss:{accrual:{resultInr:100}},
    balanceSheet:{balanceDifferenceInr:0},
    cashFlow:{closingCashInr:500,reconciliationDifferenceInr:0},
    fundFlow:{reconciliationDifferenceInr:0},
    costAccount:{weightedUnitCostInr:0,completedQuantity:0}
   }}
 };
}
const window={from:'2026-10-01',to:'2026-10-15'};
test('posted ledger actuals produce real accounting measures',()=>{
 const r=projectFinanceActuals(source(),window);
 assert.equal(r.status,'POSTED_ACTUALS');
 assert.equal(r.revenueInr,1000);assert.equal(r.costOfGoodsSoldInr,700);
 assert.equal(r.grossProfitInr,300);assert.equal(r.netProfitInr,100);
 assert.equal(r.grossMarginPct,30);assert.equal(r.netMarginPct,10);
 assert.equal(r.closingCashInr,500);assert.equal(r.unitManufacturingCostInr,null);
});
test('no posted period entries means no invented profit',()=>{
 const r=projectFinanceActuals(source(0),window);
 assert.equal(r.status,'NO_POSTED_ACTIVITY');
 assert.equal(r.revenueInr,null);assert.equal(r.grossProfitInr,null);assert.equal(r.netMarginPct,null);
});
test('reconciliation holds suppress financial claims',()=>{
 const s=source();s.data.statements.balanceSheet.balanceDifferenceInr=5;
 const r=projectFinanceActuals(s,window);
 assert.equal(r.status,'RECONCILIATION_HOLD');assert.equal(r.netProfitInr,null);assert.equal(r.closingCashInr,null);
});
test('forged source, date and mismatched trade are rejected',()=>{
 const a=source();a.sourceAuthority='unknown';assert.throws(()=>projectFinanceActuals(a,window),/FINANCE_AUTHORITY_MISMATCH/);
 assert.throws(()=>projectFinanceActuals(source(),{from:'2026-10-01',to:'2026-10-14'}),/FINANCE_PERIOD_MISMATCH/);
 const b=source();b.data.statements.trading.accrual.resultInr=800;
 assert.throws(()=>projectFinanceActuals(b,window),/FINANCE_TRADING_RECONCILIATION/);
});
