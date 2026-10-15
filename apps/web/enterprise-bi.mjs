// The existing Workforce Analytics period/employee controls are the sole BI controls.
// All values here are VYNDI OS authority responses, never synthetic chart fixtures.
const $=id=>document.getElementById(id);
const create=(tag,value,cls)=>{const x=document.createElement(tag);if(value!==undefined)x.textContent=String(value);if(cls)x.className=cls;return x;};
let generation=0,enabled=false,currentOffset=0;
const limit=20;
function reset(){for(const id of ['wa-bi-summary','wa-bi-departments','wa-bi-chart','wa-bi-table'])$(id).replaceChildren();$('wa-bi-more').hidden=true;}
function render(data,append=false){
 if(!append)reset();
 const observed=data.departments.filter(x=>x.status==='OBSERVED');
 const absent=data.departments.filter(x=>x.status!=='OBSERVED');
 if(!append){
  const total=observed.reduce((s,d)=>s+d.periodEventCount,0);
  const flagged=observed.reduce((s,d)=>s+d.flaggedStatusCount,0);
  for(const [label,value] of [
   ['Departments reporting',observed.length+' / '+data.departments.length],
   ['Dated source rows · not unique jobs',total],
   ['Status flags for review',flagged],
   ['Unavailable department sources',absent.length]
  ]){const c=create('article',undefined,'wa-stat');c.append(create('small',label),create('strong',value));$('wa-bi-summary').append(c);}
  const collection=$('wa-bi-departments');
  for(const dep of data.departments){
   const card=create('button',undefined,'wa-bi-dept');
   card.type='button';
   card.append(create('strong',dep.department||dep.employeeId),
    create('span',dep.status==='OBSERVED'?
     dep.periodEventCount+' dated source rows · '+dep.flaggedStatusCount+' review flags':
     'Source unavailable — no figures inferred'));
   if(dep.status!=='OBSERVED')card.classList.add('wa-bi-unavailable');
   card.addEventListener('click',()=>{
    $('wa-period-employee').value=dep.employeeId;
    $('wa-period-employee').dispatchEvent(new Event('change',{bubbles:true}));
   });
   collection.append(card);
  }
  const chart=$('wa-bi-chart');chart.replaceChildren();
  const all=new Map();
  for(const dept of observed)for(const row of dept.statusDistribution||[]){
   const name=row.status||'Unclassified';
   all.set(name,(all.get(name)||0)+row.count);
  }
  const statuses=[...all].sort((a,b)=>b[1]-a[1]).slice(0,12);
  if(!statuses.length)chart.append(create('p','No dated records or source-status fields available for the selected period.'));
  const maximum=Math.max(1,...statuses.map(x=>x[1]));
  for(const [label,count] of statuses){
   const row=create('div',undefined,'wa-bar-row');
   row.append(create('div',label+'  ·  '+count,'wa-bar-label'));
   const track=create('div',undefined,'wa-track'),fill=create('div',undefined,'wa-fill');
   fill.style.width=(count/maximum*100).toFixed(1)+'%';
   track.append(fill);row.append(track);chart.append(row);
  }
  $('wa-bi-caveat').textContent=
   data.interpretation.join(' ')+' Detailed rows are paginated; totals come from complete server-side period aggregation.';
 }
 const tbody=$('wa-bi-table');
 let hasMore=false;
 for(const dept of observed){
  for(const item of dept.records||[]){
   const tr=create('tr');
   const details=Object.entries(item.fields||{}).map(([k,v])=>k+': '+v).join(' · ');
   for(const value of [dept.department,item.date||'No dated event',item.status,details||'No allowed fields'])
    tr.append(create('td',value));
   tbody.append(tr);
  }
  if(dept.detailPage?.hasMore)hasMore=true;
 }
 if(!tbody.childElementCount){const tr=create('tr'),cell=create('td','No dated VYNDI OS source records in the selected period.');cell.colSpan=4;tr.append(cell);tbody.append(tr);}
 $('wa-bi-more').hidden=!(hasMore&&data.scope!=='all');
 $('wa-bi-status').textContent=
  'Source-observed '+new Date(data.observedAt).toLocaleString()+' · '+data.period.from+' to '+data.period.to+
  ' · '+observed.length+' department sources observed, '+absent.length+' unavailable. Audits and forecasts are tracked separately.';
}
async function load(append=false){
 if(!enabled)return;
 const employee=$('wa-period-employee').value||'all';
 const from=$('wa-period-from').value,to=$('wa-period-to').value;
 if(!from||!to||from>to){$('wa-bi-status').textContent='Select a valid date period.';return;}
 if(!append){currentOffset=0;reset();}
 const run=++generation;
 $('wa-bi-status').textContent='Reading actual, signed VYNDI OS business records for '+employee+'…';
 try{
  const qs=new URLSearchParams({employee,from,to,offset:String(currentOffset),limit:String(employee==='all'?8:limit)});
  const result=await fetch('/api/enterprise-bi?'+qs,{credentials:'same-origin',cache:'no-store'});
  if(run!==generation)return;
  if(!result.ok)throw Error('SOURCE_UNAVAILABLE');
  const payload=(await result.json()).data;
  if(payload?.schemaVersion!=='VYNDI_ENTERPRISE_BI_V1'||payload?.readOnly!==true||
    payload.period?.from!==from||payload.period?.to!==to||payload.scope!==employee||!Array.isArray(payload.departments))
   throw Error('CONTRACT_INVALID');
  render(payload,append);
 }catch{
  if(run!==generation)return;
  if(!append)reset();
  $('wa-bi-status').textContent='VYNDI signed full-period intelligence source unavailable. No fabricated job totals, discrepancies or forecasts.';
 }
}
for(const id of ['wa-period-employee','wa-period-from','wa-period-to','wa-period-presets'])
 $(id).addEventListener('change',()=>{if(enabled)load(false);});
$('wa-bi-refresh').addEventListener('click',()=>load(false));
$('wa-bi-more').addEventListener('click',()=>{currentOffset+=limit;load(true);});
document.addEventListener('vaos:workforce-loaded',()=>{enabled=true;load(false);});
