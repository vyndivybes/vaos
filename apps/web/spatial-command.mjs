import {projectSpatialSignals, selectSheetRows, SPATIAL_DATASETS, GRAPH_NODES} from './spatial-command-model.mjs';

const $=id=>document.getElementById(id);
const snapshot={current:projectSpatialSignals(null)};
let motion='subtle';
const nodeDescriptions={
 'VAOS':'JARVIS orchestration, analytical reasoning and governed agent control. Production source status must be verified separately.',
 'VYNDI OS':'Canonical ERP, MES, financial and workforce authorities. Source observations arrive through signed, scoped reads.',
 'Graphify':'Graph and repository analysis surface. Actual workspace connectivity is not asserted by this diagram.',
 'Graphiti':'Temporal knowledge memory and relationship context. Runtime synchronization requires independent evidence.',
 'Obsidian':'Source notes and curated knowledge. Access and provenance remain source-specific.',
 'Neural Schema':'Semantic relationships and object structures for investigative navigation.',
 'Brain Graph':'Spatial graph exploration and cross-system relationships, pending verified source connections.',
 'LLM Wiki':'Knowledge explanation and retrieval, with reference attribution and no transaction authority.',
 'VEDM':'Engineering design and configuration knowledge, distinct from physically approved release state.'
};
const layout=[
 ['VAOS','0px','0px','120px'],['VYNDI OS','-195px','-52px','25px'],
 ['Graphify','150px','-122px','-70px'],['Graphiti','215px','78px','-30px'],
 ['Obsidian','-175px','118px','-110px'],['Neural Schema','7px','-151px','-110px'],
 ['Brain Graph','-15px','158px','5px'],['LLM Wiki','185px','-7px','-170px'],['VEDM','-190px','-154px','-190px']
];
function text(id,value){$(id).textContent=String(value)}
function setTab(id){
 const key=['overview','sheets','lineage'].includes(id)?id:'overview';
 for(const element of document.querySelectorAll('[role="tab"]')){
  const selected=element.dataset.tab===key;element.setAttribute('aria-selected',String(selected));element.tabIndex=selected?0:-1;
 }
 for(const element of document.querySelectorAll('.sp-panel-view'))element.hidden=element.id!=='sp-'+key;
 if(key==='sheets')renderSheet();
 if(key==='lineage')renderGraph();
}
function observedDate(){const pieces=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=t=>pieces.find(p=>p.type===t)?.value;return get('year')+'-'+get('month')+'-'+get('day')}
function windowPeriod(){const to=observedDate(),[y,m,d]=to.split('-').map(Number);const from=new Date(Date.UTC(y,m-1,d)-29*86400000).toISOString().slice(0,10);return {from,to}}
function renderSignals(){
 const s=snapshot.current;
 text('sp-observed',s.observed+' / '+s.expected);
 text('sp-observed-note',s.observed?s.observed+' signed aggregate families observed':'No trusted aggregate available');
 text('sp-confidence',s.status);
 text('sp-observed-at',s.observedAt&&Number.isFinite(Date.parse(s.observedAt))?new Date(s.observedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—');
 const badge=$('sp-top-status');
 badge.dataset.state=s.status;
 badge.textContent=s.status==='HOLD'?'Signed source unavailable':s.status==='PARTIAL'?'Partial signed observation':'Signed aggregates observed';
 const host=$('sp-source-bars');host.replaceChildren();
 const max=Math.max(1,...s.datasets.filter(x=>x.status==='OBSERVED').map(x=>x.total));
 for(const item of s.datasets){
  const group=document.createElement('div');group.className='sp-source';
  const heading=document.createElement('div');heading.className='sp-source-head';
  const label=document.createElement('span');label.className='sp-source-name';label.textContent=item.label;
  const info=document.createElement('small');info.textContent=item.group;heading.append(label,info);
  const value=document.createElement('span');value.className='sp-source-value';value.textContent=item.status==='OBSERVED'?item.total.toLocaleString('en-IN'):'HOLD';
  const track=document.createElement('div');track.className='sp-source-track';
  const fill=document.createElement('span');fill.className='sp-source-fill';
  fill.dataset.state=item.status;fill.style.width=item.status==='OBSERVED'?((item.total/max)*100).toFixed(2)+'%':'0%';
  track.append(fill);group.append(heading,value,track);host.append(group);
 }
 const sheet=$('sp-dataset-status');sheet.dataset.state=s.status;
 if(!SPATIAL_DATASETS.some(x=>x.id===$('sp-dataset').value))$('sp-dataset').value=SPATIAL_DATASETS[0].id;
 renderSheet();
}
function renderSheet(){
 const id=$('sp-dataset').value,match=snapshot.current.datasets.find(x=>x.id===id),rows=selectSheetRows(snapshot.current,id,$('sp-filter').value);
 const tbody=$('sp-sheet-body');tbody.replaceChildren();
 const badge=$('sp-dataset-status');badge.dataset.state=match?.status||'HOLD';badge.textContent=match?.status==='OBSERVED'?'Signed source observed':'HOLD · No qualified data';
 if(match?.status!=='OBSERVED' || rows.length===0){
  const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=3;
  td.textContent=match?.status!=='OBSERVED'?'Signed aggregate not available. A missing source is not zero.':'No aggregate rows match this filter.';
  tr.append(td);tbody.append(tr);
 }else{
  for(const row of rows){
   const tr=document.createElement('tr');
   for(const [key,i] of [['category',0],['status',1],['count',2]]){
    const td=document.createElement('td');td.textContent=key==='count'?row.count.toLocaleString('en-IN'):row[key];
    if(i===2)td.className='sp-num';tr.append(td);
   }
   tbody.append(tr);
  }
 }
 $('sp-export').disabled=match?.status!=='OBSERVED';
 text('sp-sheet-note',match?.status==='OBSERVED'?rows.length+' aggregate rows · Read-only · '+match.source:'Source evidence pending · No export');
}
function exportCsv(){
 const id=$('sp-dataset').value;
 const source=snapshot.current.datasets.find(x=>x.id===id);
 if(source?.status!=='OBSERVED')return;
 const rows=selectSheetRows(snapshot.current,id,$('sp-filter').value);
 // Prevent spreadsheet formula injection on externally provided category/status strings.
 const cell=v=>{const s=String(v);const protectedCell=/^[=+@-]/.test(s.trimStart())?"'"+s:s;return '"'+protectedCell.replaceAll('"','""')+'"';};
 const lines=[['Category','Status','Record count'],...rows.map(x=>[x.category,x.status,x.count])].map(row=>row.map(cell).join(',')).join('\r\n');
 const blob=new Blob(['\ufeff'+lines],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='vaos-'+id+'-aggregate.csv';link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function renderGraph(){
 const host=$('sp-graph-world');
 if(host.childElementCount)return;
 for(const [id,x,y,z] of layout){
  if(!GRAPH_NODES.find(n=>n.id===id))continue;
  const button=document.createElement('button');button.type='button';button.className='sp-graph-node';
  button.style.setProperty('--x',x);button.style.setProperty('--y',y);button.style.setProperty('--z',z);
  button.dataset.group=id==='VAOS'||id==='VYNDI OS'?'control':'knowledge';
  button.setAttribute('aria-pressed',String(id==='VAOS'));button.textContent=id;
  const category=document.createElement('span');category.textContent=id==='VAOS'||id==='VYNDI OS'?'Control':'Knowledge';
  button.append(category);
  button.addEventListener('click',()=>selectNode(id));host.append(button);
 }
 selectNode('VAOS');
}
function selectNode(id){
 for(const node of $('sp-graph-world').querySelectorAll('button'))node.setAttribute('aria-pressed',String(node.firstChild.textContent===id));
 text('sp-node-name',id);text('sp-node-note',nodeDescriptions[id]||'Architecture reference only; runtime linkage not certified.');
}
function attachSpatialMotion(){
 const stage=$('sp-graph-stage'),world=$('sp-graph-world');
 const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const apply=(x,y)=>{world.style.setProperty('--rx',x+'deg');world.style.setProperty('--ry',y+'deg')};
 stage.addEventListener('pointermove',event=>{
  if(reduce||motion==='off'||$('sp-lineage').hidden)return;
  const rect=stage.getBoundingClientRect(),px=(event.clientX-rect.left)/rect.width-.5,py=(event.clientY-rect.top)/rect.height-.5;
  const factor=motion==='immersive'?28:13;apply((-10-py*factor).toFixed(1),(-8+px*factor).toFixed(1));
 });
 stage.addEventListener('pointerleave',()=>apply(-12,-10));
 $('sp-motion').addEventListener('change',event=>{
  motion=event.target.value;if(motion==='off'||reduce)apply(0,0);else apply(-12,-10);
 });
 if(reduce){$('sp-motion').value='off';$('sp-motion').disabled=true;motion='off';apply(0,0);}
}
async function refreshSignals(){
 const button=$('sp-refresh');button.disabled=true;button.textContent='Refreshing…';
 try{
  const {from,to}=windowPeriod();
  const response=await fetch('/api/enterprise-bi?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to)+'&executive=1',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('SIGNED_READ_UNAVAILABLE');
  snapshot.current=projectSpatialSignals(await response.json());
 }catch{snapshot.current=projectSpatialSignals(null);}
 finally{renderSignals();button.disabled=false;button.textContent='Refresh sources ↻';}
}
async function initialize(){
 const msg=$('sp-session');
 try{
  const response=await fetch('/api/session',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  if(!response.ok || (await response.json()).authenticated!==true)throw new Error('AUTH_REQUIRED');
  msg.hidden=true;$('sp-main').hidden=false;
  const select=$('sp-dataset');for(const item of SPATIAL_DATASETS){const opt=document.createElement('option');opt.value=item.id;opt.textContent=item.label;select.append(opt);}
  document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>setTab(btn.dataset.tab)));
  select.addEventListener('change',renderSheet);$('sp-filter').addEventListener('input',renderSheet);
  $('sp-refresh').addEventListener('click',refreshSignals);$('sp-export').addEventListener('click',exportCsv);
  attachSpatialMotion();setTab('overview');await refreshSignals();
 }catch{
  msg.replaceChildren();msg.append(document.createTextNode('Authentication required. '));
  const login=document.createElement('a');login.href='/login';login.textContent='Sign in to VAOS';msg.append(login);
 }
}
initialize();
