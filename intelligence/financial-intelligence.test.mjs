import test from 'node:test';
import assert from 'node:assert/strict';
import {projectFinanceActuals} from './financial-scorecard.mjs';
function source(){
 return {actionType:'FINANCE.OBSERVE_STATEMENTS',sourceAuthority:'buildFinancialStatements',
 data:{schemaVersion:'VYNDI_FINANCE_STATEMENTS_V1',readOnly:true,completeLedgerThroughDate:true,
 sourceBasis:'POSTED_GENERAL_LEDGER_AND_LATEST_PERIOD_JOB_COST',observedAt:'2026-11-01T00:00:00Z',
 statements:{period:{fromDate:'2026-10-01',toDate:'2026-10-31'},
 evidence:{periodJournalCount:5,periodLineCount:10,throughDateJournalCount:5,jobCostSnapshotCount:0},
 trading:{accrual:{resultInr:60,rows:[{label:'Net sales / product revenue',amountInr:150},{label:'Less: Cost of goods sold',amountInr:-90}]}},
 profitLoss:{accrual:{resultInr:30}},balanceSheet:{balanceDifferenceInr:0},
 cashFlow:{closingCashInr:50,reconciliationDifferenceInr:0,directCashCapexInr:20,
 rows:[{label:'Operating activities',amountInr:35},{label:'Investing activities',amountInr:-20},{label:'Financing activities',amountInr:10}]},
 fundFlow:{closingWorkingCapitalInr:70,reconciliationDifferenceInr:0},
 basisReconciliation:{closingReceivablesInr:15,closingPayablesInr:20},
 trialBalance:[{accountCode:'1200',balanceInr:40},{accountCode:'1210',balanceInr:20},{accountCode:'1220',balanceInr:0}],
 costAccount:{weightedUnitCostInr:0,completedQuantity:0}}
 }};
}
const period={from:'2026-10-01',to:'2026-10-31'};
test('founder projection exposes reconciled liquidity, FCF proxy and working-capital efficiency',()=>{
 const p=projectFinanceActuals(source(),period);
 assert.equal(p.operatingCashFlowInr,35);
 assert.equal(p.directCashCapexInr,20);
 assert.equal(p.indicativeFreeCashFlowInr,15);
 assert.equal(p.capexCoverage,'DIRECT_ASSET_BANK_ONLY');
 assert.equal(p.workingCapitalInr,70);
 assert.equal(p.dsoDays,3.1);
 assert.equal(p.dioDays,20.67);
 assert.equal(p.payablesToCogsDays,6.89);
});
test('old statement schema never manufactures CAPEX or free cash flow',()=>{
 const s=source();delete s.data.statements.cashFlow.directCashCapexInr;
 const p=projectFinanceActuals(s,period);
 assert.equal(p.indicativeFreeCashFlowInr,null);
 assert.equal(p.capexCoverage,'UNAVAILABLE');
});
test('reconciliation failure suppresses all new finance intelligence',()=>{
 const s=source();s.data.statements.cashFlow.reconciliationDifferenceInr=1;
 const p=projectFinanceActuals(s,period);
 assert.equal(p.indicativeFreeCashFlowInr,null);
 assert.equal(p.operatingCashFlowInr,null);
 assert.equal(p.workingCapitalInr,null);
});
