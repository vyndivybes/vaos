const $=id=>document.getElementById(id);
const workLabels=[['planned','Planned'],['ready','Ready / queued'],['inProgress','In progress'],['completed','Marked completed'],['blocked','Blocked'],['failed','Failed'],['cancelled','Cancelled']];
let latest=null,selection='orchestrator';
function element(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e;}
function cell(row,value){const td=element('td',value);row.append(td);return td;}
function display(value){return value===undefined||value===null?'Not evidenced':String(value);}
function time(value){const date=Date.parse(value);return Number.isFinite(date)?new Date(date).toLocaleString():'Not evidenced';}
function bar(host,label,value,max){
 const wrapper=element('div',undefined,'wa-bar-row');
 const caption=element('div',undefined,'wa-bar-label');
 caption.append(element('span',label),element('strong',display(value)));
 const track=element('div',undefined,'wa-track');track.setAttribute('role','img');track.setAttribute('aria-label',label+': '+display(value));
 if(Number.isSafeInteger(value)&&value>=0){
  const fill=element('div',undefined,'wa-fill');fill.style.width=(max>0?Math.round(100*value/max):0)+'%';track.append(fill);
 }
 wrapper.append(caption,track);host.append(wrapper);
}
function counts(host,items){host.replaceChildren();for(const [name,value] of items){const d=element('div',undefined,'wa-stat');d.append(element('small',name),element('strong',display(value)));host.append(d);}}
function renderRoster(data){
 const table=$('wa-roster');table.replaceChildren();
 for(const emp of data.employees){
  const tr=element('tr');tr.dataset.current=String(emp.id===selection);
  const td=cell(tr,'');const button=element('button',emp.name);button.type='button';
  button.addEventListener('click',()=>{selection=emp.id;$('wa-select').value=selection;renderEmployee();});
  td.append(button);
  cell(tr,emp.lifecycle);cell(tr,emp.work.total);
  cell(tr,emp.verifiedClosures?.['90d']??null);cell(tr,emp.audit.status);
  table.append(tr);
 }
}
function renderWork(emp){
 const tbody=$('wa-work');tbody.replaceChildren();
 if(!emp.workItems.length){const tr=element('tr');const td=cell(tr,'No recent work-package records');td.colSpan=3;tbody.append(tr);return;}
 for(const item of emp.workItems){
  const tr=element('tr');cell(tr,display(item.missionId)+' · '+display(item.actionType));
  cell(tr,item.status);cell(tr,time(item.updatedAt));tbody.append(tr);
 }
}
function renderAudit(emp){
 $('wa-audit').textContent='Independent audit outcome: '+emp.audit.status+
  '. No PASS, defect closure or qualification inferred from assigned routes.';
 const tbody=$('wa-audit-pages');tbody.replaceChildren();
 for(const page of emp.audit.pages){
  const row=element('tr');cell(row,page.route+(page.requiresLedger?' (ledger required)':''));
  cell(row,page.status);tbody.append(row);
 }
}
function renderEmployee(){
 if(!latest)return;
 const emp=latest.employees.find(e=>e.id===selection)||latest.employees[0];
 if(!emp)return;
 selection=emp.id;
 $('wa-profile').replaceChildren();
 $('wa-profile').append(element('strong',emp.name),element('p','Department: '+display(emp.department)+
  ' · Status: '+emp.lifecycle+' · Qualification: '+(emp.qualificationLevel===null?'not evidenced':'Q'+emp.qualificationLevel)+
  ' · Activity: '+emp.activitySignal),
 element('p','Current assignment: '+display(emp.currentAssignment)),
 element('p','Last independently evidenced activity: '+time(emp.lastVerifiedActivityAt)));
 const bars=$('wa-status-bars');bars.replaceChildren();
 const max=Math.max(1,...workLabels.map(([key])=>emp.work[key]??0));
 for(const [key,label] of workLabels)bar(bars,label,emp.work[key],max);
 const trend=$('wa-trend');trend.replaceChildren();
 if(emp.verifiedClosures===null)trend.textContent='Verified closure history not available.';
 else{
  const maxTrend=Math.max(1,...Object.values(emp.verifiedClosures));
  for(const key of ['7d','30d','90d'])bar(trend,'Trailing '+key,emp.verifiedClosures[key],maxTrend);
 }
 $('wa-kpis').replaceChildren();
 for(const kpi of emp.configuredKpis){
  $('wa-kpis').append(element('li',kpi.replaceAll('_',' ')+' — measured value not connected'));
 }
 $('wa-forecast').textContent=emp.forecast.status+' — '+emp.forecast.reason+
  '. No projected completion date or confidence interval is claimed.';
 $('wa-defects').textContent='Status: '+emp.defects.status+
  '. Defect severity, CAPA and retesting records are not connected; no zero-defect claim.';
 renderWork(emp);renderAudit(emp);renderRoster(latest);
}
async function refresh(){
 $('wa-status').textContent='Reading workforce evidence…';$('wa-refresh').disabled=true;
 try{
  const r=await fetch('/api/workforce-analytics',{credentials:'same-origin',cache:'no-store'});
  if(r.status===401){location.assign('/login');return;}
  if(!r.ok)throw Error('NOT_COMMISSIONED');
  const data=(await r.json())?.data;
  if(!data||data.schemaVersion!=='VAOS_FOUNDER_ANALYTICS_V1'||data.actionAuthorized!==false||
    !Array.isArray(data.employees)||data.employees.length!==16)throw Error('INVALID_SOURCE');
  latest=data;
  $('wa-status').textContent='Read-only workforce evidence loaded; audit and forecast holds remain.';
  $('wa-observed').textContent='Observed '+time(data.observedAt)+' · source coverage '+data.dataCoverage;
  counts($('wa-totals'),[['Employees recorded',data.summary.registered+'/16'],
   ['Planned work',data.summary.planned],['In progress',data.summary.inProgress],
   ['Marked completed',data.summary.completed],['Blocked',data.summary.blocked],
   ['Verified closures · 90d',data.summary.verifiedClosures90Days]]);
  const s=$('wa-select');s.replaceChildren();
  for(const emp of data.employees){const opt=element('option',emp.name);opt.value=emp.id;s.append(opt);}
  if(!data.employees.some(e=>e.id===selection))selection=data.employees[0].id;
  s.value=selection;renderEmployee();
 }catch{
  latest=null;$('wa-status').textContent='Analytics source unavailable or migration uncommissioned. No employee metrics can be inferred.';
  $('wa-observed').textContent='No validated snapshot';$('wa-totals').replaceChildren();
  $('wa-roster').replaceChildren();$('wa-select').replaceChildren();
 }finally{$('wa-refresh').disabled=false;}
}
$('wa-refresh').addEventListener('click',refresh);
$('wa-select').addEventListener('change',event=>{selection=event.target.value;renderEmployee();});
refresh();
