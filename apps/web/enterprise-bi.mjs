// Founder enterprise BI: one signed server aggregate for all 16 source-ledger departments.
// Source record activity must never be presented as verified AI execution or a profit forecast.
const $=id=>document.getElementById(id);
const DEPARTMENTS=[
 ['orchestrator','Enterprise governance'],['project','Projects'],['vibpe','Engineering planning'],
 ['risk','Risk'],['knowledge','Knowledge'],['release','Quality release'],['qa','Quality assurance'],
 ['commercial','Sales'],['procurement','Procurement'],['inventory','Inventory'],
 ['production','Production'],['maintenance','Maintenance'],['finance','Finance'],
 ['people','HR & People'],['engineering-configuration','Engineering change'],['security','Security']
];
const el=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=String(value);if(cls)n.className=cls;return n;};
let ticket=0,packet=null,filter='';
function chart(host,statuses){
 host.replaceChildren();
 const items=(Array.isArray(statuses)?statuses:[])
  .filter(x=>Number.isSafeInteger(x.count)&&x.count>=0&&typeof x.status==='string').slice(0,5);
 const max=Math.max(1,...items.map(x=>x.count));
 if(!items.length){host.append(el('p','No dated status evidence for this period.'));return;}
 for(const x of items){
  const line=el('div',undefined,'wa-bar-row');
  const label=el('div',undefined,'wa-bar-label');label.append(el('span',x.status),el('strong',x.count));
  const track=el('div',undefined,'wa-track');
  track.setAttribute('role','img');track.setAttribute('aria-label',x.status+': '+x.count);
  const bar=el('div',undefined,'wa-fill');bar.style.width=(100*x.count/max)+'%';
  track.append(bar);line.append(label,track);host.append(line);
 }
}
function render(data){
 packet=data;
 const host=$('wa-enterprise-grid');host.replaceChildren();
 const byId=new Map(data.departments.map(x=>[x.employeeId,x]));
 const observed=data.departments.filter(x=>x.status==='OBSERVED');
 const unavailable=data.departments.length-observed.length;
 const sum=observed.reduce((a,x)=>a+(Number.isSafeInteger(x.periodEventCount)?x.periodEventCount:0),0);
 const stats=$('wa-enterprise-kpis');stats.replaceChildren();
 for(const [label,value] of [['Responding sources',observed.length+' / 16'],
  ['Uncommissioned / unavailable',unavailable],
  ['Dated source records',sum]]){
  const card=el('div',undefined,'wa-stat');card.append(el('small',label),el('strong',value));stats.append(card);
 }
 for(const [id,name] of DEPARTMENTS){
  if(filter&&!name.toLowerCase().includes(filter)&&!id.includes(filter))continue;
  const record=byId.get(id);
  const card=el('article',undefined,'wa-period-card');
  card.append(el('h3',name));
  if(!record||record.status!=='OBSERVED'){
   card.append(el('p','Source unavailable / not commissioned. Counts and forecast unknown.'));
  }else{
   const count=Number.isSafeInteger(record.periodEventCount)?record.periodEventCount:null;
   card.append(el('strong',count===null?'Count unavailable':count+' dated source records'));
   card.append(el('p',(Number.isSafeInteger(record.flaggedStatusCount)?record.flaggedStatusCount:'Unknown')+
    ' records with possible open/held/error statuses. Status classification is preliminary, not verified discrepancy closure.'));
   const bars=el('div',undefined,'wa-viz-bars');chart(bars,record.statusDistribution);card.append(bars);
   const details=el('details',undefined,'wa-accordion');
   details.append(el('summary','Inspect dated source rows ('+(record.records?.length??0)+' shown)'));
   const table=el('table');const head=el('thead');
   const hr=el('tr');for(const h of ['Source date','Status','Record reference'])hr.append(el('th',h));
   head.append(hr);table.append(head);
   const body=el('tbody');
   for(const item of (Array.isArray(record.records)?record.records:[])){
    const tr=el('tr');
    const reference=item.fields?.id??item.fields?.reference??item.fields?.source_reference??'Not supplied';
    for(const v of [item.date??'Undated',item.status??'Unknown',reference])tr.append(el('td',v));
    body.append(tr);
   }
   table.append(body);const wrap=el('div',undefined,'wa-scroll');wrap.append(table);details.append(wrap);
   if(record.detailPage?.hasMore)details.append(el('p','Additional source rows exist; results are a bounded page.'));
   card.append(details);
   card.append(el('p','Source: '+String(record.sourceTable??'Not supplied')+' · Forecast: not qualified'));
  }
  const open=el('button','Open responsible employee →');open.type='button';
  open.addEventListener('click',()=>{
   const selector=$('wa-period-employee');
   if([...selector.options].some(x=>x.value===id)){
    selector.value=id;selector.dispatchEvent(new Event('change',{bubbles:true}));
    $('wa-actual-title').scrollIntoView({behavior:'smooth',block:'start'});
   }
  });card.append(open);host.append(card);
 }
}
async function refresh(){
 const seq=++ticket,button=$('wa-enterprise-refresh');
 const from=$('wa-period-from').value,to=$('wa-period-to').value;
 if(!from||!to||from>to){$('wa-enterprise-status').textContent='Choose a valid period above.';return;}
 button.disabled=true;$('wa-enterprise-status').textContent='Reading authenticated 16-department source records…';
 try{
  const qs=new URLSearchParams({from,to,employee:'all',limit:'30'});
  const result=await fetch('/api/enterprise-bi?'+qs,{credentials:'same-origin',cache:'no-store'});
  if(result.status===401){location.assign('/login');return;}
  if(!result.ok)throw Error('SOURCE_UNAVAILABLE');
  const data=(await result.json()).data;
  if(data?.schemaVersion!=='VYNDI_ENTERPRISE_BI_V1'||data.readOnly!==true||
      data.scope!=='all'||data.period?.from!==from||data.period?.to!==to||
      !Array.isArray(data.departments))throw Error('UNQUALIFIED_SOURCE');
  if(seq!==ticket)return;
  render(data);
  const available=data.departments.filter(x=>x.status==='OBSERVED').length;
  $('wa-enterprise-status').textContent=available+' of 16 source ledgers responded for '+from+' to '+to+
   '. Source rows and flagged statuses do not establish AI output, audited completion, profitability or a reliable forecast.';
 }catch{
  if(seq!==ticket)return;
  packet=null;$('wa-enterprise-grid').replaceChildren();$('wa-enterprise-kpis').replaceChildren();
  $('wa-enterprise-status').textContent='Authoritative 16-department source not available yet. No fabricated zeros, jobs or forecasts.';
 }finally{if(seq===ticket)button.disabled=false;}
}
$('wa-enterprise-refresh').addEventListener('click',refresh);
$('wa-enterprise-search').addEventListener('input',e=>{filter=e.target.value.trim().toLowerCase();if(packet)render(packet);});
for(const id of ['wa-period-from','wa-period-to','wa-period-presets'])$(id).addEventListener('change',()=>{
 if($('wa-period-from').value&&$('wa-period-to').value)refresh();
});
document.addEventListener('vaos:workforce-loaded',refresh);
