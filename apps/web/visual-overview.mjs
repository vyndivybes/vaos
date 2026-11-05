import {
 validateSankey,waterfallSteps,heatmapCells,factoryStationMap,timelineBars,routePoints
} from './lib/advanced-visual-model.mjs';
import {
 renderSankey,renderWaterfall,renderHeatmap,renderTimeline,
 renderFunnel,renderLogistics
} from './advanced-visual-renderers.mjs';

const svgNS='http://www.w3.org/2000/svg';
const format=new Intl.NumberFormat('en-IN',{maximumFractionDigits:1});
const element=(tag,cls,text)=>{
 const n=document.createElement(tag);
 if(cls)n.className=cls;
 if(text!==undefined)n.textContent=String(text);
 return n;
};
const svg=(tag,attrs={},content)=>{
 const n=document.createElementNS(svgNS,tag);
 for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));
 if(content!==undefined)n.textContent=String(content);
 return n;
};
function metricValue(n,unit=''){
 if(!Number.isFinite(n))return 'Unverified';
 return (unit.toLowerCase().includes('inr')?'₹':'')+format.format(n);
}
function createKpi(root,{eyebrow,value,suffix,note,tone='mint',spark}){
 const card=element('article','av-dashboard-kpi');
 card.dataset.tone=tone;
 const top=element('div','av-kpi-top');
 top.append(element('span','av-kpi-label',eyebrow));
 const marker=element('span','av-kpi-marker');
 marker.setAttribute('aria-hidden','true');marker.textContent='◆';
 top.append(marker);
 card.append(top);
 const main=element('div','av-kpi-main');
 main.append(element('strong','av-kpi-value',value));
 if(suffix)main.append(element('span','av-kpi-unit',suffix));
 card.append(main);
 card.append(element('p','av-kpi-note',note));
 if(spark?.length)card.append(drawSparkline(spark,tone));
 root.append(card);
}
function drawSparkline(values,tone='mint'){
 const w=220,h=46,pad=4;
 const valid=values.filter(Number.isFinite);
 if(!valid.length)return element('span','av-mini-no-data','No observed values');
 const lo=Math.min(...valid),hi=Math.max(...valid);
 const span=Math.max(1,hi-lo);
 const points=values.map((v,i)=>Number.isFinite(v)?{
  x:pad+i*(w-pad*2)/Math.max(1,values.length-1),
  y:pad+(1-(v-lo)/span)*(h-pad*2)
 }:null);
 const graph=svg('svg',{viewBox:'0 0 220 46',class:'av-kpi-sparkline',role:'img',
  'aria-label':'Scenario trend miniature; not real-time telemetry'});
 let path='';
 for(let i=0;i<points.length;i++){
  if(!points[i])continue;
  path+=(i===0||!points[i-1]?'M ':'L ')+points[i].x+' '+points[i].y+' ';
 }
 graph.append(svg('path',{d:path,fill:'none',stroke:tone==='gold'?'#f1c279':'#70d1c2',
  'stroke-width':2.5,'stroke-linecap':'round','stroke-linejoin':'round'}));
 return graph;
}
function card(root,{mode,title,detail,eyebrow,wide='half',render}){
 const section=element('article','av-dashboard-card');
 section.dataset.span=wide;
 const header=element('header','av-dashboard-card-head');
 const headings=element('div');
 headings.append(element('p','av-dashboard-card-eyebrow',eyebrow),
   element('h3','',title),element('p','av-dashboard-card-detail',detail));
 const action=element('button','av-dashboard-open','Expand ↗');
 action.type='button';action.dataset.openViz=mode;action.setAttribute('aria-label','Expand '+title);
 header.append(headings,action);
 const chart=element('div','av-dashboard-chart');
 const footer=element('div','av-dashboard-card-footer');
 footer.append(element('span','','SCENARIO / NOT LIVE'),
   element('span','',mode.toUpperCase()+' VIEW'));
 section.append(header,chart,footer);
 root.append(section);
 try{render(chart);}catch(error){
  chart.replaceChildren();
  chart.append(element('p','av-dashboard-error','Unable to render this scenario: '+String(error.message||error)));
 }
 return section;
}
function renderTrend(host,scenario){
 const matrix=heatmapCells(scenario.heatmap);
 const daily=matrix.columns.map((column,i)=>{
  const observed=matrix.rows.map(r=>r.values[i]).filter(Number.isFinite);
  return observed.length?observed.reduce((a,b)=>a+b,0)/observed.length:null;
 });
 const canvas=svg('svg',{viewBox:'0 0 720 265',role:'img',class:'av-dashboard-trend',
   'aria-label':'Illustrative station measurements by sample period. Missing cells are not plotted.'});
 const gridY=[40,88,136,184,232];
 for(const y of gridY){
  canvas.append(svg('line',{x1:50,y1:y,x2:690,y2:y,stroke:'#2a4355',
   'stroke-width':1,'stroke-dasharray':'3 6'}));
 }
 const valid=daily.filter(Number.isFinite),min=valid.length?Math.min(...valid):0,max=valid.length?Math.max(...valid):100;
 const scale=Math.max(1,max-min);
 const points=daily.map((v,i)=>Number.isFinite(v)?{
  x:50+i*(640/Math.max(1,daily.length-1)),
  y:210-(v-min)/scale*145,value:v
 }:null);
 let line='';
 points.forEach((p,i)=>{if(p)line+=(i===0||!points[i-1]?'M ':'L ')+p.x+' '+p.y+' ';});
 if(line){
  const defs=svg('defs');
  const gradient=svg('linearGradient',{id:'av-trend-grad',x1:'0%',y1:'0%',x2:'0%',y2:'100%'});
  gradient.append(svg('stop',{offset:'0%','stop-color':'#50baa9','stop-opacity':'.38'}));
  gradient.append(svg('stop',{offset:'100%','stop-color':'#50baa9','stop-opacity':'0'}));
  defs.append(gradient);canvas.append(defs);
  const first=points.find(Boolean),last=[...points].reverse().find(Boolean);
  if(first&&last)canvas.append(svg('path',{
    d:line+'L '+last.x+' 232 L '+first.x+' 232 Z',fill:'url(#av-trend-grad)'
  }));
  canvas.append(svg('path',{d:line,fill:'none',stroke:'#68d0c2','stroke-width':3.2,
   'stroke-linecap':'round','stroke-linejoin':'round'}));
 }
 points.forEach((p,i)=>{
  if(p){
   const dot=svg('circle',{cx:p.x,cy:p.y,r:5,fill:'#73d6c5',stroke:'#092637','stroke-width':2});
   dot.append(svg('title',{},matrix.columns[i]+': '+format.format(p.value)+' scenario units'));
   canvas.append(dot);
  }
  const x=50+i*(640/Math.max(1,points.length-1));
  canvas.append(svg('text',{x,y:251,fill:'#9fb5c2','font-size':13,'text-anchor':'middle'},matrix.columns[i]));
 });
 host.append(canvas);
 const strip=element('div','av-dashboard-trend-key');
 strip.append(element('span','','● Modelled operating trend'),
   element('span','','Sample periods · not production history'));
 host.append(strip);
}
function renderFactoryPreview(host,source){
 const factory=factoryStationMap(source);
 const canvas=svg('svg',{viewBox:'0 0 640 295',class:'av-factory-preview',
  role:'img','aria-label':'Illustrative factory isometric topology. Open expanded 3D view to interact.'});
 const plot=pos=>({x:318+(pos.x-pos.z)*26,y:151+(pos.x+pos.z)*11-(pos.y||0)*20});
 for(let i=-9;i<=9;i++){
  const a=plot({x:-9,z:i}),b=plot({x:9,z:i});
  canvas.append(svg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#1f4654','stroke-width':.6}));
  const c=plot({x:i,z:-9}),d=plot({x:i,z:9});
  canvas.append(svg('line',{x1:c.x,y1:c.y,x2:d.x,y2:d.y,stroke:'#1f4654','stroke-width':.6}));
 }
 for(const [i,s] of factory.stations.entries()){
  const p=plot(s);
  const pts=[[p.x,p.y-20],[p.x+23,p.y-9],[p.x,p.y+2],[p.x-23,p.y-9]];
  const top=svg('polygon',{points:pts.map(a=>a.join(',')).join(' '),
   fill:i%3===0?'#69b4b9':'#7592b7',stroke:'#d7e4e5','stroke-width':.8});
  top.append(svg('title',{},s.label+' — scenario state '+s.status));
  canvas.append(top);
  canvas.append(svg('polygon',{points:(p.x-23)+','+(p.y-9)+' '+p.x+','+(p.y+2)+' '+p.x+','+(p.y+21)+' '+(p.x-23)+','+(p.y+10),fill:'#233d59'}));
  canvas.append(svg('polygon',{points:p.x+','+(p.y+2)+' '+(p.x+23)+','+(p.y-9)+' '+(p.x+23)+','+(p.y+10)+' '+p.x+','+(p.y+21),fill:'#315d73'}));
  canvas.append(svg('text',{x:p.x,y:p.y-31,'text-anchor':'middle',fill:'#d9e9f3','font-size':12},s.label));
 }
 host.append(canvas);
 const caption=element('div','av-factory-summary');
 caption.append(element('span','','◉ Isometric concept layout'),
   element('span','',factory.stations.length+' modelled cells'));
 host.append(caption);
}
function renderPreview(renderer,scenarioField){
 return host=>renderer(host,scenarioField);
}

/** Multi-panel executive cockpit composed of the existing, validated visual renderers. */
export function renderVisualOverview(host,scenario,{provenance='SYNTHETIC DEMO',onNavigate}={}){
 host.replaceChildren();
 const sankey=validateSankey(scenario.sankey),
  factory=factoryStationMap(scenario.factory),
  waterfall=waterfallSteps(scenario.waterfall),
  heatmap=heatmapCells(scenario.heatmap),
  timeline=timelineBars(scenario.timeline);
 const totalOrigin=sankey.nodes.filter(n=>n.incoming===0).reduce((s,n)=>s+n.outgoing,0);
 const terminal=sankey.nodes.filter(n=>n.outgoing===0).reduce((s,n)=>s+n.incoming,0);
 const series=heatmap.columns.map((_,i)=>{
  const vals=heatmap.rows.map(row=>row.values[i]).filter(Number.isFinite);
  return vals.length?vals.reduce((s,v)=>s+v,0)/vals.length:null;
 });
 const dashboard=element('div','av-dashboard');
 dashboard.setAttribute('aria-label','Illustration-style executive analytics cockpit with scenario data');
 const header=element('div','av-dashboard-heading');
 const copy=element('div');
 copy.append(element('p','av-dashboard-eyebrow','VAOS / ANALYTICS / EXECUTIVE COCKPIT'),
  element('h2','','Enterprise intelligence at a glance'),
  element('p','av-dashboard-subtitle',
   'Rich, explorable diagrams using '+(provenance==='SYNTHETIC DEMO'?'SYNTHETIC DEMO':'USER SUPPLIED · UNVERIFIED')+' values. No operational actuals are inferred.'));
 const actions=element('div','av-dashboard-actions');
 const view=element('button','av-dashboard-button','Inspect full Sankey ↗');
 view.type='button';view.dataset.openViz='sankey';actions.append(view);
 header.append(copy,actions);dashboard.append(header);
 const kpis=element('div','av-dashboard-kpis');
 createKpi(kpis,{eyebrow:'Origin flow',value:metricValue(totalOrigin),
  suffix:sankey.unit,note:'Synthetic / unverified material input',tone:'mint',spark:series});
 createKpi(kpis,{eyebrow:'Terminal flow',value:metricValue(terminal),
  suffix:sankey.unit,note:'Illustrative flow at final sinks',tone:'blue',spark:[totalOrigin,terminal]});
 createKpi(kpis,{eyebrow:'Scenario cost bridge',value:metricValue(waterfall.total,waterfall.unit),
  suffix:waterfall.unit,note:'Arithmetic example · not actual profit',tone:'gold',
  spark:waterfall.steps.map(s=>s.end)});
 createKpi(kpis,{eyebrow:'Factory stations',value:String(factory.stations.length),
  suffix:'modelled cells',note:'Synthetic layout · no connected machines',
  tone:'violet',spark:[factory.stations.length,factory.stations.length]});
 dashboard.append(kpis);
 const legend=element('div','av-dashboard-legend');
 legend.append(element('strong','','Visualization studio'),
  element('span','','8 connected views · interactive drill-down'),
  element('span','','SOURCE: '+(provenance==='SYNTHETIC DEMO'?'SYNTHETIC DEMO':'USER SUPPLIED · UNVERIFIED')));
 dashboard.append(legend);
 const grid=element('div','av-dashboard-grid');dashboard.append(grid);
 card(grid,{mode:'sankey',title:'Material & process flow',detail:'Inputs, branches, losses and final outputs',
  eyebrow:'01 / SANKEY ANALYTICS',wide:'wide',render:renderPreview(renderSankey,scenario.sankey)});
 card(grid,{mode:'heatmap',title:'Operational heatmap',detail:'Period-by-period workload density',
  eyebrow:'02 / INTENSITY',wide:'narrow',render:renderPreview(renderHeatmap,scenario.heatmap)});
 card(grid,{mode:'simulation',title:'Operating trend',detail:'Calculated from illustrative scenario samples',
  eyebrow:'03 / TREND INTELLIGENCE',wide:'half',render:host=>renderTrend(host,scenario)});
 card(grid,{mode:'waterfall',title:'Cost & margin bridge',detail:'Illustrative driver contribution',
  eyebrow:'04 / FINANCE',wide:'half',render:renderPreview(renderWaterfall,scenario.waterfall)});
 card(grid,{mode:'timeline',title:'Production Gantt',detail:timeline.tasks.length+' hypothetical work packages',
  eyebrow:'05 / PLANNING',wide:'half',render:renderPreview(renderTimeline,scenario.timeline)});
 card(grid,{mode:'factory',title:'Manufacturing digital layout',detail:'3D-ready stations; select to orbit and zoom',
  eyebrow:'06 / FACTORY',wide:'half',render:host=>renderFactoryPreview(host,scenario.factory)});
 card(grid,{mode:'funnel',title:'Customer journey funnel',detail:'Prospect stage progression in scenario',
  eyebrow:'07 / CRM',wide:'half',render:renderPreview(renderFunnel,scenario.funnel)});
 card(grid,{mode:'logistics',title:'Logistics control sketch',detail:'Coordinate-based path overview, no ETA',
  eyebrow:'08 / SUPPLY CHAIN',wide:'half',render:renderPreview(renderLogistics,scenario.logistics)});
 dashboard.append(element('p','av-dashboard-disclaimer',
  'Every number above belongs to the current synthetic or user-entered scenario. The UI does not convert these numbers into live telemetry, audited finance, approved planning or delivery performance.'));
 host.append(dashboard);
 for(const button of dashboard.querySelectorAll('[data-open-viz]')){
  button.addEventListener('click',()=>onNavigate?.(button.dataset.openViz));
 }
}
