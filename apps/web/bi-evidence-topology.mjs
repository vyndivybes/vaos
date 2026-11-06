// Interactive, source-backed ontology-style evidence view for the existing BI Studio.
// NVIDIA ontology concepts are design guidance, not a paid runtime dependency.
// No totals are inferred: different source rows and departments may overlap.
const text=(tag,value,cls)=>{
 const node=document.createElement(tag);
 if(value!==undefined)node.textContent=String(value);
 if(cls)node.className=cls;
 return node;
};
const safeText=(value,fallback)=>typeof value==='string'&&value.trim()?value.trim().slice(0,240):fallback;
const isMeasured=row=>Number.isSafeInteger(row?.value)&&row.value>=0&&
 (row.state==='REAL'||(row.state==='EMPTY'&&row.value===0));

export function prepareEvidenceTopology(rows) {
 const evidence=Array.isArray(rows)?rows.filter(row=>row&&typeof row==='object'):[];
 const measured=evidence.filter(isMeasured);
 const observed=measured.filter(row=>row.value>0).length;
 const empty=measured.filter(row=>row.value===0).length;
 const unavailable=evidence.length-measured.length;
 const maxObserved=Math.max(1,...measured.map(row=>row.value));
 const nodes=evidence.slice(0,64).map((row,index)=>{
  const qualified=isMeasured(row),value=qualified?row.value:null;
  return {
   id:index,
   agent:safeText(row.agent,'unknown'),
   label:safeText(row.label,'Unnamed record'),
   source:safeText(row.source,'Source not supplied'),
   reason:safeText(row.reason,'No independently observed numeric value is available'),
   value,
   state:value===null?'unavailable':value===0?'empty':'observed',
   intensity:value===null?0:Math.round(value/maxObserved*100),
  };
 });
 return {total:evidence.length,visible:nodes.length,omitted:evidence.length-nodes.length,
  observed,empty,unavailable,maxObserved,nodes};
}

export function renderEvidenceTopology(host,packet,onInspect) {
 const map=prepareEvidenceTopology(packet?.rows);
 const main=text('section',undefined,'bi-topology');
 main.setAttribute('aria-label','Business evidence topology');
 const intro=text('div',undefined,'bi-topology-intro');
 intro.append(text('h4','Source-to-decision evidence map'),
  text('p','Each cell represents a source-backed report row. Numbers are not summed across overlapping sources or departments.'));
 const rail=text('div',undefined,'bi-topology-rail');
 for(const step of ['VYNDI signed source','Department','Defined metric','Evidence state']){
  rail.append(text('span',step));
 }
 const totals=text('div',undefined,'bi-topology-totals');
 for(const [label,value,state] of [
  ['Measured rows',map.observed,'observed'],
  ['Observed empty',map.empty,'empty'],
  ['Unavailable / held',map.unavailable,'unavailable'],
 ]){
  const item=text('div',undefined,'bi-topology-stat');item.dataset.state=state;
  item.append(text('strong',value),text('span',label));totals.append(item);
 }
 const grid=text('div',undefined,'bi-topology-grid');
 grid.setAttribute('aria-label','Source evidence by department and recorded state');
 for(const node of map.nodes){
  const card=text('button',undefined,'bi-topology-node');
  card.type='button';
  card.dataset.state=node.state;
  card.style.setProperty('--bi-strength',node.intensity+'%');
  card.setAttribute('aria-label','Inspect '+node.label+', '+(node.value===null?'unavailable':node.value+' '+(packet?.metric?.unit||'records'))+'. Source: '+node.source);
  const head=text('span',undefined,'bi-topology-node-head');
  head.append(text('span',node.agent),text('small',node.state==='observed'?'OBSERVED':node.state==='empty'?'EMPTY':'UNAVAILABLE'));
  card.append(head,text('strong',node.value===null?'Unknown':new Intl.NumberFormat('en-IN').format(node.value),'bi-topology-node-value'),
   text('span',node.label,'bi-topology-node-label'),
   text('small','Source: '+node.source,'bi-topology-node-source'));
  if(node.state==='unavailable')card.append(text('small',node.reason,'bi-topology-node-reason'));
  card.addEventListener('click',()=>onInspect?.(node.agent));
  grid.append(card);
 }
 if(!map.total)grid.append(text('p','No source evidence returned. Unknown is not zero.'));
 const footer=text('p',
  (map.omitted?'Showing '+map.visible+' of '+map.total+' evidence rows; use the data table for all rows. ':'')+
  'OBSERVED identifies a source response, not independent financial or operational verification. The view is read-only.',
  'bi-topology-note');
 main.append(intro,rail,totals,grid,footer);
 host.append(main);
}
