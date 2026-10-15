// Founder-only financial scorecard. Values shown ONLY when supplied by a complete,
// reconciled, signed VYNDI OS posted-ledger financial statement response.
const $=id=>document.getElementById(id);
const MONEY=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2});
const val=v=>typeof v==='number'&&Number.isFinite(v);
let request=0;
const el=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=String(value);if(cls)n.className=cls;return n;};
function render(packet){
 const host=$('wa-financial-kpis'),chart=$('wa-financial-chart');
 host.replaceChildren();chart.replaceChildren();
 const metrics=[
  ['Revenue',packet.revenueInr,'money'],['Cost of goods sold',packet.costOfGoodsSoldInr,'money'],
  ['Gross profit',packet.grossProfitInr,'money'],['Net profit',packet.netProfitInr,'money'],
  ['Gross margin',packet.grossMarginPct,'pct'],['Net margin',packet.netMarginPct,'pct'],
  ['Closing cash',packet.closingCashInr,'money'],['Unit manufacturing cost',packet.unitManufacturingCostInr,'money']
 ];
 for(const [name,raw,kind] of metrics){
  const card=el('div',undefined,'wa-stat');
  card.append(el('small',name),el('strong',val(raw)?kind==='pct'?raw.toFixed(2)+'%':MONEY.format(raw):'Not available'));
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
  '. Source: '+packet.source+'.';
}
async function refresh(){
 const from=$('wa-period-from').value,to=$('wa-period-to').value,button=$('wa-financial-refresh');
 const ticket=++request;
 $('wa-financial-kpis').replaceChildren();$('wa-financial-chart').replaceChildren();
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
  $('wa-financial-status').textContent='Financial statements not connected or not reconciled. Revenue, profit and cash are not estimated from status counts.';
 }finally{if(ticket===request)button.disabled=false;}
}
$('wa-financial-refresh').addEventListener('click',refresh);
for(const id of ['wa-period-from','wa-period-to','wa-period-presets'])$(id).addEventListener('change',refresh);
document.addEventListener('vaos:workforce-loaded',refresh);
