import {layoutKnowledgeView,UNIVERSE_SOURCES} from './lib/unified-knowledge-graph.mjs';
const NS='http://www.w3.org/2000/svg';
const PALETTE=['#74dddc','#f3cc83','#b09cff','#8caef5','#7dcfa5','#e89cb8','#d0e5ff',
 '#e9b27c','#80b8f1','#e2d18f','#b2c4eb'];
export const universeColor=source=>PALETTE[Math.max(0,UNIVERSE_SOURCES.indexOf(source))%PALETTE.length];
function el(type,attrs={},text=null){
 const node=document.createElementNS(NS,type);
 for(const [name,value] of Object.entries(attrs))node.setAttribute(name,String(value));
 if(text!==null)node.textContent=String(text);
 return node;
}
export function createUniverseRenderer(svg,onSelect){
 let group=null,zoom=1,x=0,y=0,drag=null,current={nodes:[],edges:[]};
 const setTransform=()=>{if(group)group.setAttribute('transform','translate('+x+' '+y+') scale('+zoom+')');};
 const reset=()=>{zoom=1;x=0;y=0;setTransform();};
 const adjust=factor=>{zoom=Math.max(.6,Math.min(3,zoom*factor));setTransform();};
 function matrix(view){
  const nodes=view.nodes.slice(0,30),step=Math.min(18,500/Math.max(1,nodes.length));
  const originX=335,originY=105;
  svg.append(el('text',{x:48,y:55,fill:'#f0d39c','font-size':16},'Relationship matrix · '+nodes.length+' records'));
  group=el('g');
  const relationships=new Set(view.edges.map(e=>e.from+'|'+e.to));
  nodes.forEach((node,i)=>{
   const label=el('text',{x:originX-12,y:originY+i*step+step*.7,'text-anchor':'end',
    fill:universeColor(node.source),'font-size':Math.min(11,step*.72)},node.label.slice(0,34));
   label.setAttribute('role','button');label.setAttribute('tabindex','0');
   label.addEventListener('click',()=>onSelect(node.id));
   label.addEventListener('keydown',e=>{if(e.key==='Enter'){onSelect(node.id);}});
   group.append(label);
   group.append(el('text',{x:originX+i*step+step/2,y:originY-10,'text-anchor':'middle',
    fill:'#b6cfda','font-size':8},i+1));
   nodes.forEach((target,j)=>{
    const linked=relationships.has(node.id+'|'+target.id);
    const r=el('rect',{x:originX+j*step,y:originY+i*step,width:step-1,height:step-1,rx:2,
     fill:linked?universeColor(node.source):'#193346',opacity:linked?.94:.4});
    if(linked)r.append(el('title',{},node.label+' → '+target.label));
    group.append(r);
   });
  });
  svg.append(group);
 }
 function constellation(view,mode,focus){
  const defs=el('defs'),gradient=el('radialGradient',{id:'knowledge-universe-glow'});
  gradient.append(el('stop',{offset:'0%','stop-color':'#bff5e8','stop-opacity':'.25'}),
   el('stop',{offset:'100%','stop-color':'#172841','stop-opacity':'.01'}));
  const marker=el('marker',{id:'universe-arrow',markerWidth:7,markerHeight:7,refX:6,refY:3,orient:'auto'});
  marker.append(el('path',{d:'M0 0 L6 3 L0 6',fill:'none',stroke:'#a0c5d0','stroke-width':1}));
  defs.append(gradient,marker);svg.append(defs);
  svg.append(el('circle',{cx:600,cy:350,r:290,fill:'url(#knowledge-universe-glow)'}));
  const position=new Map(layoutKnowledgeView(view,{mode}).map(p=>[p.id,p]));
  group=el('g');
  const edges=el('g',{'aria-hidden':'true'});
  for(const e of view.edges){
   const a=position.get(e.from),b=position.get(e.to);
   if(!a||!b)continue;
   const line=el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,
    stroke:universeColor(e.source),'stroke-opacity':'.38','stroke-width':1.25,
    'marker-end':'url(#universe-arrow)'});
   line.append(el('title',{},e.relation));edges.append(line);
  }
  group.append(edges);
  const nodes=el('g');
  for(const node of view.nodes){
   const p=position.get(node.id);if(!p)continue;
   const selected=node.id===focus;
   const g=el('g',{transform:'translate('+p.x+' '+p.y+')',class:'universe-node',
    role:'button',tabindex:0,'aria-label':'Inspect '+node.label});
   const shade=universeColor(node.source);
   g.append(el('circle',{r:selected?23:15,fill:shade,opacity:'.14'}));
   g.append(el('circle',{r:selected?8:6,fill:shade,stroke:selected?'#ffe7a6':'#c4dfe7',
    'stroke-width':selected?2:0.6}));
   if(view.nodes.length<95||selected)
    g.append(el('text',{x:13,y:3,fill:selected?'#fce4ae':'#c3dbe5',
     'font-size':selected?12:10},node.label.slice(0,32)));
   g.append(el('title',{},node.label+' · '+node.source));
   g.addEventListener('click',()=>onSelect(node.id));
   g.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(node.id);}
   });
   nodes.append(g);
  }
  group.append(nodes);svg.append(group);
 }
 function render(view,mode,focus){
  current=view;svg.replaceChildren();group=null;reset();
  svg.append(el('title',{},view.nodes.length+' source-linked graph nodes; '+view.edges.length+' directed edges'));
  if(!view.nodes.length)return;
  if(mode==='matrix')matrix(view);
  else constellation(view,mode,focus);
  setTransform();
 }
 svg.addEventListener('wheel',event=>{
  if(!current.nodes.length)return;event.preventDefault();adjust(event.deltaY<0?1.12:.89);
 },{passive:false});
 svg.addEventListener('pointerdown',event=>{
  if(!current.nodes.length||event.target.closest('.universe-node'))return;
  drag={x:event.clientX,y:event.clientY,ox:x,oy:y};svg.setPointerCapture(event.pointerId);
 });
 svg.addEventListener('pointermove',event=>{
  if(!drag)return;
  const box=svg.getBoundingClientRect();
  x=drag.ox+(event.clientX-drag.x)*1200/box.width;
  y=drag.oy+(event.clientY-drag.y)*700/box.height;setTransform();
 });
 for(const name of ['pointerup','pointercancel','lostpointercapture'])
  svg.addEventListener(name,()=>{drag=null;});
 return {render,reset,adjust};
}
