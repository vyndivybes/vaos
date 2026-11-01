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
 // One signed, read-only ledger statement is the sole source of business metrics.
 const operating=s.cashFlow?.rows?.find(x=>x.label==='Operating activities')?.amountInr;
 const directCapex=s.cashFlow?.directCashCapexInr;
 const wc=s.fundFlow?.closingWorkingCapitalInr;
 const ar=s.basisReconciliation?.closingReceivablesInr;
 const ap=s.basisReconciliation?.closingPayablesInr;
 const inventory=(s.trialBalance||[]).filter(x=>['1200','1210','1220'].includes(x.accountCode))
  .reduce((v,x)=>v+(finite(x.balanceInr)?x.balanceInr:0),0);
 const days=(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000+1;
 const hasPeriod=Number.isSafeInteger(days)&&days>0;
 const cogsPositive=-cogs;
 const dso=actuals&&hasPeriod&&revenue>0&&finite(ar)?round(Math.max(0,ar)/revenue*days):null;
 const dio=actuals&&hasPeriod&&cogsPositive>0&&Array.isArray(s.trialBalance)?round(Math.max(0,inventory)/cogsPositive*days):null;
 // COGS-based payables-days is a proxy, not statutory DPO or approved credit-purchase ageing.
 const payablesDays=actuals&&hasPeriod&&cogsPositive>0&&finite(ap)?round(Math.max(0,ap)/cogsPositive*days):null;
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
  operatingCashFlowInr:actuals&&finite(operating)?operating:null,
  directCashCapexInr:actuals&&finite(directCapex)?directCapex:null,
  indicativeFreeCashFlowInr:actuals&&finite(operating)&&finite(directCapex)?round(operating-directCapex):null,
  capexCoverage:actuals&&finite(directCapex)?'DIRECT_ASSET_BANK_ONLY':'UNAVAILABLE',
  workingCapitalInr:actuals&&finite(wc)?wc:null,
  dsoDays:dso,
  dioDays:dio,
  payablesToCogsDays:payablesDays,
  cashConversionCycleProxyDays:dso!==null&&dio!==null&&payablesDays!==null?round(dso+dio-payablesDays):null,
  unitManufacturingCostInr:unitQualified?money(cost):null,
  reconciliationDifferencesInr:reconciled?differences:null,
  source:'VYNDI_OS_POSTED_FINANCIAL_STATEMENTS'
 });
}
