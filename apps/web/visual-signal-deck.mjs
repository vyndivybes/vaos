import {validateSankey} from './lib/advanced-visual-model.mjs';

const SVG_NS='http://www.w3.org/2000/svg';
const format=new Intl.NumberFormat('en-IN',{maximumFractionDigits:1});
const html=(tag,className,text)=>{
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(text!==undefined)node.textContent=String(text);
 return node;
};
const svg=(tag,attrs={},value)=>{
 const node=document.createElementNS(SVG_NS,tag);
 for(const [key,item] of Object.entries(attrs))node.setAttribute(key,String(item));
 if(value!==undefined)node.textContent=String(value);
 return node;
};

/**
 * Convert only validated Sankey values into a spatial overview. Graph geometry
 * is presentational; quantities, lineage and inspector values are not inferred.
 */
export function buildSignalModel(raw,{selectedId}={}){
 const data=validateSankey(raw);
 const columns=new Map();
 for(const node of data.nodes){
  if(!columns.has(node.layer))columns.set(node.layer,[]);
  columns.get(node.layer).push(node);
 }
 const maxLayer=Math.max(...columns.keys());
 const maxColumn=Math.max(...[...columns.values()].map(group=>group.length));
 const width=Math.max(1120,maxLayer*145+160);
 const height=Math.max(430,maxColumn*98+95);
 const nodes=[];
 for(const [layer,group] of columns){
  group.sort((a,b)=>b.weight-a.weight||a.id.localeCompare(b.id));
  group.forEach((node,index)=>{
   nodes.push({...node,x:80+(width-160)*(maxLayer?layer/maxLayer:0),
    y:74+(height-148)*(index+1)/(group.length+1)});
  });
 }
 const byId=new Map(nodes.map(node=>[node.id,node]));
 const maxFlow=Math.max(1,...data.links.map(link=>link.value));
 const links=data.links.map((link,index)=>({
  ...link,index,from:byId.get(link.source),to:byId.get(link.target),
  thickness:2+7*Math.sqrt(link.value/maxFlow)
 }));
 const requested=byId.get(selectedId);
 const selected=requested||byId.get('production')||nodes[0];
 return {
  nodes,links,width,height,unit:data.unit,selectedId:selected.id,
  originTotal:nodes.filter(n=>n.incoming===0).reduce((sum,n)=>sum+n.outgoing,0),
  terminalTotal:nodes.filter(n=>n.outgoing===0).reduce((sum,n)=>sum+n.incoming,0),
  inspector:{
   id:selected.id,label:selected.label,incoming:selected.incoming,outgoing:selected.outgoing,
   upstream:links.filter(l=>l.target===selected.id).map(l=>({id:l.source,label:l.from.label,value:l.value})),
   downstream:links.filter(l=>l.source===selected.id).map(l=>({id:l.target,label:l.to.label,value:l.value}))
  }
 };
}

function pathFor(link){
 const x1=link.from.x+25,x2=link.to.x-25;
 const bend=Math.max(20,(x2-x1)*.47);
 return 'M '+x1+' '+link.from.y+' C '+(x1+bend)+' '+link.from.y+', '+(x2-bend)+' '+link.to.y+', '+x2+' '+link.to.y;
}

function makeGraph(scene,choose){
 const chart=svg('svg',{class:'vs-network-svg',viewBox:'0 0 '+scene.width+' '+scene.height,
  role:'group','aria-label':'Interactive scenario flow graph. Select any node for its incoming and outgoing evidence.'});
 const title=svg('title',{},'Operational material flow · synthetic or unverified scenario');
 chart.append(title);
 const defs=svg('defs');
 const gradient=svg('linearGradient',{id:'vs-flow-gradient',x1:'0%',y1:'0%',x2:'100%',y2:'0%'});
 gradient.append(svg('stop',{offset:'0%','stop-color':'#65b9ed'}),svg('stop',{offset:'48%','stop-color':'#75e7ce'}),svg('stop',{offset:'100%','stop-color':'#e9c17b'}));
 defs.append(gradient);
 const grid=svg('pattern',{id:'vs-graph-grid',width:36,height:36,patternUnits:'userSpaceOnUse'});
 grid.append(svg('path',{d:'M 36 0 L 0 0 0 36',fill:'none',stroke:'#35586d','stroke-opacity':'.32','stroke-width':'.7'}));
 defs.append(grid);chart.append(defs);
 chart.append(svg('rect',{width:scene.width,height:scene.height,fill:'url(#vs-graph-grid)',opacity:'.78'}));
 const linksLayer=svg('g',{'aria-hidden':'true'});
 for(const link of scene.links){
  const d=pathFor(link);
  linksLayer.append(svg('path',{d,class:'vs-link-underlay','stroke-width':link.thickness+8,
   'data-source':link.source,'data-target':link.target}));
  const stroke=svg('path',{d,class:'vs-link','stroke-width':link.thickness,
   'data-source':link.source,'data-target':link.target});
  stroke.append(svg('title',{},link.from.label+' → '+link.to.label+': '+format.format(link.value)+' '+scene.unit));
  linksLayer.append(stroke);
 }
 chart.append(linksLayer);
 const marks=svg('g');
 for(const node of scene.nodes){
  const group=svg('g',{class:'vs-node',role:'button',tabindex:0,'data-node-id':node.id,
   'aria-label':node.label+', '+format.format(node.incoming)+' incoming, '+format.format(node.outgoing)+' outgoing '+scene.unit});
  const halo=svg('circle',{cx:node.x,cy:node.y,r:35,class:'vs-node-halo'});
  const ring=svg('circle',{cx:node.x,cy:node.y,r:27,class:'vs-node-ring'});
  const inner=svg('circle',{cx:node.x,cy:node.y,r:20,class:'vs-node-core'});
  const index=svg('text',{x:node.x,y:node.y+5,'text-anchor':'middle',class:'vs-node-number'},String(node.layer+1).padStart(2,'0'));
  const label=svg('text',{x:node.x,y:node.y+51,'text-anchor':'middle',class:'vs-node-label'},node.label.length>18?node.label.slice(0,16)+'…':node.label);
  group.append(halo,ring,inner,index,label);
  group.append(svg('title',{},node.label+' — select to inspect scenario relationships'));
  group.addEventListener('click',()=>choose(node.id));
  group.addEventListener('keydown',event=>{
   if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(node.id);}
  });
  marks.append(group);
 }
 chart.append(marks);
 return chart;
}

function renderInspector(host,scene,choose){
 host.replaceChildren();
 const record=scene.inspector;
 host.append(html('span','vs-overline','NODE INSPECTOR / SCENARIO'),
  html('h3','vs-inspector-name',record.label),
  html('p','vs-inspector-help','Showing quantities from the selected unverified flow model, not live operations.'));
 const metrics=html('div','vs-inspector-metrics');
 for(const [label,value] of [['Incoming',record.incoming],['Outgoing',record.outgoing]]){
  const item=html('div','vs-inspector-metric');
  item.append(html('span','',label),html('strong','',format.format(value)),
   html('small','',scene.unit));
  metrics.append(item);
 }
 host.append(metrics);
 const relationships=html('div','vs-relations');
 for(const [title,items] of [['FROM',record.upstream],['TO',record.downstream]]){
  const section=html('section','vs-relation-group');
  section.append(html('h4','',title));
  if(!items.length)section.append(html('p','vs-none',title==='FROM'?'Origin stage':'Terminal stage'));
  for(const item of items){
   const button=html('button','vs-relation');
   button.type='button';
   button.append(html('span','',item.label),html('b','',format.format(item.value)));
   button.setAttribute('aria-label','Inspect '+item.label);
   button.addEventListener('click',()=>choose(item.id));
   section.append(button);
  }
  relationships.append(section);
 }
 host.append(relationships);
 const boundary=html('div','vs-boundary');
 boundary.append(html('strong','','SOURCE BOUNDARY'),
  html('p','','No signed evidence is attached to this visualization. Inspect governed BI for enterprise actuals.'));
 host.append(boundary);
}

/**
 * Premium overview with one spatial focal view and a synchronized mobile
 * step-through path. No network calls, writes, credentials or dependencies.
 */
export function renderSignalDeck(host,source,{provenance='SYNTHETIC DEMO',onNavigate}={}){
 let scene=buildSignalModel(source);
 const shell=html('section','vs-hero');
 shell.setAttribute('aria-label','Scenario digital thread and evidence inspector');
 const heading=html('div','vs-hero-heading');
 const left=html('div','vs-hero-title');
 left.append(html('p','vs-overline','THE ENTERPRISE DIGITAL THREAD'),
  html('h2','','From input to outcome.'),
  html('p','vs-subtitle','Explore how scenario inputs move through the chain. Choose a node to expose its upstream and downstream quantities.'));
 heading.append(left);
 const meta=html('div','vs-source');
 meta.append(html('span','vs-source-dot','◇'),html('span','',provenance==='SYNTHETIC DEMO'?'SYNTHETIC DEMO':'USER-SUPPLIED · UNVERIFIED'));
 heading.append(meta);
 shell.append(heading);
 const body=html('div','vs-hero-body');
 const stage=html('div','vs-stage');
 const stageTop=html('div','vs-stage-top');
 stageTop.append(html('div','vs-stage-label','◈ &nbsp; SIGNAL TOPOLOGY'));
 const button=html('button','vs-expand','Open full Sankey ↗');
 button.type='button';button.addEventListener('click',()=>onNavigate?.('sankey'));
 stageTop.append(button);stage.append(stageTop);
 const graphWrap=html('div','vs-graph-scroll');
 let graph;
 const mobile=html('div','vs-mobile-path');
 const inspector=html('aside','vs-inspector');
 inspector.setAttribute('aria-live','polite');
 function choose(id){
  scene=buildSignalModel(source,{selectedId:id});
  for(const node of graph.querySelectorAll('.vs-node')){
   const selected=node.getAttribute('data-node-id')===id;
   node.classList.toggle('is-selected',selected);
   node.setAttribute('aria-pressed',String(selected));
  }
  for(const link of graph.querySelectorAll('.vs-link,.vs-link-underlay'))
   link.classList.toggle('is-related',link.getAttribute('data-source')===id||link.getAttribute('data-target')===id);
  for(const item of mobile.querySelectorAll('button[data-node-id]')){
   const active=item.dataset.nodeId===id;
   item.classList.toggle('is-selected',active);
   item.setAttribute('aria-pressed',String(active));
  }
  renderInspector(inspector,scene,choose);
 }
 graph=makeGraph(scene,choose);graphWrap.append(graph);
 const sorted=[...scene.nodes].sort((a,b)=>a.layer-b.layer||a.y-b.y);
 for(const [i,node] of sorted.entries()){
  const b=html('button','vs-mobile-node');
  b.type='button';b.dataset.nodeId=node.id;
  b.append(html('span','vs-mobile-index',String(i+1).padStart(2,'0')),
   html('span','vs-mobile-label',node.label),
   html('span','vs-mobile-flow',format.format(node.outgoing||node.incoming)+' '+scene.unit));
  b.addEventListener('click',()=>choose(node.id));
  mobile.append(b);
 }
 stage.append(graphWrap,mobile);
 const summary=html('div','vs-flow-summary');
 for(const [label,value] of [['Origin flow',scene.originTotal],['Terminal flow',scene.terminalTotal],['Modelled stages',scene.nodes.length]]){
  const cell=html('div','vs-flow-cell');
  cell.append(html('span','',label),html('strong','',format.format(value)));
  if(label!=='Modelled stages')cell.append(html('small','',scene.unit));
  summary.append(cell);
 }
 stage.append(summary);
 body.append(stage,inspector);shell.append(body);host.append(shell);
 choose(scene.selectedId);
}
