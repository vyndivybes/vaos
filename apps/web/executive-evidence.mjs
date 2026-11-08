/** Source-first visual command for signed VYNDI departmental evidence.
 * No synthetic metrics, model estimates, mutation or source authority transfer.
 */
import {deriveEvidenceView,filterEvidenceRows,resolveEvidencePeriod} from './lib/executive-evidence-model.mjs';

const NS='http://www.w3.org/2000/svg';
const PALETTE={observed:'#cfff59',attention:'#ffb6aa',partial:'#f1cf84',other:'#a9abb8'};
const TITLES={observed:'Source returned OBSERVED',attention:'Source needs attention',partial:'Partial or stale source',other:'Other / unverified status'};
const el=(tag,cls,text)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(text!==undefined)node.textContent=String(text);
 return node;
};
const mark=(tag,attrs={},text)=>{
 const node=document.createElementNS(NS,tag);
 for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
 if(text!==undefined)node.textContent=String(text);
 return node;
};
const localDay=()=>new Date(Date.now()+5.5*3600*1000).toISOString().slice(0,10);
function sourceSummary(view){
 if(view.total===0)return 'The signed request returned no departmental rows. No completion or readiness is inferred.';
 if(view.counts.attention)return view.counts.attention+
  ' department source(s) require investigation before using their outputs for decisions.';
 if(view.counts.partial)return view.counts.partial+
  ' department source(s) report partial or stale coverage. Check completeness before analysis.';
 if(view.counts.other)return 'Some departments returned unrecognized source statuses. Review their source contracts.';
 return 'All returned departments report OBSERVED. This does not certify record completeness or business performance.';
}
function addMetric(host,label,value,note){
 const card=el('article','evi-metric');
 card.append(el('span','evi-metric-label',label),el('strong','evi-metric-value',value),
  el('small','evi-metric-note',note));host.append(card);
}
function coverageChart(host,view,onSelect){
 const section=el('section','evi-chart-card');
 const heading=el('div','evi-card-heading');
 heading.append(el('h3','', 'Source coverage, not business performance'),
  el('p','', 'Number of returned departmental source statuses across the selected reporting window.'));
 section.append(heading);
 const chart=mark('svg',{viewBox:'0 0 780 264',role:'img',
  'aria-label':'Departmental source status counts: '+
   Object.entries(view.counts).map(([state,n])=>state+' '+n).join(', ')});
 chart.append(mark('title',{},'Bounded signed-source coverage by returned status'));
 const max=Math.max(1,view.total);
 for(const [index,key] of ['observed','attention','partial','other'].entries()){
  const y=28+index*58;
  chart.append(mark('text',{x:20,y:y+13,fill:'#eeeeea','font-size':15},TITLES[key]));
  chart.append(mark('rect',{x:310,y,width:405,height:22,rx:4,fill:'#343438'}));
  if(view.counts[key])chart.append(mark('rect',{x:310,y,width:(405*view.counts[key]/max),height:22,rx:4,fill:PALETTE[key]}));
  chart.append(mark('text',{x:734,y:y+16,fill:'#f4f4f0','font-size':16,'font-weight':750},String(view.counts[key])));
 }
 section.append(chart);
 const shortcuts=el('div','evi-chart-actions');
 for(const key of ['attention','partial','observed','other']){
  const button=el('button','evi-filter-chip',TITLES[key]+' · '+view.counts[key]);
  button.type='button';
  button.disabled=view.counts[key]===0;
  button.style.setProperty('--evi-status-color',PALETTE[key]);
  button.addEventListener('click',()=>onSelect(key));
  shortcuts.append(button);
 }
 section.append(shortcuts);
 host.append(section);
}
export function mountExecutiveEvidence(host,{fetchImpl=globalThis.fetch,onState=()=>{},today=localDay}={}){
 if(!host||typeof host.replaceChildren!=='function')throw Error('EVIDENCE_HOST_INVALID');
 let disposed=false,controller=null,view=null,selectedId=null;
 const root=el('section','evi-dashboard');
 const heading=el('div','evi-intro');
 const headingText=el('div');
 headingText.append(el('span','evi-kicker','VAOS / GOVERNED INTELLIGENCE / VYNDI SIGNED READ'),
  el('h2','evi-title','Decision evidence, not decorative numbers.'),
  el('p','evi-lede','Identify which enterprise sources can support a decision, which need attention, and where to inspect the original records.'));
 heading.append(headingText);
 const sourcePill=el('span','evi-source-pill','SOURCE NOT LOADED');
 heading.append(sourcePill);root.append(heading);

 const controls=el('div','evi-controls');
 const periodLabel=el('label','evi-field','Reporting period');
 const period=el('select','evi-period');
 for(const days of [7,30,90]){
  const option=el('option','',days+' days');
  option.value=String(days);period.append(option);
 }
 period.value='30';periodLabel.append(period);
 const button=el('button','evi-refresh','Read signed sources');button.type='button';
 const filterLabel=el('label','evi-field','Source status');
 const state=el('select','evi-state');
 for(const [id,name] of [['all','All'],['attention','Needs attention'],['partial','Partial / stale'],['observed','Observed'],['other','Other']]){
  const option=el('option','',name);option.value=id;state.append(option);
 }
 filterLabel.append(state);
 const searchLabel=el('label','evi-field','Find department');
 const search=el('input','evi-search');search.type='search';search.placeholder='Department or source';search.maxLength=90;
 searchLabel.append(search);
 controls.append(periodLabel,button,filterLabel,searchLabel);root.append(controls);

 const notice=el('p','evi-notice','Not loaded. Select a period and read the founder-authorized signed VYNDI source.');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 const provenance=el('p','evi-provenance','No source read has occurred. Nothing is inferred from scenario graphs.');
 root.append(notice,provenance);
 const metrics=el('div','evi-metrics');root.append(metrics);
 const main=el('div','evi-content');
 const chartHost=el('div','evi-graphics');
 const rowsHost=el('div','evi-rows-host');
 const inspector=el('aside','evi-inspector');
 main.append(chartHost,rowsHost,inspector);root.append(main);
 const footer=el('p','evi-boundary','OBSERVED reports source readability, not verified business actuals. Period records and current attention counts are primary-ledger measures only; overlapping related ledgers are never summed. Engineering, finance, orders and agent authority remain governed separately.');
 root.append(footer);host.replaceChildren(root);

 function showDetails(row){
  inspector.replaceChildren();
  if(!row){
   inspector.append(el('h3','','Inspect a department'),el('p','','Select a source status to review its provenance and next useful investigation.'));
   return;
  }
  inspector.append(el('span','evi-kicker','SOURCE INSPECTOR'),el('h3','',row.name));
  const detail=el('dl','evi-details');
  for(const [key,value] of [
   ['Reported state',row.status],['Source reference',row.sourceRef||'Not supplied'],
   ['Source revision',row.sourceRevision||'Not supplied'],
   ['Source observed at',row.observedAt||'Not supplied'],
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
  inspector.append(el('h4','','Next investigation'),el('p','',row.nextStep));
  const anchor=el('a','evi-open-source','Open related VAOS workspace ↗');
  anchor.href=row.href;inspector.append(anchor);
 }
 function drawRows(){
  rowsHost.replaceChildren();
  if(!view)return;
  const heading=el('div','evi-card-heading');
  const filtered=filterEvidenceRows(view.rows,{state:state.value,query:search.value});
  heading.append(el('h3','','Department source register'),
   el('p','',filtered.length+' matching of '+view.total+' returned departments · '+view.period.from+' to '+view.period.to));
  rowsHost.append(heading);
  if(filtered.length===0){rowsHost.append(el('p','evi-empty','No source records match these filters. This is not a zero-business-activity claim.'));return;}
  const list=el('div','evi-source-list');
  for(const row of filtered){
   const entry=el('button','evi-source-row');entry.type='button';
   entry.setAttribute('aria-pressed',row.id===selectedId?'true':'false');
   entry.style.setProperty('--evi-status-color',PALETTE[row.category]);
   const first=el('span','evi-source-name',row.name);
   first.append(el('small','',row.id));
   const second=el('span','evi-source-state',row.status+(row.coverageStatus==='PARTIAL_OR_UNAVAILABLE'?' · PARTIAL COVERAGE':''));
   entry.append(first,second);
   entry.addEventListener('click',()=>{selectedId=row.id;showDetails(row);drawRows();});
   list.append(entry);
  }
  rowsHost.append(list);
 }
 function draw(){
  chartHost.replaceChildren();metrics.replaceChildren();
  if(!view){showDetails(null);return;}
  addMetric(metrics,'Returned source records',view.total,'Bounded signed response only');
  addMetric(metrics,'Observed sources',view.counts.observed,'Source state ≠ verified business actuals');
  addMetric(metrics,'Needs attention',view.counts.attention,'Investigate unavailable or HOLD sources');
  addMetric(metrics,'Partial / stale',view.counts.partial,'Coverage may be incomplete');
  coverageChart(chartHost,view,key=>{state.value=key;drawRows();});
  const insight=el('section','evi-insight');
  insight.append(el('h3','','Evidence-led next priority'),el('p','',sourceSummary(view)));
  chartHost.append(insight);
  showDetails(view.rows.find(x=>x.id===selectedId)||view.rows[0]||null);
  drawRows();
 }
 async function read(){
  if(disposed)return;
  controller?.abort();controller=new AbortController();
  button.disabled=true;view=null;selectedId=null;draw();
  notice.textContent='Reading source status from signed VYNDI OS bridge…';
  sourcePill.textContent='REQUEST IN PROGRESS';
  provenance.textContent='Do not interpret this as a live or complete business result.';
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
   view=next;sourcePill.textContent='SIGNED DEPARTMENTAL READ · '+(next.total?'RECORDS RETURNED':'NO RECORDS');
   provenance.textContent='Reporting window: '+dates.from+' to '+dates.to+
    ' · Returned statuses are source-reported; completeness and business truth remain unverified.';
   notice.textContent=sourceSummary(next);
   onState('Signed source status read completed. '+next.total+' departmental records returned; actual business results not certified.');
   draw();
  }catch(error){
   if(disposed||error?.name==='AbortError')return;
   sourcePill.textContent='SOURCE HOLD';
   notice.textContent='HOLD — '+(error?.message||'The signed source could not be checked')+'. No values have been inferred.';
   provenance.textContent='The existing scenario charts are separate and are not substitutes for unavailable evidence.';
   onState(notice.textContent);
  }finally{if(!disposed)button.disabled=false;}
 }
 button.addEventListener('click',()=>{void read();});
 state.addEventListener('change',drawRows);
 search.addEventListener('input',drawRows);
 showDetails(null);
 return ()=>{
  disposed=true;controller?.abort();host.replaceChildren();
 };
}
