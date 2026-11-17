/** Source-first visual command for signed VYNDI departmental evidence.
 * No synthetic metrics, model estimates, mutation or source authority transfer.
 */
import {deriveEvidenceView,filterEvidenceRows,resolveEvidencePeriod} from './lib/executive-evidence-model.mjs';
import {deriveExecutiveSignals} from './lib/executive-signals-model.mjs';
import {renderExecutiveSignals} from './executive-signals-view.mjs';

const PALETTE={observed:'var(--shell-accent, #205b45)',attention:'#a54732',partial:'#956b20',other:'#63746b'};
const TITLES={observed:'Readable source',attention:'Needs attention',partial:'Partial or stale source',other:'Other or unknown'};
const el=(tag,cls,text)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(text!==undefined)node.textContent=String(text);
 return node;
};
const localDay=()=>new Date(Date.now()+5.5*3600*1000).toISOString().slice(0,10);
function sourceSummary(view){
 if(view.total===0)return 'VYNDI OS returned no departments for this period.';
 if(view.counts.attention)return view.counts.attention+
  (view.counts.attention===1?' department source needs attention.':' department sources need attention.');
 if(view.counts.partial)return view.counts.partial+
  (view.counts.partial===1?' department source is partial or stale.':' department sources are partial or stale.');
 if(view.counts.other)return 'Some sources returned an unknown status. Open a department to review its details.';
 return 'All returned department sources were readable.';
}
function coverageChart(host,view,onSelect){
 const section=el('section','evi-chart-card');
 const heading=el('div','evi-card-heading');
 heading.append(el('h3','','Department source status'),
  el('p','',view.total+' departments returned. Select a status to filter the list.'));
 const actions=el('div','evi-chart-actions');
 const buttons=[];
 for(const key of ['attention','partial','observed','other']){
  const button=el('button','evi-filter-chip');
  button.type='button';
  button.dataset.category=key;
  button.disabled=view.counts[key]===0;
  button.style.setProperty('--evi-status-color',PALETTE[key]);
  const track=el('span','evi-signal-track');
  track.setAttribute('aria-hidden','true');
  const fill=el('span','evi-signal-fill');
  fill.style.width=100*view.counts[key]/Math.max(1,view.total)+'%';
  track.append(fill);
  button.append(el('span','',TITLES[key]),el('strong','',view.counts[key]),track);
  button.addEventListener('click',()=>onSelect(key));
  buttons.push(button);
  actions.append(button);
 }
 section.append(heading,actions);
 host.append(section);
 return buttons;
}
export function mountExecutiveEvidence(host,{fetchImpl=globalThis.fetch,onState=()=>{},today=localDay}={}){
 if(!host||typeof host.replaceChildren!=='function')throw Error('EVIDENCE_HOST_INVALID');
 let disposed=false,controller=null,signalsController=null,view=null,selectedId=null,chartButtons=[];
 const root=el('section','evi-dashboard');
 const controls=el('div','evi-controls');
 const periodLabel=el('label','evi-field','Reporting period');
 const period=el('select','evi-period');
 for(const days of [7,30,90]){
  const option=el('option','',days+' days');
  option.value=String(days);period.append(option);
 }
 period.value='30';periodLabel.append(period);
 const button=el('button','evi-refresh','Check department sources');button.type='button';
 const signalsButton=el('button','evi-refresh evi-refresh-secondary','Load business summaries');signalsButton.type='button';
 const filterLabel=el('label','evi-field','Source status');
 const state=el('select','evi-state');
 for(const [id,name] of [['all','All'],['attention','Needs attention'],['partial','Partial / stale'],['observed','Readable source'],['other','Other']]){
  const option=el('option','',name);option.value=id;state.append(option);
 }
 filterLabel.append(state);
 const searchLabel=el('label','evi-field','Find department');
 const search=el('input','evi-search');search.type='search';search.placeholder='Department or source';search.maxLength=90;
 searchLabel.append(search);
 controls.append(periodLabel,button);root.append(controls);
 const filters=el('div','evi-controls evi-filters');
 filters.append(filterLabel,searchLabel);

 const notice=el('p','evi-notice','Choose a reporting period to see which VYNDI OS sources need attention.');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 const provenance=el('p','evi-provenance','Signed, read-only data from VYNDI OS.');
 root.append(notice,provenance);
 const signalStatus=el('p','evi-signal-status','These are current source counts. The department date filter does not apply.');
 signalStatus.setAttribute('role','status');signalStatus.setAttribute('aria-live','polite');
 const signalsHost=el('div','evi-signal-host');
 const summaries=el('details','evi-summaries');
 summaries.append(el('summary','','CRM, HR and dispatch summaries'),signalStatus,signalsButton,signalsHost);
 const main=el('div','evi-content');
 const chartHost=el('div','evi-graphics');
 const rowsHost=el('div','evi-rows-host');
 const inspector=el('aside','evi-inspector');
 main.hidden=true;
 main.append(chartHost,filters,rowsHost,inspector);root.append(main,summaries);
 const footer=el('p','evi-boundary','A readable source returned records. Completeness and business results still need separate verification. Department counts refer to the primary source only.');
 root.append(footer);host.replaceChildren(root);

 function showDetails(row){
  inspector.replaceChildren();
  if(!row){
   inspector.append(el('h3','','Inspect a department'),el('p','','Choose a department to see when its source was checked and what to review.'));
   return;
  }
  inspector.append(el('span','evi-kicker','Source details'),el('h3','',row.name));
  const detail=el('dl','evi-details');
  for(const [key,value] of [
   ['Reported state',row.status],['Source reference',row.sourceRef||'Not supplied'],
   ['Source revision',row.sourceRevision||'Not supplied'],
   ['Source last reported (UTC)',row.observedAt||'Not supplied'],
   ['Related source coverage',row.expectedRelatedSources===null?'Not supplied':String(row.observedRelatedSources??'Unknown')+' / '+row.expectedRelatedSources+' observed'],
   ['Primary source records in selected period',row.periodEventCount===null?'Not supplied':String(row.periodEventCount)],
   ['Current primary-source attention records',row.currentAttentionCount===null?'Not supplied':String(row.currentAttentionCount)],
   ['Operational completeness','Not independently verified'],
   ['Transaction authorization','None — read only']
  ]){
   const item=el('div','evi-detail');
   item.append(el('dt','',key),el('dd','',value));detail.append(item);
  }
  inspector.append(detail);
  if(row.reason)inspector.append(el('p','evi-reason','Reported reason: '+row.reason));
  inspector.append(el('h4','','What to check next'),el('p','',row.nextStep));
  const anchor=el('a','evi-open-source','Open related VAOS workspace ↗');
  anchor.href=row.href;inspector.append(anchor);
 }
 function drawRows(){
  rowsHost.replaceChildren();
  if(!view)return;
  for(const chip of chartButtons)chip.setAttribute('aria-pressed',String(chip.dataset.category===state.value));
  const heading=el('div','evi-card-heading');
  const filtered=filterEvidenceRows(view.rows,{state:state.value,query:search.value});
  heading.append(el('h3','','Departments'),
   el('p','',filtered.length+' matching of '+view.total+' returned departments · '+view.period.from+' to '+view.period.to));
  const active=filtered.find(row=>row.id===selectedId)||filtered[0];
  selectedId=active?.id??null;
  showDetails(active);
  rowsHost.append(heading);
  if(filtered.length===0){rowsHost.append(el('p','evi-empty','No departments match these filters.'));return;}
  const list=el('div','evi-source-list');
  for(const row of filtered){
   const entry=el('button','evi-source-row');entry.type='button';
   entry.setAttribute('aria-pressed',row.id===selectedId?'true':'false');
   entry.style.setProperty('--evi-status-color',PALETTE[row.category]);
   const first=el('span','evi-source-name',row.name);
   first.append(el('small','',row.id));
   const second=el('span','evi-source-state',row.status+(row.coverageStatus==='PARTIAL_OR_UNAVAILABLE'?' · PARTIAL COVERAGE':''));
   entry.append(first,second);
   entry.addEventListener('click',()=>{
    selectedId=row.id;
    for(const button of list.children)button.setAttribute('aria-pressed',String(button===entry));
    showDetails(row);
   });
   list.append(entry);
  }
  rowsHost.append(list);
 }
 function draw(){
  chartHost.replaceChildren();
  main.hidden=!view;
  if(!view)return;
  chartButtons=coverageChart(chartHost,view,key=>{
   state.value=state.value===key?'all':key;
   drawRows();
  });
  drawRows();
 }
 async function read(){
  if(disposed)return;
  controller?.abort();controller=new AbortController();
  button.disabled=true;view=null;selectedId=null;draw();
  notice.textContent='Checking department sources…';
  provenance.textContent='Signed, read-only data from VYNDI OS.';
  try{
   const dates=resolveEvidencePeriod(today(),Number(period.value));
   const query=new URLSearchParams({...dates,employee:'all',limit:'5'});
   const response=await fetchImpl('/api/enterprise-bi?'+query,{
    method:'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,
    headers:{Accept:'application/json'}
   });
   if(!response.ok)throw Error(response.status===401?'Founder session expired':response.status===403?'Founder access denied':'SIGNED_SOURCE_HTTP_'+response.status);
   const parsed=await response.json();
   const next=deriveEvidenceView(parsed?.data,dates);
   if(disposed)return;
   view=next;
   provenance.textContent='Reporting window: '+dates.from+' to '+dates.to+
    ' (India time) · Signed VYNDI OS source';
   notice.textContent=sourceSummary(next);
   onState('Signed source status read completed. '+next.total+' departmental records returned; actual business results not certified.');
   draw();
  }catch(error){
   if(disposed||error?.name==='AbortError')return;
   notice.textContent='HOLD — '+(error?.message||'The signed source could not be checked')+'.';
   provenance.textContent='Department results are unavailable. Try checking sources again.';
   onState(notice.textContent);
  }finally{if(!disposed)button.disabled=false;}
 }
 async function readSignals(){
  if(disposed)return;
  signalsController?.abort();signalsController=new AbortController();
  signalsButton.disabled=true;
  signalsHost.replaceChildren();
  signalStatus.textContent='Loading current business summaries…';
  try{
   const dates=resolveEvidencePeriod(today(),Number(period.value));
   const query=new URLSearchParams({...dates,employee:'all',executive:'1',limit:'5'});
   const response=await fetchImpl('/api/enterprise-bi?'+query,{
    method:'GET',credentials:'same-origin',cache:'no-store',
    signal:signalsController.signal,headers:{Accept:'application/json'}
   });
   if(!response.ok)throw Error(response.status===401?'Founder session expired':
    response.status===403?'Founder access denied':'EXECUTIVE_SOURCE_HTTP_'+response.status);
   const packet=(await response.json())?.data;
   const result=deriveExecutiveSignals(packet,dates);
   if(disposed)return;
   renderExecutiveSignals(signalsHost,result);
   signalStatus.textContent='Loaded '+result.observedCount+
    ' of 7 business summaries. '+result.holdCount+' on hold.';
   onState('Executive canonical status aggregates displayed; no cross-source summation or certified forecasts.');
  }catch(error){
   if(disposed||error?.name==='AbortError')return;
   signalStatus.textContent='HOLD — '+(error?.message||'Executive aggregate source unavailable')+'. No fabricated counts displayed.';
   onState(signalStatus.textContent);
  }finally{if(!disposed)signalsButton.disabled=false;}
 }
 button.addEventListener('click',()=>{void read();});
 signalsButton.addEventListener('click',()=>{void readSignals();});
 state.addEventListener('change',drawRows);
 search.addEventListener('input',drawRows);
 showDetails(null);
 return ()=>{
  disposed=true;controller?.abort();signalsController?.abort();host.replaceChildren();
 };
}
