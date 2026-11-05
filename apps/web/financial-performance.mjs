import {project13WeekCash} from './lib/cash-scenario.mjs';
// Founder-only financial scorecard. Values shown ONLY when supplied by a complete,
// reconciled, signed VYNDI OS posted-ledger financial statement response.
const $=id=>document.getElementById(id);
const MONEY=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2});
const val=v=>typeof v==='number'&&Number.isFinite(v);
let request=0,qualifiedStatement=null;
function clearCashScenario(message){
 qualifiedStatement=null;
 $('wa-cash-scenario-results').replaceChildren();
 $('wa-cash-scenario-status').textContent=message;
}
function acceptCashStatement(packet){
 qualifiedStatement=packet;
 $('wa-cash-scenario-results').replaceChildren();
 $('wa-cash-scenario-status').textContent=packet.status==='POSTED_ACTUALS'&&val(packet.closingCashInr)
  ?'Signed closing ledger cash available as of '+packet.to+'. Enter your assumptions and select Calculate. No projection is certified.'
  :'Qualified closing cash is unavailable. No hypothetical scenario can be calculated.';
}
function drawCashScenario(){
 const host=$('wa-cash-scenario-results'),status=$('wa-cash-scenario-status');
 host.replaceChildren();
 if(!qualifiedStatement){status.textContent='Qualified financial actuals are required before planning.';return;}
 const ids=['wa-cash-weekly-receipts','wa-cash-weekly-payments','wa-cash-weekly-capex','wa-cash-shock'];
 if(ids.some(id=>$(id).value.trim()==='')){status.textContent='Enter all four hypothetical assumptions.';return;}
 const assumptions={
  weeklyReceiptsInr:Number($(ids[0]).value),weeklyOperatingPaymentsInr:Number($(ids[1]).value),
  weeklyCapexInr:Number($(ids[2]).value),shockPct:Number($(ids[3]).value),
 };
 let projection;
 try{projection=project13WeekCash({statement:qualifiedStatement,assumptions});}
 catch{status.textContent='Invalid assumptions: use non-negative INR amounts and a sensitivity from 0 to 100%.';return;}
 if(projection.status!=='ILLUSTRATIVE_ONLY'){status.textContent=projection.reason;return;}
 status.textContent='ILLUSTRATIVE ONLY · Signed opening cash '+MONEY.format(projection.openingCashInr)+
  ' as of '+projection.sourceThrough+'; all future receipts, payments and CAPEX are your manual assumptions.';
 const summary=el('div',undefined,'wa-stats');
 for(const scenario of projection.scenarios){
  const card=el('div',undefined,'wa-stat');
  card.append(el('small',scenario.id+' · ending week 13'),el('strong',MONEY.format(scenario.endingCashInr)),
   el('small',scenario.firstDeficitWeek===null?'No assumed deficit in 13 weeks':
    scenario.firstDeficitWeek===0?'Opening cash already negative':'Assumed deficit at week '+scenario.firstDeficitWeek));
  summary.append(card);
 }
 const scroll=el('div',undefined,'wa-scroll'),table=el('table');
 table.append(el('caption','Hypothetical closing cash in INR by week; no actual future balances'));
 const head=el('thead'),headRow=el('tr');
 for(const name of ['Week ending','Base','Downside','Upside'])headRow.append(el('th',name));
 head.append(headRow);table.append(head);
 const body=el('tbody');
 for(let i=0;i<13;i++){
  const row=el('tr');
  row.append(el('td',projection.scenarios[0].rows[i].weekEnding));
  for(const scenario of projection.scenarios)row.append(el('td',MONEY.format(scenario.rows[i].closingInr)));
  body.append(row);
 }
 table.append(body);scroll.append(table);
 host.append(summary,scroll,el('p',projection.limitations,'wa-period-note'));
}
$('wa-cash-scenario-form').addEventListener('submit',event=>{event.preventDefault();drawCashScenario();});
const el=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=String(value);if(cls)n.className=cls;return n;};
function render(packet){
 const host=$('wa-financial-kpis'),chart=$('wa-financial-chart');
 host.replaceChildren();chart.replaceChildren();
 const metrics=[
  ['Revenue',packet.revenueInr,'money'],['Cost of goods sold',packet.costOfGoodsSoldInr,'money'],
  ['Gross profit',packet.grossProfitInr,'money'],['Net profit',packet.netProfitInr,'money'],
  ['Gross margin',packet.grossMarginPct,'pct'],['Net margin',packet.netMarginPct,'pct'],
  ['Closing cash',packet.closingCashInr,'money'],['Unit manufacturing cost',packet.unitManufacturingCostInr,'money'],
  ['Operating cash flow',packet.operatingCashFlowInr,'money'],
  ['Direct asset-bank CAPEX',packet.directCashCapexInr,'money'],
  ['Indicative FCF · direct CAPEX only',packet.indicativeFreeCashFlowInr,'money'],
  ['Net working capital',packet.workingCapitalInr,'money'],
  ['DSO · indicative',packet.dsoDays,'days'],
  ['Inventory days · indicative',packet.dioDays,'days'],
  ['Payables to COGS days · proxy',packet.payablesToCogsDays,'days'],
  ['Cash conversion cycle · proxy',packet.cashConversionCycleProxyDays,'days']
 ];
 for(const [name,raw,kind] of metrics){
  const card=el('div',undefined,'wa-stat');
  card.append(el('small',name),el('strong',val(raw)?kind==='pct'?raw.toFixed(2)+'%':kind==='days'?raw.toFixed(1)+' days':MONEY.format(raw):'Not available'));
  host.append(card);
 }
 const chartMetrics=metrics.slice(0,4).filter(([,raw])=>val(raw));
 const max=Math.max(1,...chartMetrics.map(([,raw])=>Math.abs(raw)));
 for(const [label,value] of chartMetrics){
  const row=el('div',undefined,'wa-bar-row');
  const caption=el('div',undefined,'wa-bar-label');
  caption.append(el('span',label),el('strong',MONEY.format(value)));
  const track=el('div',undefined,'wa-track');
  track.setAttribute('role','img');track.setAttribute('aria-label',label+': '+MONEY.format(value));
  const fill=el('div',undefined,'wa-fill');fill.style.width=(100*Math.abs(value)/max)+'%';
  if(value<0)fill.style.backgroundColor='#b35d59';
  track.append(fill);row.append(caption,track);chart.append(row);
 }
 if(!chartMetrics.length)chart.append(el('p','No qualified posted financial amounts in this period.'));
 const suffix=packet.status==='POSTED_ACTUALS'
  ?'Posted and reconciled financial results.'
  :packet.status==='NO_POSTED_ACTIVITY'
   ?'No posted journal activity in this period. Profit and margin are intentionally unavailable.'
   :'Financial reconciliation hold. Amounts are withheld.';
 $('wa-financial-status').textContent=suffix+' Period '+packet.from+' to '+packet.to+
  ' · posted journals '+packet.periodJournalCount+
  ' · manufacturing cost snapshots '+packet.costSnapshotCount+
  ' · observed '+new Date(packet.observedAt).toLocaleString()+
  '. Source: '+packet.source+'. Cash CAPEX is direct asset-bank evidence only; indicative FCF and turnover-day proxies are not certified totals.';
 acceptCashStatement(packet);
}
async function refresh(){
 const from=$('wa-period-from').value,to=$('wa-period-to').value,button=$('wa-financial-refresh');
 const ticket=++request;
 $('wa-financial-kpis').replaceChildren();$('wa-financial-chart').replaceChildren();
 clearCashScenario('Awaiting current, reconciled closing cash. Prior scenario cleared.');
 button.disabled=false;
 if(!from||!to||from>to){$('wa-financial-status').textContent='Select a valid reporting period above.';return;}
 button.disabled=true;
 $('wa-financial-status').textContent='Reading signed VYNDI OS financial statements…';
 try{
  const response=await fetch('/api/finance-scorecard?'+new URLSearchParams({from,to}),{credentials:'same-origin',cache:'no-store'});
  if(ticket!==request)return;
  if(response.status===401){location.assign('/login');return;}
  if(!response.ok)throw Error('NOT_AVAILABLE');
  const data=(await response.json())?.data;
  if(ticket!==request)return;
  if(!data||data.schemaVersion!=='VAOS_FINANCIAL_SCORECARD_V1'||data.readOnly!==true||data.from!==from||data.to!==to)throw Error('INVALID_PACKET');
  render(data);
 }catch{
  if(ticket!==request)return;
  $('wa-financial-kpis').replaceChildren();$('wa-financial-chart').replaceChildren();
  clearCashScenario('Financial source unavailable. Hypothetical scenarios are withheld.');
  $('wa-financial-status').textContent='Financial statements not connected or not reconciled. Revenue, profit and cash are not estimated from status counts.';
 }finally{if(ticket===request)button.disabled=false;}
}
$('wa-financial-refresh').addEventListener('click',refresh);
for(const id of ['wa-period-from','wa-period-to','wa-period-presets'])$(id).addEventListener('change',refresh);
document.addEventListener('vaos:workforce-loaded',refresh);
