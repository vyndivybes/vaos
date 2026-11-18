import {projectExecutiveIntelligence} from './lib/executive-intelligence.mjs';
// Read-only founder dashboard. No write APIs, external telemetry or synthetic actuals.
const $=id=>document.getElementById(id);
const MONEY=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2});
const el=(tag,value,cls)=>{const node=document.createElement(tag);if(value!==undefined)node.textContent=String(value);if(cls)node.className=cls;return node;};
const display=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('en-IN'):'HOLD';
let ticket=0,enterprise=null,finance=null;
function clear(message){
 $('wa-exec-kpis').replaceChildren();$('wa-exec-brief').replaceChildren();
 $('wa-exec-status').textContent=message;
}
function addMetric(host,name,value,note){
 const box=el('article',undefined,'wa-stat');
 box.append(el('small',name),el('strong',value),el('small',note));host.append(box);
}
function addNote(host,title,description){
 const box=el('article',undefined,'wa-period-item');
 box.append(el('strong',title),el('p',description));host.append(box);
}
function render(){
 let result;
 try{if($('wa-exec-conversion').value.trim()==='')throw Error('BI_ASSUMPTION_INVALID');
  result=projectExecutiveIntelligence(enterprise,finance,{conversionPct:Number($('wa-exec-conversion').value)});}
 catch{clear('Enter a conversion assumption from 0 to 100%.');return;}
 clear(result.status==='HOLD'?'HOLD — No qualified signed executive data was returned.':
  'Executive source evidence: '+result.sourceCoverage.observed+' / '+result.sourceCoverage.required+
  ' signed source groups observed (not decision-ready). Finance period '+result.period.from+' to '+result.period.to+
  '. CRM, HR and dispatch are current/all-recorded-date aggregates, not period activity. Company consolidation remains HOLD.');
 const host=$('wa-exec-kpis'),detail=$('wa-exec-brief');
 const {crm,hr,logistics,finance:financial}=result;
 addMetric(host,'CRM prospects',display(crm.prospectCustomers),'Current customer master · '+crm.status);
 addMetric(host,'CRM overdue follow-ups',display(crm.overdueFollowups),'All recorded dates · '+crm.status);
 addMetric(host,'Customer-linked confirmed orders',display(crm.linkedConfirmedOrders),
  'Canonical order linkage · '+crm.orderLinkStatus);
 addMetric(host,'Customer-linked delivered orders',display(crm.linkedDeliveredOrders),
  'Order status, not receipt of cash · '+crm.orderLinkStatus);
 addMetric(host,'Possible prospect conversions · assumption',display(crm.illustrativeConverts),
  'What-if at '+$('wa-exec-conversion').value+'% · Not a forecast');
 addMetric(host,'Approved People records',display(hr.approvedPersonnelRecords),'Not verified active headcount · '+hr.status);
 addMetric(host,'Attendance absent observations',display(hr.absentObservations),'Not a dated absenteeism rate · '+hr.status);
 addMetric(host,'Payroll readiness holds',display(hr.payrollHoldRecords),'No salary data · '+hr.status);
 addMetric(host,'Dispatch register shipments',display(logistics.shipmentsRecorded),'Registered shipment counts · '+logistics.status);
 addMetric(host,'Dispatched, awaiting invoice',display(logistics.awaitingInvoice),'Operational reconciliation queue · '+logistics.status);
 addMetric(host,'Company posted revenue',financial.status==='POSTED_ACTUALS'?MONEY.format(financial.companyRevenueInr):'HOLD',
  'Reconciled company ledger only · '+financial.status);
 addMetric(host,'Company closing cash',financial.status==='POSTED_ACTUALS'?MONEY.format(financial.companyClosingCashInr):'HOLD',
  'Not division-attributed · '+financial.status);
 addMetric(host,'Group consolidated finance','HOLD','Approved source attribution and intercompany eliminations missing');
 for(const [name,key,domain] of [['CRM forecasting','crm',crm],['Human HR intelligence','hr',hr],
  ['Logistics optimization','logistics',logistics],['Financial consolidation','groupConsolidation',financial]]){
  const readiness=result.dataReadiness?.[key];
  addNote(detail,name+' · source '+domain.status+' · decision '+(readiness?.status||'HOLD'),
   (readiness?.reason||'Source unqualified.')+' '+(domain.note||domain.reason||''));
 }
 addNote(detail,'Next governance actions',
  'Qualify dated CRM opportunity stage and win/loss histories before predictive conversion.  Qualify human attendance and payroll sources. Add carrier tracking, lane cost and promised delivery dates before route/OTIF optimization. Complete division-level transaction attribution and independent elimination reconciliation before group P&L or cash consolidation.');
}
async function read(url){
 const reply=await fetch(url,{credentials:'same-origin',cache:'no-store'});
 if(reply.status===401){location.assign('/login');return null;}
 if(!reply.ok)return null;
 return (await reply.json())?.data||null;
}
async function refresh(){
 const id=++ticket,from=$('wa-period-from').value,to=$('wa-period-to').value;
 enterprise=finance=null;
 clear('Verifying signed CRM, HR, dispatch and posted finance sources…');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to){
  clear('Select a valid reporting period above.');return;
 }
 const button=$('wa-exec-refresh');button.disabled=true;
 try{
  const query=new URLSearchParams({from,to});
  const [signal,ledger]=await Promise.all([
   read('/api/enterprise-bi?'+new URLSearchParams({...Object.fromEntries(query),executive:'1'})).catch(()=>null),
   read('/api/finance-scorecard?'+query).catch(()=>null),
  ]);
  if(id!==ticket)return;
  // Source packets are validated by the signed APIs and then projected again.
  enterprise=signal;finance=ledger;
  render();
 }finally{if(id===ticket)button.disabled=false;}
}
$('wa-exec-refresh').addEventListener('click',refresh);
$('wa-exec-conversion').addEventListener('input',()=>{if(enterprise)render();});
for(const id of ['wa-period-from','wa-period-to','wa-period-presets'])
 $(id).addEventListener('change',()=>{++ticket;enterprise=finance=null;clear('Reporting period changed. Verify the signed sources again.');});
