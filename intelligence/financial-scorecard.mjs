// Never derive business profit from sampled work records or AI activity.
// Financial figures are accepted only from a complete, signed VYNDI financial-statement pack.
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e13;
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const money=v=>finite(v)?v:null;
const round=v=>Math.round((v+Number.EPSILON)*100)/100;
function requireAmount(v,label){if(!finite(v))throw Error('FINANCE_AMOUNT_INVALID:'+label);return v;}
export function projectFinanceActuals(source,{from,to}={}){
 if(source?.actionType!=='FINANCE.OBSERVE_STATEMENTS'||
    source?.sourceAuthority!=='buildFinancialStatements')throw Error('FINANCE_AUTHORITY_MISMATCH');
 const pack=source.data;
 if(pack?.schemaVersion!=='VYNDI_FINANCE_STATEMENTS_V1'||pack.readOnly!==true||
    pack.completeLedgerThroughDate!==true||pack.sourceBasis!=='POSTED_GENERAL_LEDGER_AND_LATEST_PERIOD_JOB_COST')
  throw Error('FINANCE_SOURCE_UNQUALIFIED');
 const s=pack.statements;
 if(!s||s.period?.fromDate!==from||s.period?.toDate!==to)throw Error('FINANCE_PERIOD_MISMATCH');
 const ev=s.evidence;
 if(!ev||!integer(ev.periodJournalCount)||!integer(ev.periodLineCount)||
   !integer(ev.throughDateJournalCount)||!integer(ev.jobCostSnapshotCount))throw Error('FINANCE_EVIDENCE_INVALID');
 const gross=requireAmount(s.trading?.accrual?.resultInr,'gross');
 const net=requireAmount(s.profitLoss?.accrual?.resultInr,'net');
 const cash=requireAmount(s.cashFlow?.closingCashInr,'cash');
 const cost=requireAmount(s.costAccount?.weightedUnitCostInr,'unitCost');
 const revenueLine=s.trading?.accrual?.rows?.find(x=>x.label==='Net sales / product revenue');
 const cogsLine=s.trading?.accrual?.rows?.find(x=>x.label==='Less: Cost of goods sold');
 const revenue=requireAmount(revenueLine?.amountInr,'revenue');
 const cogs=requireAmount(cogsLine?.amountInr,'cogs');
 if(Math.abs(round(revenue+cogs)-round(gross))>0.01)throw Error('FINANCE_TRADING_RECONCILIATION');
 const differences=[
  s.balanceSheet?.balanceDifferenceInr,
  s.cashFlow?.reconciliationDifferenceInr,
  s.fundFlow?.reconciliationDifferenceInr
 ];
 if(differences.some(v=>!finite(v)))throw Error('FINANCE_RECONCILIATION_MISSING');
 const reconciled=differences.every(v=>Math.abs(v)<=0.01);
 const actuals=ev.periodJournalCount>0&&reconciled;
 const cashQualified=ev.throughDateJournalCount>0&&reconciled;
 const unitQualified=ev.jobCostSnapshotCount>0&&s.costAccount?.completedQuantity>0&&reconciled;
 return Object.freeze({
  schemaVersion:'VAOS_FINANCIAL_SCORECARD_V1',readOnly:true,from,to,
  status:!reconciled?'RECONCILIATION_HOLD':!ev.periodJournalCount?'NO_POSTED_ACTIVITY':'POSTED_ACTUALS',
  observedAt:pack.observedAt,periodJournalCount:ev.periodJournalCount,
  costSnapshotCount:ev.jobCostSnapshotCount,
  revenueInr:actuals?money(revenue):null,
  costOfGoodsSoldInr:actuals?money(-cogs):null,
  grossProfitInr:actuals?money(gross):null,
  netProfitInr:actuals?money(net):null,
  grossMarginPct:actuals&&revenue!==0?round(gross/revenue*100):null,
  netMarginPct:actuals&&revenue!==0?round(net/revenue*100):null,
  closingCashInr:cashQualified?money(cash):null,
  unitManufacturingCostInr:unitQualified?money(cost):null,
  reconciliationDifferencesInr:reconciled?differences:null,
  source:'VYNDI_OS_POSTED_FINANCIAL_STATEMENTS'
 });
}
