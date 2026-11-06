/** Founder decision intelligence on signed VYNDI aggregate packets.
 * Do not infer company revenue from CRM, headcount from agent activity,
 * on-time delivery from dispatch, or group totals without eliminations.
 */
const money=x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1e12;
function source(packet,id){
 const value=packet?.executiveSignals?.datasets?.[id];
 if(value?.status!=='OBSERVED'||!Array.isArray(value.rows)||value.rows.length>1000||
    !Number.isSafeInteger(value.total)||value.total<0)return null;
 let total=0;
 for(const r of value.rows){
  if(!r||typeof r!=='object'||Array.isArray(r)||
     Object.keys(r).some(k=>!['category','status','record_count'].includes(k))||
     typeof r.category!=='string'||r.category.length>120||
     typeof r.status!=='string'||r.status.length>120||
     !r.category.trim()||!r.status.trim()||
     !Number.isSafeInteger(r.record_count)||r.record_count<0)return null;
  total+=r.record_count;
 }
 return total===value.total?value.rows:null;
}
const count=(rows,predicate)=>rows.reduce((n,row)=>n+(predicate(row)?row.record_count:0),0);
const hold={status:'HOLD',reason:'Signed, complete source aggregates unavailable or unqualified.'};

export function projectExecutiveIntelligence(enterprise,finance=null,{conversionPct=20}={}){
 if(typeof conversionPct!=='number'||!Number.isFinite(conversionPct)||conversionPct<0||conversionPct>100)
  throw Error('BI_ASSUMPTION_INVALID');
 const permitted=enterprise?.schemaVersion==='VYNDI_ENTERPRISE_BI_V1'&&enterprise?.readOnly===true&&
  enterprise?.scope==='all'&&Array.isArray(enterprise.departments)&&
  enterprise?.executiveSignals?.schemaVersion==='VYNDI_EXECUTIVE_SIGNALS_V1'&&
  enterprise?.executiveSignals?.readOnly===true&&
  typeof enterprise?.period?.from==='string'&&typeof enterprise?.period?.to==='string';
 if(!permitted)return {status:'HOLD',reason:'Signed executive BI packet unavailable or schema mismatch.',
  crm:{...hold,prospectCustomers:null,activeCustomers:null,overdueFollowups:null,illustrativeConverts:null,forecastQualified:false},
  hr:{...hold,approvedPersonnelRecords:null,absentObservations:null,payrollHoldRecords:null},
  logistics:{...hold,shipmentsRecorded:null,awaitingInvoice:null,deliveryOtipQualified:false},
  finance:{...hold,companyRevenueInr:null,groupRevenueInr:null,groupConsolidationQualified:false},
  dataReadiness:Object.fromEntries(['crm','hr','logistics','finance','groupConsolidation']
   .map(id=>[id,{status:'HOLD',reason:'Signed executive source unavailable.'}]))};
 const customers=source(enterprise,'crmCustomers'),followups=source(enterprise,'crmFollowups'),
  crmLinks=source(enterprise,'crmOrderLinks');
 const staff=source(enterprise,'hrWorkforce'),attendance=source(enterprise,'hrAttendance'),
  payroll=source(enterprise,'hrPayrollReadiness'),dispatch=source(enterprise,'dispatch');
 const crmReady=customers!==null&&followups!==null,hrReady=staff!==null&&attendance!==null&&payroll!==null;
 const prospects=crmReady?count(customers,r=>r.status.toLowerCase()==='prospect'):null;
 const financeReady=finance?.schemaVersion==='VAOS_FINANCIAL_SCORECARD_V1'&&finance?.readOnly===true&&
  finance?.source==='VYNDI_OS_POSTED_FINANCIAL_STATEMENTS'&&finance?.status==='POSTED_ACTUALS'&&
  finance?.from===enterprise.period.from&&finance?.to===enterprise.period.to&&
  [finance.revenueInr,finance.netProfitInr,finance.closingCashInr].every(money);
 const activeSources=[crmReady,hrReady,dispatch!==null,financeReady].filter(Boolean).length;
 const crmRows=crmReady?count(customers,()=>true):null;
 const attendanceRows=hrReady?count(attendance,()=>true):null;
 const payrollRows=hrReady?count(payroll,()=>true):null;
 const payrollHolds=hrReady?count(payroll,r=>/hold|blocked|pending/i.test(r.status)):null;
 const dispatchRows=dispatch?count(dispatch,()=>true):null;
 // Source connection is not enough for an operational forecast or certification.
 const dataReadiness={
  crm:{status:'HOLD',reason:!crmReady?'CRM source unavailable or incomplete.':
   !crmRows?'No CRM customer and conversion history for a predictive forecast.':
   crmLinks===null?'CRM customer-to-sales-order linkage unavailable; win/loss calibration is not qualified.':
   'Customer-linked order statuses are observed but historical opportunity vintages and dated win/loss calibration remain unavailable.'},
  hr:{status:'HOLD',reason:!hrReady?'HR attendance and payroll sources unavailable or unqualified.':
   !attendanceRows||!payrollRows?'No attendance and payroll readiness evidence sufficient for HR qualification.':
   payrollHolds?'Payroll readiness holds prevent qualified HR operations.':
   'Attendance and payroll sources are connected; reconciled payroll actuals and human workforce denominators remain unqualified.'},
  logistics:{status:'HOLD',reason:dispatchRows===null?'Dispatch source unavailable or incomplete.':
   !dispatchRows?'No dispatch history; carrier delivery and routing evidence unavailable.':
   'Carrier delivery timestamps, lane costs and route performance evidence are unavailable in the signed dispatch source.'},
  finance:{status:financeReady?'OBSERVED':'HOLD',reason:financeReady?
   'Reconciled posted company-wide ledger actuals are available for this reporting period.':
   'Reconciled posted company-wide ledger actuals are unavailable for this reporting period.'},
  groupConsolidation:{status:'HOLD',reason:'Approved division-level journal attribution and independently reconciled inter-unit eliminations are not supplied.'},
 };
 return {
  schemaVersion:'VAOS_EXECUTIVE_INTELLIGENCE_V1',status:activeSources?'PARTIAL':'HOLD',
  readOnly:true,actionAuthorized:false,asOf:enterprise.executiveSignals.observedAt||null,
  period:enterprise.period,
  crm:{status:crmReady?'OBSERVED':'HOLD',
   prospectCustomers:prospects,
   activeCustomers:crmReady?count(customers,r=>r.status.toLowerCase()==='active'):null,
   overdueFollowups:crmReady?count(followups,r=>r.category==='followup'&&r.status==='overdue'):null,
   illustrativeConverts:prospects===null?null:Math.round(prospects*conversionPct/100*100)/100,
   assumptionPct:conversionPct,forecastQualified:false,
   orderLinkStatus:crmLinks===null?'HOLD':'OBSERVED',
   linkedSalesOrders:crmLinks===null?null:count(crmLinks,()=>true),
   linkedConfirmedOrders:crmLinks===null?null:count(crmLinks,r=>r.status==='confirmed'),
   linkedDeliveredOrders:crmLinks===null?null:count(crmLinks,r=>r.status==='delivered'),
   note:'Assumed conversion of current prospect records, not a dated sales or revenue forecast; existing CRM lacks qualified probability/timing vintages.'},
  hr:{status:hrReady?'OBSERVED':'HOLD',
   approvedPersonnelRecords:hrReady?count(staff,r=>r.status==='approved'):null,
   absentObservations:hrReady?count(attendance,r=>r.status==='absent'):null,
   payrollHoldRecords:hrReady?count(payroll,r=>/hold|blocked|pending/i.test(r.status)):null,
   note:'Personnel master approvals, attendance observations and payroll readiness are not verified active headcount, labor hours or actual wage expense.'},
  logistics:{status:dispatch!==null?'OBSERVED':'HOLD',
   shipmentsRecorded:dispatch===null?null:count(dispatch,()=>true),
   awaitingInvoice:dispatch===null?null:count(dispatch,r=>r.status==='posted / invoice none'),
   reversedShipments:dispatch===null?null:count(dispatch,r=>r.status.startsWith('reversed')),
   deliveryOtipQualified:false,routeOptimizationQualified:false,
   note:'Dispatch register is authoritative for posting/invoice status only; carrier delivery timestamps, route costs and GPS are unavailable.'},
  finance:{status:financeReady?'POSTED_ACTUALS':'HOLD',
   companyRevenueInr:financeReady?finance.revenueInr:null,
   companyNetProfitInr:financeReady?finance.netProfitInr:null,
   companyClosingCashInr:financeReady?finance.closingCashInr:null,
   groupRevenueInr:null,groupConsolidationQualified:false,
   note:'Company-wide posted actuals only. Division attribution, internal transfers and elimination reconciliation have not been certified; group financial consolidation remains HOLD.'},
  dataReadiness,
  sourceCoverage:{observed:activeSources,required:4},
 };
}
