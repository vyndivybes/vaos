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
const WORKSPACES={orchestrator:'governance',project:'planning',vibpe:'engineering',risk:'governance',
 knowledge:'engineering',release:'operations',qa:'operations',commercial:'sales',procurement:'purchase-execution',
 inventory:'inventory',production:'production',maintenance:'operations',finance:'financial-cockpit',
 people:'people-office','engineering-configuration':'engineering',security:'governance'};
let ticket=0,packet=null,filter='';
const loadingPages=new Set();
const expandedSources=new Set();
function chart(host,statuses){
 host.replaceChildren();
 const items=(Array.isArray(statuses)?statuses:[])
  .filter(x=>Number.isSafeInteger(x.count)&&x.count>=0&&typeof x.status==='string');
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
function sourceDetails(record,host){
 const sources=record.sources||[];
 if(!sources.length)return;
 host.append(el('h4','Governed source coverage'));
 host.append(el('p',sources.filter(x=>x.status==='OBSERVED').length+' / '+sources.length+
  ' sources observed. Sources overlap; do not add them as employee output.'));
 for(const source of sources){
  const details=el('details',undefined,'wa-accordion');
  const expansionKey=record.employeeId+':'+source.sourceTable;
  details.open=expandedSources.has(expansionKey);
  details.addEventListener('toggle',()=>{if(details.open)expandedSources.add(expansionKey);else expandedSources.delete(expansionKey);});
  details.append(el('summary',source.sourceTable+' · '+source.status));
  if(source.status!=='OBSERVED'){details.append(el('p','Unavailable. Counts, records and forecasts unknown.'));host.append(details);continue;}
  details.append(el('p','Dated source rows: '+source.periodEventCount+' · Undated current rows: '+source.undatedCount+
   ' · Explicit training / fixtures excluded (all dates): '+source.excludedTrainingCount+
   ' · Origin unclassified (all dates): '+source.unclassifiedOriginCount));
  const states=source.currentRecordedStates;
  if(states){
   details.append(el('h4','Current recorded states, all dates'));
   const bars=el('div',undefined,'wa-viz-bars');
   chart(bars,Object.entries(states).map(([status,count])=>({status,count})));details.append(bars);
  }
  details.append(el('p','Recorded states describe source workflow stages. Finished does not prove AI execution, independent audit or an in-period completion.'));
  const wrap=el('div',undefined,'wa-scroll'),table=el('table'),head=el('thead'),row=el('tr');
  for(const h of ['Source date','Status','Available business fields'])row.append(el('th',h));head.append(row);table.append(head);
  const body=el('tbody');
  for(const record of source.records||[]){
   const tr=el('tr');
   for(const value of [record.date?(record.date+' ['+(record.dateField||'source date')+']'):'Undated',record.status??'Unknown',
    Object.entries(record.fields||{}).map(([k,v])=>k+': '+String(v)).join(' · ')])tr.append(el('td',value));
   body.append(tr);
  }
  table.append(body);wrap.append(table);details.append(wrap);
  const offset=source.detailPage?.offset??0,limit=source.detailPage?.limit??30;
  for(const [label,next,disabled] of [['Previous source rows',Math.max(0,offset-limit),offset===0],
   ['Next source rows',offset+limit,!source.detailPage?.hasMore||offset+limit>5000]]){
   const button=el('button',label);button.type='button';button.disabled=disabled||loadingPages.has(record.employeeId);
   button.setAttribute('aria-label',record.employeeId+' '+source.sourceTable+': '+label);
   button.addEventListener('click',()=>{expandedSources.add(expansionKey);return loadPage(record.employeeId,next,source.sourceTable);});details.append(button);
  }
  host.append(details);
 }
 host.append(el('p','Business plan vs actual: '+(record.planVsActual?.reason||'Comparable baseline unavailable.')),
  el('p','Independent audit: '+(record.audit?.reason||'Independent review not supplied.')),
  el('p','Forecast: '+(record.forecast?.reason||'No independently qualified dated source forecast.')));
}
function planComparison(data){
 const host=$('wa-business-comparison');if(!host)return;host.replaceChildren();
 const report=data.businessPlanComparison;
 host.append(el('p','Enterprise product demand comparison. Departmental work-plan attainment remains in the employee report.'));
 if(!report||report.status!=='CLOSED_PERIOD_COMPARISON'){
  host.append(el('p',report?.reason||'Comparable approved pre-period vintages and closed actuals unavailable. No plan or actual zeros inferred.'));return;
 }
 const wrap=el('div',undefined,'wa-scroll'),table=el('table'),head=el('thead'),tr=el('tr');
 for(const h of ['Product','Plan month','Approved plan units','Closed actual units','Variance units','Vintage / close'])tr.append(el('th',h));
 head.append(tr);table.append(head);const body=el('tbody');
 for(const r of report.rows||[]){
  const row=el('tr');for(const v of [r.productId,r.planMonth,r.planQty,r.actualQty,r.planErrorUnits,r.vintageId+' / '+r.closeId])row.append(el('td',v));body.append(row);
 }
 table.append(body);wrap.append(table);host.append(wrap);
 const chartHost=el('div',undefined,'wa-viz-bars');
 chart(chartHost,[{status:'Approved plan units',count:report.planUnits},{status:'Closed actual units',count:report.actualUnits}]);host.append(chartHost);
 const f=report.forecastAssessment;
 host.append(el('p',report.note),el('p','Forecast evidence: '+f.status+'. '+f.reason+
  ' Future employee delivery forecast remains unavailable without independent qualification.'));
 if(f.status==='BACKTEST_AVAILABLE')host.append(el('p','Demand WAPE '+f.wapePct+'% / bias '+f.biasPct+'%. Source: '+report.source));
}
function render(data){
 packet=data;
 planComparison(data);
 const host=$('wa-enterprise-grid');host.replaceChildren();
 const byId=new Map(data.departments.map(x=>[x.employeeId,x]));
 const observed=data.departments.filter(x=>x.status==='OBSERVED');
 const unavailable=data.departments.length-observed.length;
 const sum=observed.reduce((a,x)=>a+(Number.isSafeInteger(x.periodEventCount)?x.periodEventCount:0),0);
 const backlogObserved=observed.filter(x=>Number.isSafeInteger(x.currentSourceCount));
 const currentRows=backlogObserved.reduce((a,x)=>a+x.currentSourceCount,0);
 const attention=backlogObserved.reduce((a,x)=>a+(Number.isSafeInteger(x.currentAttentionCount)?x.currentAttentionCount:0),0);
 const stats=$('wa-enterprise-kpis');stats.replaceChildren();
 for(const [label,value] of [['Responding primary sources',observed.length+' / 16'],
  ['Uncommissioned / unavailable',unavailable],
  ['Primary source rows in period',sum],
  ['Current source records (all dates)',backlogObserved.length?currentRows:'Not observed'],
  ['Current pending / hold / draft flags',backlogObserved.length?attention:'Not observed']]){
  const card=el('div',undefined,'wa-stat');card.append(el('small',label),el('strong',value));stats.append(card);
 }
 for(const [id,name] of DEPARTMENTS){
  if(filter&&!name.toLowerCase().includes(filter)&&!id.includes(filter))continue;
  const record=byId.get(id);
  const card=el('article',undefined,'wa-period-card premium-department');
  const heading=el('div',undefined,'premium-department-head');
  const icon=el('span',name.split(' ').map(x=>x[0]).slice(0,2).join(''),'premium-department-icon');
  icon.setAttribute('aria-hidden','true');heading.append(icon,el('h3',name));card.append(heading);
  if(!record||record.status!=='OBSERVED'){
   card.append(el('p','Primary source unavailable / not commissioned. Counts and forecast unknown.'));
   if(record)sourceDetails(record,card);
  }else{
   const count=Number.isSafeInteger(record.periodEventCount)?record.periodEventCount:null;
   const number=el('div',undefined,'premium-department-number');
   number.append(el('strong',Number.isSafeInteger(record.currentAttentionCount)?record.currentAttentionCount:'—'),
    el('span','pending / held / draft'));
   card.append(number);
   const currentChart=el('div',undefined,'wa-viz-bars');
   chart(currentChart,record.currentStatusDistribution);card.append(currentChart);
   const context=el('details',undefined,'wa-accordion');
   context.open=expandedSources.has(id+':context');
   context.addEventListener('toggle',()=>{if(context.open)expandedSources.add(id+':context');else expandedSources.delete(id+':context');});
   context.append(el('summary','Period activity & source context'));
   context.append(el('strong',count===null?'Count unavailable':count+' dated source records'));
   context.append(el('p',(Number.isSafeInteger(record.flaggedStatusCount)?record.flaggedStatusCount:'Unknown')+
    ' records with possible open/held/error statuses. Status classification is preliminary, not verified discrepancy closure.'));
   context.append(el('p',(Number.isSafeInteger(record.currentAttentionCount)?record.currentAttentionCount:'Not observed')+
    ' current pending/hold/draft-type status flags across '+(Number.isSafeInteger(record.currentSourceCount)?record.currentSourceCount:'unknown')+
    ' source records (all dates). These are open backlogs, not in-period completions or audited defects.'));
   context.append(el('h4','Activity recorded in selected period'));
   const bars=el('div',undefined,'wa-viz-bars');chart(bars,record.statusDistribution);context.append(bars);
   context.append(el('h4','Current backlog and source status (all dates)'));
   const backlog=el('div',undefined,'wa-viz-bars');
   if(Array.isArray(record.currentStatusDistribution))chart(backlog,record.currentStatusDistribution);
   else backlog.append(el('p','Current backlog not supplied by the authoritative source.'));
   context.append(backlog);
   const details=el('details',undefined,'wa-accordion');
   details.open=expandedSources.has(id);
   details.addEventListener('toggle',()=>{
    if(details.open)expandedSources.add(id);else expandedSources.delete(id);
   });
   const offset=record.detailPage?.offset??0,limit=record.detailPage?.limit??30;
   const shown=record.records?.length??0;
   details.append(el('summary','Inspect dated source rows ('+(shown?offset+1:0)+'–'+(offset+shown)+' of '+count+')'));
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
   if(!shown)details.append(el('p','No dated source records in the selected period. Current backlog can still exist.'));
   const pages=el('div',undefined,'wa-heading');
   for(const [label,next,disabled] of [['Previous records',Math.max(0,offset-limit),offset===0],
     ['Next records',offset+limit,!record.detailPage?.hasMore||offset+limit>5000]]){
    const page=el('button',label);page.type='button';
    page.setAttribute('aria-label',name+': '+label.toLowerCase());
    page.disabled=disabled||loadingPages.has(id);
    page.addEventListener('click',()=>{expandedSources.add(id);return loadPage(id,next);});pages.append(page);
   }
   details.append(pages);
   card.append(details);
   context.append(el('p','Source: '+String(record.sourceTable??'Not supplied')+' · Forecast: not qualified'));
   sourceDetails(record,context);
   card.append(context);
  }
  const source=el('a','Inspect current records in VYNDI OS');
  source.href='https://vyndios.vayushastr.workers.dev/command/'+WORKSPACES[id];
  source.textContent='Open VYNDI OS ↗';
  const actions=el('div',undefined,'premium-department-foot');actions.append(source);
  const open=el('button','View employee →');open.type='button';
  open.addEventListener('click',()=>{
   const selector=$('wa-period-employee');
   if([...selector.options].some(x=>x.value===id)){
    selector.value=id;selector.dispatchEvent(new Event('change',{bubbles:true}));
    $('wa-actual-title').scrollIntoView({behavior:'smooth',block:'start'});
   }
  });actions.append(open);card.append(actions);host.append(card);
 }
}
async function loadPage(employeeId,offset,sourceTable=null){
 if(!packet||loadingPages.has(employeeId))return;
 const seq=ticket,{from,to}=packet.period;
 loadingPages.add(employeeId);render(packet);
 try{
  const result=await fetch('/api/enterprise-bi?'+new URLSearchParams({from,to,employee:employeeId,limit:'30',offset:String(offset),
    ...(sourceTable?{source:sourceTable}:{})}),
   {credentials:'same-origin',cache:'no-store'});
  if(seq!==ticket)return;
  if(result.status===401){location.assign('/login');return;}
  if(!result.ok)throw Error('SOURCE_UNAVAILABLE');
  const data=(await result.json()).data;
  if(seq!==ticket)return;
  const record=data?.departments?.find(x=>x.employeeId===employeeId);
  if(data?.schemaVersion!=='VYNDI_ENTERPRISE_BI_V1'||data.readOnly!==true||data.scope!==employeeId||
    data.period?.from!==from||data.period?.to!==to||!record||
    (sourceTable?record.sources?.find(x=>x.sourceTable===sourceTable)?.status:record.status)!=='OBSERVED'||
    (sourceTable?record.sources?.find(x=>x.sourceTable===sourceTable)?.detailPage:record.detailPage)?.offset!==offset)throw Error('UNQUALIFIED_PAGE');
  packet={...packet,departments:packet.departments.map(x=>x.employeeId===employeeId?record:x)};
 }catch{
  if(seq===ticket)$('wa-enterprise-status').textContent='Source page unavailable. Previously observed rows are retained; retry with the record controls.';
 }finally{
  loadingPages.delete(employeeId);
  if(seq===ticket&&packet)render(packet);
 }
}
async function refresh(){
 const seq=++ticket,button=$('wa-enterprise-refresh');
 const from=$('wa-period-from').value,to=$('wa-period-to').value;
 packet=null;loadingPages.clear();
 $('wa-enterprise-grid').replaceChildren();$('wa-enterprise-kpis').replaceChildren();
 $('wa-business-comparison')?.replaceChildren();
 button.disabled=false;
 if(!from||!to||from>to){$('wa-enterprise-status').textContent='Choose a valid period above.';return;}
 button.disabled=true;$('wa-enterprise-status').textContent='Reading authenticated 16-department source records…';
 try{
  const qs=new URLSearchParams({from,to,employee:'all',limit:'30'});
  const result=await fetch('/api/enterprise-bi?'+qs,{credentials:'same-origin',cache:'no-store'});
  if(seq!==ticket)return;
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
   '. Period activity and all-time current backlog are separate; no source status alone establishes AI output, audited completion, profit or a reliable forecast.';
 }catch{
  if(seq!==ticket)return;
  packet=null;$('wa-enterprise-grid').replaceChildren();$('wa-enterprise-kpis').replaceChildren();
 $('wa-business-comparison')?.replaceChildren();
  $('wa-enterprise-status').textContent='Authoritative 16-department source not available yet. No fabricated zeros, jobs or forecasts.';
 }finally{if(seq===ticket)button.disabled=false;}
}
$('wa-enterprise-refresh').addEventListener('click',refresh);
$('wa-enterprise-search').addEventListener('input',e=>{filter=e.target.value.trim().toLowerCase();if(packet)render(packet);});
for(const id of ['wa-period-from','wa-period-to','wa-period-presets'])$(id).addEventListener('change',()=>{
 if($('wa-period-from').value&&$('wa-period-to').value)refresh();
});
document.addEventListener('vaos:workforce-loaded',refresh);
